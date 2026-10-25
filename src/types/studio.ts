/**
 * Shared studio data models and interfaces for audio-subtitles.
 * Used across the subtitle engine, FFmpeg service, live audio stream, and UI components.
 */

export interface SubtitleCue {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'txt' | 'json';

export type AppMode = 'transcribe' | 'live' | 'video' | 'editor';

export type EngineStatus = 'idle' | 'loading_model' | 'decoding' | 'processing' | 'done' | 'error';

export type FFmpegStage = 'idle' | 'loading' | 'extracting' | 'muxing' | 'burning' | 'done' | 'error';

export interface FFmpegProgress {
  stage: FFmpegStage;
  progress: number; // 0 to 100
  message?: string;
}

export interface LiveStreamStats {
  isActive: boolean;
  rmsLevel: number; // 0.0 to 1.0 for audio level visualization
  source: 'mic' | 'tab' | 'idle';
  error?: string;
}

export interface TranscriptionOptions {
  task?: 'transcribe' | 'translate';
  language?: string; // e.g. 'en', 'hi', or undefined for auto-detect
  modelId?: string;  // e.g. 'Xenova/whisper-base' or 'Xenova/whisper-tiny'
}
