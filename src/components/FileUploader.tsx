import { useRef, useState } from 'react';

interface FileUploaderProps {
    onFile: (file: File) => void;
    disabled?: boolean;
}

const ACCEPTED_FORMATS = '.mp3,.mp4,.ogg,.wav,.webm,.m4a,.aac,.flac,.opus,.oga';

export function FileUploader({ onFile, disabled }: FileUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);

    const handleFile = (file: File) => {
        setFileName(file.name);
        onFile(file);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    return (
        <div
            id="file-upload-zone"
            className={`uploader${dragOver ? ' drag-over' : ''}`}
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            role="button"
            aria-label="Upload audio file"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        >
            <span className="uploader__icon" aria-hidden>🎙️</span>
            <p className="uploader__text">Drop your audio file here or click to browse</p>
            <p className="uploader__subtext">Supports MP3, OGG, WAV, MP4, FLAC and more</p>
            {fileName && (
                <span className="uploader__file-name" id="selected-file-name">{fileName}</span>
            )}
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_FORMATS}
                style={{ display: 'none' }}
                onChange={onInputChange}
                id="file-input"
            />
        </div>
    );
}
