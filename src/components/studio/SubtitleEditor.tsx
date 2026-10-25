import { useState, useRef, useEffect } from 'react';
import type { SubtitleCue } from '../../types/studio';

interface SubtitleEditorProps {
  cues: SubtitleCue[];
  currentTime: number;
  onCueChange: (updatedCues: SubtitleCue[]) => void;
  onSeek: (timeInSeconds: number) => void;
  disabled?: boolean;
}

function formatShortTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
}

export function SubtitleEditor({
  cues,
  currentTime,
  onCueChange,
  onSeek,
  disabled = false,
}: SubtitleEditorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const activeCueRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active cue when playing
  useEffect(() => {
    if (autoScroll && activeCueRef.current) {
      activeCueRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentTime, autoScroll]);

  const handleTextChange = (id: string, newText: string) => {
    const updated = cues.map((c) => (c.id === id ? { ...c, text: newText } : c));
    onCueChange(updated);
  };

  const handleNudge = (id: string, field: 'start' | 'end', delta: number) => {
    const updated = cues.map((c) => {
      if (c.id !== id) return c;
      const newTime = Math.max(0, Number((c[field] + delta).toFixed(2)));
      return { ...c, [field]: newTime };
    });
    onCueChange(updated);
  };

  const handleDelete = (id: string) => {
    const updated = cues.filter((c) => c.id !== id);
    onCueChange(updated);
  };

  const handleAddCue = () => {
    const newCue: SubtitleCue = {
      id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      start: Number(currentTime.toFixed(2)),
      end: Number((currentTime + 3).toFixed(2)),
      text: 'New subtitle cue',
    };
    const updated = [...cues, newCue].sort((a, b) => a.start - b.start);
    onCueChange(updated);
  };

  const filteredCues = searchQuery.trim()
    ? cues.filter((c) => c.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : cues;

  return (
    <div className="subtitle-editor">
      <div className="subtitle-editor__header">
        <div className="subtitle-editor__title-row">
          <h3 className="subtitle-editor__title">
            Subtitle Timeline
            <span className="subtitle-editor__count-badge">{cues.length} cues</span>
          </h3>
          <div className="subtitle-editor__actions">
            <button
              type="button"
              className="btn-pill btn-pill--azure"
              onClick={handleAddCue}
              disabled={disabled}
              title="Add a new cue at the current playback position"
            >
              + Cue at {formatShortTime(currentTime)}
            </button>
            <label className="subtitle-editor__autoscroll-toggle">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              <span>Auto-scroll</span>
            </label>
          </div>
        </div>

        <div className="subtitle-editor__search-bar">
          <input
            type="text"
            className="input-crystalline"
            placeholder="Search subtitle text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="subtitle-editor__cue-list">
        {filteredCues.length === 0 ? (
          <div className="subtitle-editor__empty">
            {cues.length === 0
              ? 'No subtitles yet. Transcribe an audio/video file, start live captions, or import an SRT file.'
              : 'No cues match your search.'}
          </div>
        ) : (
          filteredCues.map((cue, index) => {
            const isActive = currentTime >= cue.start && currentTime <= (cue.end || cue.start + 3);
            const duration = Math.max(0, cue.end - cue.start).toFixed(1);

            return (
              <div
                key={cue.id}
                ref={isActive ? activeCueRef : null}
                className={`cue-card ${isActive ? 'cue-card--active' : ''}`}
              >
                <div className="cue-card__header">
                  <div className="cue-card__timing">
                    <span className="cue-card__index">#{index + 1}</span>
                    <button
                      type="button"
                      className="cue-card__play-btn"
                      aria-label="Jump to this cue in player"
                      onClick={() => onSeek(cue.start)}
                      title="Jump to this cue in player"
                    >
                      ▶ {formatShortTime(cue.start)}
                    </button>
                    <span className="cue-card__arrow">→</span>
                    <span className="cue-card__end-time">{formatShortTime(cue.end)}</span>
                    <span className="cue-card__duration">({duration}s)</span>
                  </div>

                  <div className="cue-card__controls">
                    <div className="cue-card__nudge-group">
                      <button
                        type="button"
                        className="cue-nudge-btn"
                        onClick={() => handleNudge(cue.id, 'start', -0.5)}
                        title="Start -0.5s"
                        disabled={disabled}
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        className="cue-nudge-btn"
                        onClick={() => handleNudge(cue.id, 'start', 0.5)}
                        title="Start +0.5s"
                        disabled={disabled}
                      >
                        +0.5s
                      </button>
                    </div>

                    <button
                      type="button"
                      className="cue-delete-btn"
                      onClick={() => handleDelete(cue.id)}
                      title="Delete cue"
                      disabled={disabled}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="cue-card__body">
                  <textarea
                    className="cue-textarea"
                    rows={2}
                    value={cue.text}
                    disabled={disabled}
                    onChange={(e) => handleTextChange(cue.id, e.target.value)}
                    placeholder="Enter subtitle text..."
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
