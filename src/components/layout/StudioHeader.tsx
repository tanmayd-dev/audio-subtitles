import type { AppMode, EngineStatus } from '../../types/studio';

export interface StudioHeaderProps {
  activeMode: AppMode;
  onSelectMode: (mode: AppMode) => void;
  engineStatus: EngineStatus;
  isModelReady: boolean;
}

interface ModeItem {
  id: AppMode;
  label: string;
  icon: string;
}

const MODES: ModeItem[] = [
  { id: 'transcribe', label: 'File Transcriber', icon: '📁' },
  { id: 'live', label: 'Live Captions', icon: '🎙️' },
  { id: 'video', label: 'Video Studio', icon: '🎬' },
  { id: 'editor', label: 'Subtitle Editor', icon: '📝' },
];

function getWhisperStatus(engineStatus: EngineStatus, isModelReady: boolean): {
  dotClass: string;
  text: string;
} {
  switch (engineStatus) {
    case 'loading_model':
      return { dotClass: 'jewel-dot--loading', text: 'Whisper Loading...' };
    case 'processing':
      return { dotClass: 'jewel-dot--processing', text: 'Whisper Active' };
    case 'decoding':
      return { dotClass: 'jewel-dot--loading', text: 'Decoding Audio...' };
    case 'error':
      return { dotClass: 'jewel-dot--error', text: 'Whisper Error' };
    case 'done':
      return { dotClass: 'jewel-dot--done', text: 'Whisper Ready' };
    case 'idle':
    default:
      if (isModelReady) {
        return { dotClass: 'jewel-dot--done', text: 'Whisper AI Ready' };
      }
      return { dotClass: 'jewel-dot--idle', text: 'Whisper Standby' };
  }
}

export function StudioHeader({
  activeMode,
  onSelectMode,
  engineStatus,
  isModelReady,
}: StudioHeaderProps) {
  const whisperStatus = getWhisperStatus(engineStatus, isModelReady);

  return (
    <header className="studio-header" role="banner">
      {/* ─── Rarity Brand Title & Chic Diamond Icon ─── */}
      <div className="studio-header__brand">
        <svg
          className="studio-brand-diamond"
          viewBox="0 0 32 32"
          width="32"
          height="32"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="headerGemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#dbeafe" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
            <linearGradient id="headerGemAccent" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#5e3bb8" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          {/* Faceted mini diamond */}
          <polygon
            points="16,2 26,10 29,18 24,28 16,30 8,28 3,18 6,10"
            fill="url(#headerGemGrad)"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth="0.8"
          />
          <polygon
            points="16,8 22,16 16,24 10,16"
            fill="#ffffff"
            opacity="0.65"
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth="0.5"
          />
          <polygon
            points="16,2 22,16 26,10"
            fill="url(#headerGemAccent)"
            opacity="0.8"
          />
          <polygon
            points="16,2 10,16 6,10"
            fill="url(#headerGemAccent)"
            opacity="0.7"
          />
          {/* Glisten point */}
          <circle cx="15" cy="13" r="1.2" fill="#ffffff" opacity="0.9" />
        </svg>

        <div className="studio-header__text-block">
          <h1 className="studio-header__title">Audio Subtitles</h1>
          <p className="studio-header__subtitle">
            In-Browser Subtitling Suite · 100% Private &amp; Local
          </p>
        </div>
      </div>

      {/* ─── Navigation Mode Pills ─── */}
      <nav className="studio-header__nav" aria-label="Studio Modes">
        <div className="nav-pill-container" role="tablist">
          {MODES.map((mode) => {
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`nav-pill ${isActive ? 'nav-pill--active' : ''}`}
                onClick={() => onSelectMode(mode.id)}
              >
                <span className="nav-pill__icon" aria-hidden="true">
                  {mode.icon}
                </span>
                <span className="nav-pill__label">{mode.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ─── Engine Status Pill (Whisper & FFmpeg status indicator) ─── */}
      <div className="studio-header__status">
        <div
          className="engine-status-pill jewel-badge"
          data-testid="engine-status-pill"
          title="In-browser client-side engine status"
        >
          <div className="engine-status-pill__item">
            <span
              className={`jewel-dot ${whisperStatus.dotClass}`}
              data-testid="whisper-status-dot"
            />
            <span className="engine-status-pill__text">{whisperStatus.text}</span>
          </div>

          <span className="engine-status-pill__divider" aria-hidden="true">
            ·
          </span>

          <div className="engine-status-pill__item">
            <span
              className="jewel-dot jewel-dot--done"
              data-testid="ffmpeg-status-dot"
            />
            <span className="engine-status-pill__text">FFmpeg WASM</span>
          </div>
        </div>
      </div>
    </header>
  );
}
