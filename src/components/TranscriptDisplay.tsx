import { useEffect, useRef, useState, useCallback } from 'react';
import type { TranscriptChunk } from '../utils/export';

interface TranscriptDisplayProps {
    chunks: TranscriptChunk[];
}

export function TranscriptDisplay({ chunks }: TranscriptDisplayProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chunks]);

    const handleCopy = useCallback(() => {
        const text = chunks.map((c) => c.text.trim()).filter(Boolean).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [chunks]);

    if (chunks.length === 0) {
        return (
            <div className="transcript-box" id="transcript-output">
                <span className="transcript-placeholder">
                    Transcription will appear here in real-time...
                </span>
            </div>
        );
    }

    return (
        <div className="transcript-wrapper">
            <div className="transcript-box" id="transcript-output">
                {chunks.map((chunk, i) => (
                    <span key={i}>{chunk.text} </span>
                ))}
                <div ref={bottomRef} />
            </div>
            <button
                className="copy-btn"
                onClick={handleCopy}
                title="Copy transcript to clipboard"
            >
                {copied ? '✓ Copied' : '📋 Copy'}
            </button>
        </div>
    );
}
