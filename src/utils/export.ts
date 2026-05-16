/**
 * Export utilities for generating SRT and TXT subtitle files
 * from Whisper model output chunks.
 */

export interface TranscriptChunk {
    timestamp: [number, number | null];
    text: string;
}

/**
 * Converts a time in seconds to the SRT time format: HH:MM:SS,mmm
 */
export function secondsToSrtTime(seconds: number): string {
    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalSecs = Math.floor(totalMs / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const pad3 = (n: number) => String(n).padStart(3, '0');

    return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)},${pad3(ms)}`;
}

/**
 * Generates a properly formatted .srt subtitle string from transcript chunks.
 */
export function generateSRT(chunks: TranscriptChunk[]): string {
    return chunks
        .map((chunk, index) => {
            const [start, end] = chunk.timestamp;
            const endTime = end ?? start + 5; // Fallback if end is null
            const startStr = secondsToSrtTime(start);
            const endStr = secondsToSrtTime(endTime);
            const text = chunk.text.trim();
            return `${index + 1}\n${startStr} --> ${endStr}\n${text}`;
        })
        .join('\n\n');
}

/**
 * Generates a plain text file (no timestamps) from transcript chunks.
 * Each subtitle segment is placed on its own line.
 */
export function generateTXT(chunks: TranscriptChunk[]): string {
    return chunks
        .map((c) => c.text.trim())
        .filter(Boolean)
        .join('\n');
}

/**
 * Triggers a native browser file download for a given string content.
 * Uses Blob + Object URL — no servers involved.
 */
export function downloadFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);

    // Trigger download
    anchor.click();

    // Delay cleanup to ensure the browser has time to register the download
    setTimeout(() => {
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
    }, 100);
}
