import type { FFmpegStage } from '../../types/studio';

interface FFmpegBurnModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoFile: File | null;
  hasCues: boolean;
  stage: FFmpegStage;
  progress: number;
  errorMessage?: string;
  onSoftMux: () => void;
  onHardBurn: () => void;
}

export function FFmpegBurnModal({
  isOpen,
  onClose,
  videoFile,
  hasCues,
  stage,
  progress,
  errorMessage,
  onSoftMux,
  onHardBurn,
}: FFmpegBurnModalProps) {
  if (!isOpen) return null;

  const isWorking = stage === 'loading' || stage === 'muxing' || stage === 'burning' || stage === 'extracting';

  return (
    <div className="modal-backdrop" onClick={() => !isWorking && onClose()}>
      <div className="modal-crystalline" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="modal-gem-icon">💎</span>
            <h3 className="modal-title">In-Browser Video Subtitling</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isWorking}
          >
            ✕
          </button>
        </div>

        <p className="modal-desc">
          Using in-browser WebAssembly (FFmpeg ASM/WASM). Your video never leaves your computer.
        </p>

        {videoFile && (
          <div className="modal-file-pill">
            <span className="modal-file-icon">🎬</span>
            <span className="modal-file-name">{videoFile.name}</span>
            <span className="modal-file-size">
              ({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
            </span>
          </div>
        )}

        {isWorking ? (
          <div className="modal-progress-box">
            <div className="modal-progress-status">
              <span className="jewel-dot jewel-dot--active" />
              <span className="modal-progress-label">
                {stage === 'loading' && 'Preparing FFmpeg WASM engine...'}
                {stage === 'muxing' && 'Embedding subtitle stream into container...'}
                {stage === 'burning' && `Rendering subtitles into video frames (${progress}%)...`}
                {stage === 'extracting' && 'Extracting audio track...'}
              </span>
            </div>
            <div className="progress-track-crystalline">
              <div
                className="progress-fill-crystalline progress-fill-crystalline--amethyst"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="modal-options">
            <div className="modal-option-card">
              <div className="modal-option-info">
                <h4 className="modal-option-title">⚡ Fast Softsub Muxing (Instant)</h4>
                <p className="modal-option-sub">
                  Embeds the subtitle track into the MP4/MKV container without re-encoding video.
                  Zero quality loss, finishes in 1–3 seconds.
                </p>
              </div>
              <button
                type="button"
                className="btn-crystalline btn-crystalline--azure"
                onClick={onSoftMux}
                disabled={!videoFile || !hasCues}
              >
                Mux Subtitles
              </button>
            </div>

            <div className="modal-option-card">
              <div className="modal-option-info">
                <h4 className="modal-option-title">🔥 Hardsub Burning (Permanent)</h4>
                <p className="modal-option-sub">
                  Burns the subtitles permanently into the video pixels using FFmpeg filters.
                  Compatible with all players, TV screens, and social media.
                </p>
              </div>
              <button
                type="button"
                className="btn-crystalline btn-crystalline--primary"
                onClick={onHardBurn}
                disabled={!videoFile || !hasCues}
              >
                Burn into Video
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="modal-error">
            <span>⚠ {errorMessage}</span>
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-pill btn-pill--ghost"
            onClick={onClose}
            disabled={isWorking}
          >
            {stage === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
