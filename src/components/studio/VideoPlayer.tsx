import { useRef, useEffect, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import type { SubtitleCue } from '../../types/studio';

export interface VideoPlayerHandle {
  seekTo: (timeInSeconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

interface VideoPlayerProps {
  videoFile: File | null;
  videoUrl?: string | null;
  cues: SubtitleCue[];
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange?: (duration: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { videoFile, videoUrl, cues, onTimeUpdate, onDurationChange },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeCueText, setActiveCueText] = useState<string>('');

  // Manage Blob URL for file
  const objectUrl = useMemo(() => {
    return videoFile ? URL.createObjectURL(videoFile) : null;
  }, [videoFile]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  const internalUrl = videoUrl || objectUrl;

  useImperativeHandle(ref, () => ({
    seekTo: (timeInSeconds: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = timeInSeconds;
      }
    },
    play: () => {
      videoRef.current?.play().catch(() => {});
    },
    pause: () => {
      videoRef.current?.pause();
    },
    getCurrentTime: () => {
      return videoRef.current?.currentTime ?? 0;
    },
  }));

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    onTimeUpdate(t);

    // Find active cue
    const active = cues.find((c) => t >= c.start && t <= (c.end || c.start + 3));
    setActiveCueText(active ? active.text.trim() : '');
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && onDurationChange) {
      onDurationChange(videoRef.current.duration);
    }
  };

  if (!internalUrl) {
    return (
      <div className="video-player-placeholder">
        <div className="video-player-placeholder__icon">🎬</div>
        <p className="video-player-placeholder__text">No video loaded</p>
        <span className="video-player-placeholder__sub">
          Drop or select a video file (.mp4, .webm, .mkv, .mov)
        </span>
      </div>
    );
  }

  return (
    <div className="video-player-container">
      <video
        ref={videoRef}
        src={internalUrl}
        controls
        playsInline
        className="video-element"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />
      {activeCueText && (
        <div className="subtitle-overlay" aria-live="polite">
          <span className="subtitle-overlay__text">{activeCueText}</span>
        </div>
      )}
    </div>
  );
});
