import { useRef, useEffect, useState } from 'react';
import type { SubtitleCue } from '../../types/studio';

interface TeleprompterViewProps {
  cues: SubtitleCue[];
  isRecording: boolean;
  onClear: () => void;
  onCopy: () => void;
  copied: boolean;
}

export function TeleprompterView({
  cues,
  isRecording,
  onClear,
  onCopy,
  copied,
}: TeleprompterViewProps) {
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('large');
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cues]);

  const sizeClass = {
    normal: 'teleprompter-text--normal',
    large: 'teleprompter-text--large',
    xlarge: 'teleprompter-text--xlarge',
  }[fontSize];

  return (
    <div className="teleprompter">
      <div className="teleprompter__toolbar">
        <div className="teleprompter__status">
          <span
            className={`jewel-dot ${isRecording ? 'jewel-dot--active' : 'jewel-dot--idle'}`}
          />
          <span className="teleprompter__status-text">
            {isRecording ? 'LIVE TRANSCRIBING' : 'READY TO RECORD'}
          </span>
        </div>

        <div className="teleprompter__controls">
          <div className="btn-group-pill">
            <button
              type="button"
              className={`pill-btn ${fontSize === 'normal' ? 'pill-btn--active' : ''}`}
              onClick={() => setFontSize('normal')}
            >
              A
            </button>
            <button
              type="button"
              className={`pill-btn ${fontSize === 'large' ? 'pill-btn--active' : ''}`}
              onClick={() => setFontSize('large')}
            >
              A+
            </button>
            <button
              type="button"
              className={`pill-btn ${fontSize === 'xlarge' ? 'pill-btn--active' : ''}`}
              onClick={() => setFontSize('xlarge')}
            >
              A++
            </button>
          </div>

          <button
            type="button"
            className="btn-pill btn-pill--ghost"
            onClick={onCopy}
            disabled={cues.length === 0}
          >
            {copied ? '✓ Copied' : '📋 Copy All'}
          </button>

          <button
            type="button"
            className="btn-pill btn-pill--ghost"
            onClick={onClear}
            disabled={cues.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <div className={`teleprompter__display ${sizeClass}`}>
        {cues.length === 0 ? (
          <div className="teleprompter__placeholder">
            {isRecording
              ? 'Listening for speech... Subtitles will stream in real time.'
              : 'Click "Start Microphone" or "Capture Tab Audio" to begin live subtitling.'}
          </div>
        ) : (
          <div className="teleprompter__content">
            {cues.map((cue, i) => (
              <span key={cue.id || i} className="teleprompter__chunk">
                {cue.text}{' '}
              </span>
            ))}
            <div ref={scrollEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
