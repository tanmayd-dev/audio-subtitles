/**
 * Export utilities for generating SRT and TXT subtitle files
 * from Whisper model output chunks or SubtitleCue objects.
 * Re-exports the unified subtitle engine for backwards compatibility.
 */

export type { TranscriptChunk, SubtitleCue, SubtitleFormat, SubtitleItem } from './subtitles';
export {
  chunkToCue,
  cueToChunk,
  chunksToCues,
  cuesToChunks,
  secondsToTimecode,
  secondsToSrtTime,
  timecodeToSeconds,
  sortCues,
  nudgeCue,
  splitCue,
  mergeCues,
  parseSRT,
  parseVTT,
  generateSRT,
  generateVTT,
  generateASS,
  generateTXT,
  generateJSON,
  downloadFile,
} from './subtitles';
