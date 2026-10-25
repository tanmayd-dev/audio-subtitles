import React, { useMemo } from 'react';

export interface AudioVisualizerProps {
  isActive: boolean;
  rmsLevel: number; // 0.0 to 1.0
  source: 'mic' | 'tab' | 'idle';
  className?: string;
}

const BAR_COUNT = 24;

/**
 * Pre-computes aesthetic frequency weightings for the 24 visualizer bars
 * mimicking an acoustic EQ curve (accentuated mid-range vocals).
 */
const BAR_WEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const norm = i / (BAR_COUNT - 1);
  // Center-weighted arch with slight high-frequency presence
  const arch = Math.sin(norm * Math.PI);
  const variance = 0.75 + 0.25 * Math.sin(i * 1.8);
  return arch * variance;
});

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isActive,
  rmsLevel,
  source,
  className = '',
}) => {
  const clampedRms = Math.min(1, Math.max(0, rmsLevel));
  const percentage = Math.round(clampedRms * 100);

  // Compute heights for each frequency bar based on current RMS
  const barHeights = useMemo(() => {
    return BAR_WEIGHTS.map((weight) => {
      if (!isActive) return 6; // Rest height
      // Base dynamic height scaled by RMS + baseline
      const dynamic = clampedRms * 94 * weight * 1.3;
      return Math.min(100, Math.max(6, Math.round(dynamic)));
    });
  }, [isActive, clampedRms]);

  const sourceLabel = useMemo(() => {
    if (!isActive) return 'Standby';
    switch (source) {
      case 'mic':
        return 'Live Microphone';
      case 'tab':
        return 'Tab / System Audio';
      default:
        return 'Live Audio';
    }
  }, [isActive, source]);

  return (
    <div
      className={`crystalline-visualizer ${isActive ? 'crystalline-visualizer--active' : ''} ${className}`}
      role="region"
      aria-label="Live audio stream visualizer"
    >
      <style>{`
        .crystalline-visualizer {
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(94, 59, 184, 0.18);
          border-radius: 14px;
          padding: 18px 22px;
          box-shadow: 0 8px 28px rgba(94, 59, 184, 0.06);
          position: relative;
          overflow: hidden;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .crystalline-visualizer--active {
          border-color: rgba(56, 189, 248, 0.5);
          box-shadow: 0 10px 32px rgba(56, 189, 248, 0.14), 0 0 1px 1px rgba(94, 59, 184, 0.2);
        }

        .crystalline-visualizer__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .crystalline-visualizer__status {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* Jewel pulsing mic indicator */
        .jewel-indicator {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(94, 59, 184, 0.08);
          border: 1px solid rgba(94, 59, 184, 0.2);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .jewel-indicator--active {
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(94, 59, 184, 0.25) 100%);
          border-color: #38bdf8;
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.6);
          animation: jewelPulse 1.8s infinite ease-in-out;
        }

        @keyframes jewelPulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 8px rgba(56, 189, 248, 0.4), 0 0 0 0 rgba(56, 189, 248, 0.4);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 20px rgba(56, 189, 248, 0.8), 0 0 0 6px rgba(94, 59, 184, 0.1);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 8px rgba(56, 189, 248, 0.4), 0 0 0 0 rgba(56, 189, 248, 0);
          }
        }

        .jewel-gem-svg {
          width: 18px;
          height: 18px;
          display: block;
        }

        .crystalline-visualizer__title-group {
          display: flex;
          flex-direction: column;
        }

        .crystalline-visualizer__source-title {
          font-size: 0.92rem;
          font-weight: 700;
          color: #1e1b4b;
          letter-spacing: -0.01em;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .crystalline-visualizer__sub {
          font-size: 0.72rem;
          font-family: var(--font-mono, monospace);
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .crystalline-visualizer__meter-value {
          font-family: var(--font-mono, monospace);
          font-size: 0.82rem;
          font-weight: 700;
          color: ${isActive ? '#5e3bb8' : '#94a3b8'};
          background: rgba(94, 59, 184, 0.08);
          border: 1px solid rgba(94, 59, 184, 0.14);
          padding: 4px 10px;
          border-radius: 99px;
          letter-spacing: 0.04em;
        }

        /* Equalizer Bars Container */
        .crystalline-bars {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          height: 56px;
          gap: 3px;
          padding: 6px 4px 2px;
          background: rgba(248, 249, 252, 0.6);
          border-radius: 10px;
          border: 1px solid rgba(94, 59, 184, 0.08);
        }

        .crystalline-bar {
          flex: 1;
          min-width: 4px;
          max-width: 12px;
          border-radius: 3px;
          background: ${
            isActive
              ? 'linear-gradient(180deg, #38bdf8 0%, #5e3bb8 100%)'
              : 'rgba(148, 163, 184, 0.25)'
          };
          transition: height 0.08s ease-out, background 0.25s ease;
        }

        /* Horizontal VU / Peak Bar */
        .crystalline-vu-bar {
          margin-top: 10px;
          height: 5px;
          background: rgba(94, 59, 184, 0.08);
          border-radius: 99px;
          overflow: hidden;
          position: relative;
        }

        .crystalline-vu-bar__fill {
          height: 100%;
          border-radius: 99px;
          background: linear-gradient(90deg, #38bdf8 0%, #5e3bb8 75%, #ec4899 100%);
          transition: width 0.08s ease-out;
        }
      `}</style>

      {/* Header with jewel indicator & stream state */}
      <div className="crystalline-visualizer__header">
        <div className="crystalline-visualizer__status">
          <div
            className={`jewel-indicator ${isActive ? 'jewel-indicator--active' : ''}`}
            title={isActive ? `Recording from ${sourceLabel}` : 'Audio capture is inactive'}
          >
            {source === 'mic' && isActive ? (
              <svg
                className="jewel-gem-svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#5e3bb8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            ) : source === 'tab' && isActive ? (
              <svg
                className="jewel-gem-svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#5e3bb8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="20" height="14" x="2" y="3" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            ) : (
              // Crystalline diamond icon for idle or default
              <svg
                className="jewel-gem-svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 3h12l4 7-10 11L2 10l4-7Z" />
                <path d="M11 3 8 10l4 11 4-11-3-7" />
                <path d="M2 10h20" />
              </svg>
            )}
          </div>

          <div className="crystalline-visualizer__title-group">
            <span className="crystalline-visualizer__source-title">{sourceLabel}</span>
            <span className="crystalline-visualizer__sub">
              {isActive ? 'Whisper 16kHz Streaming' : 'Ready to capture'}
            </span>
          </div>
        </div>

        <div className="crystalline-visualizer__meter-value">
          {isActive ? `${percentage}%` : '0%'}
        </div>
      </div>

      {/* Equalizer Frequency Bars */}
      <div className="crystalline-bars" aria-hidden="true">
        {barHeights.map((h, i) => (
          <div
            key={i}
            className="crystalline-bar"
            style={{
              height: `${h}%`,
              opacity: isActive ? 0.35 + (h / 100) * 0.65 : 0.4,
            }}
          />
        ))}
      </div>

      {/* Fine VU level bar */}
      <div className="crystalline-vu-bar" aria-hidden="true">
        <div
          className="crystalline-vu-bar__fill"
          style={{ width: `${isActive ? percentage : 0}%` }}
        />
      </div>
    </div>
  );
};
