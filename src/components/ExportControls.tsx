import type { TranscriptChunk } from '../utils/export';
import type { SubtitleCue } from '../types/studio';
import {
  generateSRT,
  generateVTT,
  generateASS,
  generateTXT,
  generateJSON,
  downloadFile,
  chunksToCues,
} from '../utils/subtitles';

interface ExportControlsProps {
  chunks?: TranscriptChunk[];
  cues?: SubtitleCue[];
  baseFileName: string;
  disabled?: boolean;
  isVideoLoaded?: boolean;
  onOpenVideoBurn?: () => void;
}

export function ExportControls({
  chunks = [],
  cues,
  baseFileName,
  disabled = false,
  isVideoLoaded = false,
  onOpenVideoBurn,
}: ExportControlsProps) {
  const baseName = baseFileName.replace(/\.[^/.]+$/, '') || 'subtitles';
  const effectiveCues: SubtitleCue[] = cues ?? chunksToCues(chunks);
  const isEmpty = effectiveCues.length === 0;

  const handleExport = (format: 'srt' | 'vtt' | 'ass' | 'txt' | 'json') => {
    let content = '';
    let ext = format;

    switch (format) {
      case 'srt':
        content = generateSRT(effectiveCues);
        ext = 'srt';
        break;
      case 'vtt':
        content = generateVTT(effectiveCues);
        ext = 'vtt';
        break;
      case 'ass':
        content = generateASS(effectiveCues, baseName);
        ext = 'ass';
        break;
      case 'txt':
        content = generateTXT(effectiveCues);
        ext = 'txt';
        break;
      case 'json':
        content = generateJSON(effectiveCues);
        ext = 'json';
        break;
    }

    downloadFile(content, `${baseName}.${ext}`);
  };

  return (
    <div className="export-controls-container">
      <div className="btn-group">
        <button
          id="export-srt-btn"
          className="btn btn--primary"
          onClick={() => handleExport('srt')}
          disabled={disabled || isEmpty}
          title="Download subtitles as SRT (with timestamps)"
        >
          ⬇ Export SRT
        </button>

        <button
          id="export-vtt-btn"
          className="btn btn--azure"
          onClick={() => handleExport('vtt')}
          disabled={disabled || isEmpty}
          title="Download WebVTT subtitles"
        >
          ⬇ Export VTT
        </button>

        <button
          id="export-ass-btn"
          className="btn btn--ghost"
          onClick={() => handleExport('ass')}
          disabled={disabled || isEmpty}
          title="Download styled ASS subtitles (Rarity Haute Couture styling)"
        >
          ✨ Export ASS
        </button>

        <button
          id="export-txt-btn"
          className="btn btn--blue"
          onClick={() => handleExport('txt')}
          disabled={disabled || isEmpty}
          title="Download transcript as plain text (no timestamps)"
        >
          ⬇ Export TXT
        </button>

        <button
          id="export-json-btn"
          className="btn btn--ghost"
          onClick={() => handleExport('json')}
          disabled={disabled || isEmpty}
          title="Download subtitles as structured JSON"
        >
          {'{ }'} JSON
        </button>

        {onOpenVideoBurn && (
          <button
            id="open-video-burn-btn"
            className="btn btn--primary"
            onClick={onOpenVideoBurn}
            disabled={disabled || isEmpty || !isVideoLoaded}
            title={
              isVideoLoaded
                ? 'Mux or Burn subtitles into video with in-browser FFmpeg WASM'
                : 'Load a video file first to burn subtitles'
            }
          >
            🎬 Burn / Mux Video (FFmpeg)
          </button>
        )}
      </div>
    </div>
  );
}
