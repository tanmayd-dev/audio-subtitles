import type { TranscriptChunk } from '../utils/export';
import { generateSRT, generateTXT, downloadFile } from '../utils/export';

interface ExportControlsProps {
    chunks: TranscriptChunk[];
    baseFileName: string;
    disabled?: boolean;
}

export function ExportControls({ chunks, baseFileName, disabled }: ExportControlsProps) {
    const baseName = baseFileName.replace(/\.[^/.]+$/, '') || 'subtitles';

    const handleSRT = () => {
        downloadFile(generateSRT(chunks), `${baseName}.srt`);
    };

    const handleTXT = () => {
        downloadFile(generateTXT(chunks), `${baseName}.txt`);
    };

    return (
        <div className="btn-group">
            <button
                id="export-srt-btn"
                className="btn btn--primary"
                onClick={handleSRT}
                disabled={disabled || chunks.length === 0}
                title="Download subtitles as SRT (with timestamps)"
            >
                ⬇ Export SRT
            </button>
            <button
                id="export-txt-btn"
                className="btn btn--blue"
                onClick={handleTXT}
                disabled={disabled || chunks.length === 0}
                title="Download transcript as plain text (no timestamps)"
            >
                ⬇ Export TXT
            </button>
        </div>
    );
}
