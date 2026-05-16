/**
 * Whisper Web Worker
 * Runs the Xenova/whisper-base multilingual ASR pipeline off the main thread.
 * Supports English, Hindi and mixed (code-switching) audio.
 *
 * Progress tracking: We manually split audio into ~30s chunks and call the
 * pipeline for each one. This lets us report real progress between chunks
 * since the transformers.js v3 ASR pipeline has no per-token callback support.
 *
 * Messages sent TO this worker:
 *   { type: 'load' }               — initialise the pipeline
 *   { type: 'transcribe', audio: Float32Array } — begin transcription
 *
 * Messages sent FROM this worker:
 *   { type: 'model_loading_progress', progress: number } — 0-100
 *   { type: 'model_ready' }
 *   { type: 'transcription_progress', progress: number } — 0-100
 *   { type: 'chunk', data: { timestamp: [number, number|null], text: string } }
 *   { type: 'complete', chunks: TranscriptChunk[] }
 *   { type: 'error', message: string }
 */

import { pipeline, env } from '@huggingface/transformers';

// Use the browser's Cache API for model weights to prevent re-downloading.
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'Xenova/whisper-base';
const SAMPLE_RATE = 16000;
const CHUNK_SECS = 30;
const OVERLAP_SECS = 2; // small overlap to avoid cutting mid-word

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;

interface ChunkResult {
    timestamp: [number, number | null];
    text: string;
}

self.addEventListener('message', async (event: MessageEvent) => {
    const { type } = event.data as { type: string; audio?: Float32Array };

    if (type === 'load') {
        try {
            asr = await pipeline(
                'automatic-speech-recognition',
                MODEL_ID,
                {
                    progress_callback: (progressEvent: { progress?: number; status?: string }) => {
                        if (progressEvent.status === 'downloading' || progressEvent.status === 'progress') {
                            const pct = Math.round(progressEvent.progress ?? 0);
                            self.postMessage({ type: 'model_loading_progress', progress: pct });
                        }
                    },
                }
            );

            self.postMessage({ type: 'model_ready' });
        } catch (err) {
            self.postMessage({ type: 'error', message: String(err) });
        }
    }

    if (type === 'transcribe') {
        if (!asr) {
            self.postMessage({ type: 'error', message: 'Model not loaded. Send a "load" message first.' });
            return;
        }

        const audio = event.data.audio as Float32Array;
        if (!audio || audio.length === 0) {
            self.postMessage({ type: 'error', message: 'No audio data received.' });
            return;
        }

        try {
            const totalSamples = audio.length;
            const totalDuration = totalSamples / SAMPLE_RATE;
            const chunkSamples = CHUNK_SECS * SAMPLE_RATE;
            const overlapSamples = OVERLAP_SECS * SAMPLE_RATE;
            const stepSamples = chunkSamples - overlapSamples;

            // If audio is short enough for one pass, process directly
            if (totalDuration <= CHUNK_SECS + 5) {
                self.postMessage({ type: 'transcription_progress', progress: 10 });

                const output = await asr(audio, {
                    return_timestamps: true,
                    language: undefined,
                    task: 'transcribe',
                });

                const chunks: ChunkResult[] =
                    (output as { chunks?: ChunkResult[] }).chunks ?? [];

                for (const chunk of chunks) {
                    self.postMessage({ type: 'chunk', data: chunk });
                }

                self.postMessage({ type: 'transcription_progress', progress: 100 });
                self.postMessage({ type: 'complete', chunks });
                return;
            }

            // Split audio into overlapping windows and process each one
            const allChunks: ChunkResult[] = [];
            let offset = 0;
            let segmentIndex = 0;
            const totalSegments = Math.ceil(totalSamples / stepSamples);

            while (offset < totalSamples) {
                const end = Math.min(offset + chunkSamples, totalSamples);
                const segment = audio.slice(offset, end);
                const segmentOffsetSecs = offset / SAMPLE_RATE;

                // Report progress at the START of each segment
                const progressPct = Math.round((segmentIndex / totalSegments) * 95);
                self.postMessage({ type: 'transcription_progress', progress: progressPct });

                // Transcribe this segment (no chunking — it's already <30s)
                const output = await asr(segment, {
                    return_timestamps: true,
                    language: undefined,
                    task: 'transcribe',
                });

                const segChunks: ChunkResult[] =
                    (output as { chunks?: ChunkResult[] }).chunks ?? [];

                // Adjust timestamps to be relative to the full audio
                for (const chunk of segChunks) {
                    const adjusted: ChunkResult = {
                        timestamp: [
                            chunk.timestamp[0] + segmentOffsetSecs,
                            chunk.timestamp[1] != null
                                ? chunk.timestamp[1] + segmentOffsetSecs
                                : null,
                        ],
                        text: chunk.text,
                    };
                    allChunks.push(adjusted);
                    self.postMessage({ type: 'chunk', data: adjusted });
                }

                segmentIndex++;
                offset += stepSamples;
            }

            // Deduplicate overlapping text from the overlap regions
            const deduped = deduplicateChunks(allChunks);

            self.postMessage({ type: 'transcription_progress', progress: 100 });
            self.postMessage({ type: 'complete', chunks: deduped });
        } catch (err) {
            self.postMessage({ type: 'error', message: String(err) });
        }
    }
});

/**
 * Simple deduplication of chunks that may have been generated from
 * overlapping audio segments. Removes chunks whose text is a substring
 * of an adjacent chunk or whose timestamps overlap significantly.
 */
function deduplicateChunks(chunks: ChunkResult[]): ChunkResult[] {
    if (chunks.length <= 1) return chunks;

    const result: ChunkResult[] = [chunks[0]];

    for (let i = 1; i < chunks.length; i++) {
        const prev = result[result.length - 1];
        const curr = chunks[i];

        // Skip if the current chunk's text is essentially the same as previous
        const prevText = prev.text.trim().toLowerCase();
        const currText = curr.text.trim().toLowerCase();

        if (currText === prevText) continue;
        if (prevText.includes(currText)) continue;

        // Skip if timestamps overlap heavily (>80% overlap)
        const prevEnd = prev.timestamp[1] ?? prev.timestamp[0] + 5;
        const currStart = curr.timestamp[0];
        if (currStart < prevEnd - 1) {
            // Overlapping — keep the longer one
            if (currText.length > prevText.length) {
                result[result.length - 1] = curr;
            }
            continue;
        }

        result.push(curr);
    }

    return result;
}
