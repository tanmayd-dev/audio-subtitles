/**
 * Subtitle Engine & Multi-Format Serializers.
 * Supports SRT, WebVTT, ASS (Advanced SubStation Alpha), plain TXT, and JSON formats.
 * Includes cue manipulation utilities (nudge, split, merge, sort) and timecode conversions.
 */

import type { SubtitleCue, SubtitleFormat } from '../types/studio';

export type { SubtitleCue, SubtitleFormat };

/**
 * Backwards compatibility interface for Whisper transcript chunks.
 */
export interface TranscriptChunk {
  timestamp: [number, number | null];
  text: string;
}

/**
 * Union type supporting both SubtitleCue and TranscriptChunk across generators.
 */
export type SubtitleItem = SubtitleCue | TranscriptChunk;

/**
 * Type guard to check if an item is a TranscriptChunk.
 */
export function isTranscriptChunk(item: SubtitleItem): item is TranscriptChunk {
  return 'timestamp' in item && Array.isArray((item as TranscriptChunk).timestamp);
}

/**
 * Converts a TranscriptChunk to a SubtitleCue.
 */
export function chunkToCue(chunk: TranscriptChunk, index: number = 0): SubtitleCue {
  const start = chunk.timestamp[0];
  const end = chunk.timestamp[1] ?? (start + 5);
  return {
    id: `cue-${index + 1}`,
    start,
    end,
    text: chunk.text.trim(),
  };
}

/**
 * Converts a SubtitleCue to a TranscriptChunk.
 */
export function cueToChunk(cue: SubtitleCue): TranscriptChunk {
  return {
    timestamp: [cue.start, cue.end],
    text: cue.text,
  };
}

/**
 * Converts an array of TranscriptChunk to SubtitleCue[].
 */
export function chunksToCues(chunks: TranscriptChunk[]): SubtitleCue[] {
  return chunks.map((chunk, index) => chunkToCue(chunk, index));
}

/**
 * Converts an array of SubtitleCue to TranscriptChunk[].
 */
export function cuesToChunks(cues: SubtitleCue[]): TranscriptChunk[] {
  return cues.map(cueToChunk);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');

/**
 * Formats a duration in seconds into standard timecode for 'srt', 'vtt', or 'ass'.
 *
 * - srt: HH:MM:SS,mmm
 * - vtt: HH:MM:SS.mmm
 * - ass: H:MM:SS.cc
 */
export function secondsToTimecode(seconds: number, format: 'srt' | 'vtt' | 'ass'): string {
  const safeSeconds = Math.max(0, isNaN(seconds) || !isFinite(seconds) ? 0 : seconds);

  if (format === 'ass') {
    const totalCs = Math.round(safeSeconds * 100);
    const cs = totalCs % 100;
    const totalSecs = Math.floor(totalCs / 100);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);
    return `${hours}:${pad2(mins)}:${pad2(secs)}.${pad2(cs)}`;
  }

  const totalMs = Math.round(safeSeconds * 1000);
  const ms = totalMs % 1000;
  const totalSecs = Math.floor(totalMs / 1000);
  const secs = totalSecs % 60;
  const totalMins = Math.floor(totalSecs / 60);
  const mins = totalMins % 60;
  const hours = Math.floor(totalMins / 60);

  if (format === 'vtt') {
    return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}.${pad3(ms)}`;
  }

  // default: srt
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)},${pad3(ms)}`;
}

/**
 * Legacy alias for secondsToTimecode(seconds, 'srt').
 */
export function secondsToSrtTime(seconds: number): string {
  return secondsToTimecode(seconds, 'srt');
}

/**
 * Parses any standard subtitle timecode (SRT, VTT, ASS, or short MM:SS.mmm) to seconds.
 */
export function timecodeToSeconds(timecode: string): number {
  if (!timecode || typeof timecode !== 'string') return 0;
  // Take the first whitespace-separated segment to strip any VTT cue settings
  const firstToken = timecode.trim().split(/\s+/)[0];
  if (!firstToken) return 0;

  const normalized = firstToken.replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return Number((hours * 3600 + minutes * 60 + seconds).toFixed(3));
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return Number((minutes * 60 + seconds).toFixed(3));
  } else if (parts.length === 1) {
    const seconds = parseFloat(parts[0]) || 0;
    return Number(seconds.toFixed(3));
  }

  return 0;
}

/**
 * Sorts cues chronologically by start time, then end time.
 * Returns a new array without mutating the original.
 */
export function sortCues(cues: SubtitleCue[]): SubtitleCue[] {
  return [...cues].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });
}

/**
 * Shifts a cue's start and end times by deltaSeconds.
 * Times are clamped to >= 0 and end is guaranteed >= start.
 */
export function nudgeCue(cue: SubtitleCue, deltaSeconds: number): SubtitleCue {
  const newStart = Math.max(0, Number((cue.start + deltaSeconds).toFixed(3)));
  const newEnd = Math.max(newStart, Number((cue.end + deltaSeconds).toFixed(3)));
  return {
    ...cue,
    start: newStart,
    end: newEnd,
  };
}

/**
 * Splits a single cue into two cues at splitTime.
 * Words or lines in the cue text are divided proportionally to the split position.
 */
export function splitCue(cue: SubtitleCue, splitTime: number): [SubtitleCue, SubtitleCue] {
  const duration = cue.end - cue.start;
  const clampedSplit = Number(Math.max(cue.start, Math.min(cue.end, splitTime)).toFixed(3));

  if (duration <= 0 || clampedSplit <= cue.start) {
    return [
      { id: `${cue.id}-1`, start: cue.start, end: cue.start, text: '' },
      { id: `${cue.id}-2`, start: cue.start, end: cue.end, text: cue.text.trim() },
    ];
  }

  if (clampedSplit >= cue.end) {
    return [
      { id: `${cue.id}-1`, start: cue.start, end: cue.end, text: cue.text.trim() },
      { id: `${cue.id}-2`, start: cue.end, end: cue.end, text: '' },
    ];
  }

  const ratio = (clampedSplit - cue.start) / duration;
  let text1 = '';
  let text2 = '';

  const rawText = cue.text.trim();
  if (rawText.includes('\n')) {
    const lines = rawText.split('\n');
    const splitIndex = Math.max(1, Math.min(lines.length - 1, Math.round(lines.length * ratio)));
    text1 = lines.slice(0, splitIndex).join('\n').trim();
    text2 = lines.slice(splitIndex).join('\n').trim();
  } else {
    const words = rawText.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
      text1 = rawText;
      text2 = '';
    } else {
      const splitIndex = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
      text1 = words.slice(0, splitIndex).join(' ');
      text2 = words.slice(splitIndex).join(' ');
    }
  }

  return [
    {
      id: `${cue.id}-1`,
      start: cue.start,
      end: clampedSplit,
      text: text1,
    },
    {
      id: `${cue.id}-2`,
      start: clampedSplit,
      end: cue.end,
      text: text2,
    },
  ];
}

/**
 * Merges multiple cues into a single cue spanning the minimum start to maximum end time.
 * Text is joined with single spaces.
 */
export function mergeCues(cues: SubtitleCue[]): SubtitleCue {
  if (!cues || cues.length === 0) {
    return { id: 'cue-empty', start: 0, end: 0, text: '' };
  }
  const sorted = sortCues(cues);
  const start = sorted[0].start;
  const end = Math.max(...sorted.map((c) => c.end));
  const text = sorted
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(' ');
  return {
    id: sorted[0].id,
    start,
    end,
    text,
  };
}

/**
 * Parses SRT formatted text into SubtitleCue[].
 */
export function parseSRT(text: string): SubtitleCue[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = clean.split(/\n\s*\n+/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n').map((l) => l.trimEnd());
    if (lines.length === 0) continue;

    const timeIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeIndex === -1) continue;

    const timeLine = lines[timeIndex];
    const match = timeLine.match(/([0-9:.,]+)\s*-->\s*([0-9:.,]+)/);
    if (!match) continue;

    const start = timecodeToSeconds(match[1]);
    const end = timecodeToSeconds(match[2]);

    const idLine = lines.slice(0, timeIndex).join(' ').trim();
    const id = idLine || `cue-${i + 1}`;
    const textContent = lines.slice(timeIndex + 1).join('\n').trim();

    cues.push({
      id,
      start,
      end,
      text: textContent,
    });
  }

  return cues;
}

/**
 * Parses WebVTT formatted text into SubtitleCue[].
 * Handles optional cue IDs, NOTE / STYLE / REGION blocks, and WebVTT settings.
 */
export function parseVTT(text: string): SubtitleCue[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = clean.split(/\n\s*\n+/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const rawBlock = blocks[i].trim();
    if (!rawBlock) continue;

    // Skip WEBVTT header if standalone
    if (rawBlock.startsWith('WEBVTT') && !rawBlock.includes('-->')) {
      continue;
    }

    // Skip NOTE comments and styling blocks
    if (
      rawBlock.startsWith('NOTE') ||
      rawBlock.startsWith('STYLE') ||
      rawBlock.startsWith('REGION')
    ) {
      continue;
    }

    const lines = rawBlock.split('\n').map((l) => l.trimEnd());
    const timeIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeIndex === -1) continue;

    const timeLine = lines[timeIndex];
    const match = timeLine.match(/([0-9:.,]+)\s*-->\s*([0-9:.,]+)/);
    if (!match) continue;

    const start = timecodeToSeconds(match[1]);
    const end = timecodeToSeconds(match[2]);

    const headerLines = lines.slice(0, timeIndex).filter((l) => !l.startsWith('WEBVTT'));
    const id = headerLines.join(' ').trim() || `cue-${cues.length + 1}`;
    const textContent = lines.slice(timeIndex + 1).join('\n').trim();

    cues.push({
      id,
      start,
      end,
      text: textContent,
    });
  }

  return cues;
}

/**
 * Generates an SRT formatted subtitle string from cues or transcript chunks.
 */
export function generateSRT(items: SubtitleItem[]): string {
  if (!items || items.length === 0) return '';
  return items
    .map((item, index) => {
      let start: number;
      let end: number;
      let text: string;

      if (isTranscriptChunk(item)) {
        start = item.timestamp[0];
        end = item.timestamp[1] ?? (start + 5);
        text = item.text.trim();
      } else {
        start = item.start;
        end = item.end != null && item.end >= item.start ? item.end : item.start + 5;
        text = item.text.trim();
      }

      const startStr = secondsToTimecode(start, 'srt');
      const endStr = secondsToTimecode(end, 'srt');
      return `${index + 1}\n${startStr} --> ${endStr}\n${text}`;
    })
    .join('\n\n');
}

/**
 * Generates a WebVTT formatted subtitle string from cues or transcript chunks.
 */
export function generateVTT(items: SubtitleItem[]): string {
  if (!items || items.length === 0) return 'WEBVTT';
  const blocks = items.map((item, index) => {
    let id: string;
    let start: number;
    let end: number;
    let text: string;

    if (isTranscriptChunk(item)) {
      id = String(index + 1);
      start = item.timestamp[0];
      end = item.timestamp[1] ?? (start + 5);
      text = item.text.trim();
    } else {
      id = item.id || String(index + 1);
      start = item.start;
      end = item.end != null && item.end >= item.start ? item.end : item.start + 5;
      text = item.text.trim();
    }

    const startStr = secondsToTimecode(start, 'vtt');
    const endStr = secondsToTimecode(end, 'vtt');
    return `${id}\n${startStr} --> ${endStr}\n${text}`;
  });

  return `WEBVTT\n\n${blocks.join('\n\n')}`;
}

/**
 * Generates an Advanced SubStation Alpha (.ass) subtitle file.
 * Features crystalline haute couture styling (amethyst violet outline & alabaster pearl fill).
 */
export function generateASS(
  items: SubtitleItem[],
  title: string = 'Audio Subtitles'
): string {
  const header = [
    '[Script Info]',
    '; Script generated by audio-subtitles crystalline suite',
    `Title: ${title}`,
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.601',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Rarity Haute Couture styling: PrimaryColour: &H00FFFFFF (white), OutlineColour: &H00B83B5E (amethyst #5e3bb8), BackColour: &H80000000 (soft translucent shadow)
    'Style: Default,Arial,52,&H00FFFFFF,&H000000FF,&H00B83B5E,&H80000000,-1,0,0,0,100,100,0,0,1,3,1.5,2,10,10,60,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  if (!items || items.length === 0) {
    return header.join('\n');
  }

  const dialogues = items.map((item) => {
    let start: number;
    let end: number;
    let text: string;

    if (isTranscriptChunk(item)) {
      start = item.timestamp[0];
      end = item.timestamp[1] ?? (start + 5);
      text = item.text.trim();
    } else {
      start = item.start;
      end = item.end != null && item.end >= item.start ? item.end : item.start + 5;
      text = item.text.trim();
    }

    const startStr = secondsToTimecode(start, 'ass');
    const endStr = secondsToTimecode(end, 'ass');
    const formattedText = text.replace(/\r?\n/g, '\\N');
    return `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${formattedText}`;
  });

  return `${header.join('\n')}\n${dialogues.join('\n')}`;
}

/**
 * Generates a plain text representation with no timestamps, one cue per line.
 */
export function generateTXT(items: SubtitleItem[]): string {
  if (!items || items.length === 0) return '';
  return items
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Generates formatted JSON representation of subtitle cues.
 */
export function generateJSON(cues: SubtitleCue[]): string {
  return JSON.stringify(cues ?? [], null, 2);
}

/**
 * Triggers a native browser file download for text content.
 * Safe for use with SRT, VTT, ASS, TXT, or JSON.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8'
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }, 100);
}
