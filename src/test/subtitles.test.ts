import { describe, it, expect } from 'vitest';
import {
  secondsToTimecode,
  secondsToSrtTime,
  timecodeToSeconds,
  parseSRT,
  parseVTT,
  generateSRT,
  generateVTT,
  generateASS,
  generateTXT,
  generateJSON,
  nudgeCue,
  splitCue,
  mergeCues,
  sortCues,
  chunksToCues,
  cuesToChunks,
  chunkToCue,
  cueToChunk,
} from '../utils/subtitles';
import type { SubtitleCue, TranscriptChunk } from '../utils/subtitles';

const SAMPLE_CUES: SubtitleCue[] = [
  { id: 'cue-1', start: 0, end: 3.5, text: 'Hello darling, welcome to Carousel Boutique.' },
  { id: 'cue-2', start: 3.5, end: 7.2, text: 'Generosity is always in high fashion.' },
  { id: 'cue-3', start: 65.0, end: 70.199, text: 'One minute and five seconds of pure elegance.' },
];

const SAMPLE_CHUNKS: TranscriptChunk[] = [
  { timestamp: [0, 3.5], text: ' Hello world.' },
  { timestamp: [3.5, 7.2], text: ' This is a test.' },
  { timestamp: [65.0, 70.199], text: ' One minute and five seconds.' },
];

describe('secondsToTimecode', () => {
  describe('srt format', () => {
    it('formats zero seconds', () => {
      expect(secondsToTimecode(0, 'srt')).toBe('00:00:00,000');
    });

    it('formats fractional seconds', () => {
      expect(secondsToTimecode(3.5, 'srt')).toBe('00:00:03,500');
    });

    it('formats minutes and seconds', () => {
      expect(secondsToTimecode(65, 'srt')).toBe('00:01:05,000');
    });

    it('formats hours correctly', () => {
      expect(secondsToTimecode(3661.25, 'srt')).toBe('01:01:01,250');
    });

    it('handles negative or invalid seconds by clamping to zero', () => {
      expect(secondsToTimecode(-10, 'srt')).toBe('00:00:00,000');
      expect(secondsToTimecode(NaN, 'srt')).toBe('00:00:00,000');
    });

    it('secondsToSrtTime alias behaves identically', () => {
      expect(secondsToSrtTime(3.5)).toBe('00:00:03,500');
      expect(secondsToSrtTime(70.199)).toBe('00:01:10,199');
    });
  });

  describe('vtt format', () => {
    it('uses dot separator for milliseconds', () => {
      expect(secondsToTimecode(0, 'vtt')).toBe('00:00:00.000');
      expect(secondsToTimecode(3.5, 'vtt')).toBe('00:00:03.500');
      expect(secondsToTimecode(70.123, 'vtt')).toBe('00:01:10.123');
    });
  });

  describe('ass format', () => {
    it('uses H:MM:SS.cc format with 2-digit centiseconds', () => {
      expect(secondsToTimecode(0, 'ass')).toBe('0:00:00.00');
      expect(secondsToTimecode(3.5, 'ass')).toBe('0:00:03.50');
      expect(secondsToTimecode(65.45, 'ass')).toBe('0:01:05.45');
      expect(secondsToTimecode(3661.25, 'ass')).toBe('1:01:01.25');
    });
  });
});

describe('timecodeToSeconds', () => {
  it('parses SRT comma timecodes', () => {
    expect(timecodeToSeconds('00:00:00,000')).toBe(0);
    expect(timecodeToSeconds('00:00:03,500')).toBe(3.5);
    expect(timecodeToSeconds('00:01:05,000')).toBe(65);
    expect(timecodeToSeconds('01:01:01,250')).toBe(3661.25);
  });

  it('parses VTT dot timecodes', () => {
    expect(timecodeToSeconds('00:00:00.000')).toBe(0);
    expect(timecodeToSeconds('00:00:03.500')).toBe(3.5);
    expect(timecodeToSeconds('00:01:10.123')).toBe(70.123);
  });

  it('parses ASS centisecond timecodes', () => {
    expect(timecodeToSeconds('0:00:00.00')).toBe(0);
    expect(timecodeToSeconds('0:01:23.45')).toBe(83.45);
    expect(timecodeToSeconds('1:01:01.25')).toBe(3661.25);
  });

  it('parses short MM:SS.mmm format', () => {
    expect(timecodeToSeconds('01:23.456')).toBe(83.456);
  });

  it('strips trailing VTT cue settings', () => {
    expect(timecodeToSeconds('00:00:04.000 line:0 position:20% align:start')).toBe(4);
  });

  it('returns 0 for empty or invalid input', () => {
    expect(timecodeToSeconds('')).toBe(0);
    expect(timecodeToSeconds('invalid')).toBe(0);
  });

  it('roundtrips with secondsToTimecode', () => {
    const times = [0, 1.25, 65.5, 3600, 3723.45];
    for (const t of times) {
      expect(timecodeToSeconds(secondsToTimecode(t, 'srt'))).toBeCloseTo(t, 2);
      expect(timecodeToSeconds(secondsToTimecode(t, 'vtt'))).toBeCloseTo(t, 2);
      expect(timecodeToSeconds(secondsToTimecode(t, 'ass'))).toBeCloseTo(t, 2);
    }
  });
});

describe('SRT Parser & Generator', () => {
  const rawSRT = `1
00:00:01,000 --> 00:00:04,500
A touch of silk and sapphire.

2
00:00:05,200 --> 00:00:09,800
Elegance is not just an aesthetic;
it is an attitude.`;

  it('parses valid SRT text into cues', () => {
    const cues = parseSRT(rawSRT);
    expect(cues).toHaveLength(2);

    expect(cues[0]).toEqual({
      id: '1',
      start: 1.0,
      end: 4.5,
      text: 'A touch of silk and sapphire.',
    });

    expect(cues[1].id).toBe('2');
    expect(cues[1].start).toBe(5.2);
    expect(cues[1].end).toBe(9.8);
    expect(cues[1].text).toBe('Elegance is not just an aesthetic;\nit is an attitude.');
  });

  it('handles SRT with BOM, CRLF, and trailing newlines', () => {
    const crlfSrt = `\uFEFF1\r\n00:00:00,500 --> 00:00:02,000\r\nTest line\r\n\r\n`;
    const cues = parseSRT(crlfSrt);
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBe(0.5);
    expect(cues[0].end).toBe(2.0);
    expect(cues[0].text).toBe('Test line');
  });

  it('handles SRT cues without leading index numbers', () => {
    const noIndexSrt = `00:00:01,000 --> 00:00:03,000\nDirect timecode cue`;
    const cues = parseSRT(noIndexSrt);
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBe(1);
    expect(cues[0].end).toBe(3);
    expect(cues[0].text).toBe('Direct timecode cue');
  });

  it('returns empty array for invalid or empty SRT text', () => {
    expect(parseSRT('')).toEqual([]);
    expect(parseSRT('Just random notes without timecodes')).toEqual([]);
  });

  it('generates valid SRT from SubtitleCue[]', () => {
    const srt = generateSRT(SAMPLE_CUES);
    const blocks = srt.split('\n\n');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe(
      '1\n00:00:00,000 --> 00:00:03,500\nHello darling, welcome to Carousel Boutique.'
    );
    expect(blocks[1]).toContain('2\n00:00:03,500 --> 00:00:07,200');
    expect(blocks[2]).toContain('3\n00:01:05,000 --> 00:01:10,199');
  });

  it('generates SRT from TranscriptChunk[] for backwards compatibility', () => {
    const srt = generateSRT(SAMPLE_CHUNKS);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:03,500\nHello world.');
    expect(srt).toContain('2\n00:00:03,500 --> 00:00:07,200\nThis is a test.');
  });

  it('returns empty string when generating SRT from empty array', () => {
    expect(generateSRT([])).toBe('');
  });

  it('roundtrips cues through generateSRT and parseSRT', () => {
    const generated = generateSRT(SAMPLE_CUES);
    const parsed = parseSRT(generated);

    expect(parsed).toHaveLength(SAMPLE_CUES.length);
    for (let i = 0; i < SAMPLE_CUES.length; i++) {
      expect(parsed[i].start).toBeCloseTo(SAMPLE_CUES[i].start, 2);
      expect(parsed[i].end).toBeCloseTo(SAMPLE_CUES[i].end, 2);
      expect(parsed[i].text).toBe(SAMPLE_CUES[i].text);
    }
  });
});

describe('WebVTT Parser & Generator', () => {
  const rawVTT = `WEBVTT - Carousel Fashion Commentary

NOTE
This is an editorial note that should be ignored by the parser.

cue-alpha
00:00:01.200 --> 00:00:04.800 position:10% align:start
A pristine diamond cut.

00:00:05.500 --> 00:00:08.900
Second cue with multiple
lines of text`;

  it('parses WebVTT with header, comments, settings, and cues', () => {
    const cues = parseVTT(rawVTT);
    expect(cues).toHaveLength(2);

    expect(cues[0]).toEqual({
      id: 'cue-alpha',
      start: 1.2,
      end: 4.8,
      text: 'A pristine diamond cut.',
    });

    expect(cues[1].start).toBe(5.5);
    expect(cues[1].end).toBe(8.9);
    expect(cues[1].text).toBe('Second cue with multiple\nlines of text');
  });

  it('returns empty array when VTT contains only header', () => {
    expect(parseVTT('WEBVTT')).toEqual([]);
    expect(parseVTT('WEBVTT\n\nNOTE comment only')).toEqual([]);
    expect(parseVTT('')).toEqual([]);
  });

  it('generates valid WebVTT from SubtitleCue[]', () => {
    const vtt = generateVTT(SAMPLE_CUES);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:03.500');
    expect(vtt).toContain('Hello darling, welcome to Carousel Boutique.');
  });

  it('returns WEBVTT for empty cues array', () => {
    expect(generateVTT([])).toBe('WEBVTT');
  });

  it('roundtrips cues through generateVTT and parseVTT', () => {
    const generated = generateVTT(SAMPLE_CUES);
    const parsed = parseVTT(generated);

    expect(parsed).toHaveLength(SAMPLE_CUES.length);
    for (let i = 0; i < SAMPLE_CUES.length; i++) {
      expect(parsed[i].start).toBeCloseTo(SAMPLE_CUES[i].start, 2);
      expect(parsed[i].end).toBeCloseTo(SAMPLE_CUES[i].end, 2);
      expect(parsed[i].text).toBe(SAMPLE_CUES[i].text);
    }
  });
});

describe('ASS Generator', () => {
  it('generates valid ASS file with Rarity Haute Couture styling', () => {
    const ass = generateASS(SAMPLE_CUES, 'Haute Couture Premiere');

    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('Title: Haute Couture Premiere');
    expect(ass).toContain('ScriptType: v4.00+');
    expect(ass).toContain('PlayResX: 1920');
    expect(ass).toContain('PlayResY: 1080');

    expect(ass).toContain('[V4+ Styles]');
    // PrimaryColour: white &H00FFFFFF, OutlineColour: amethyst violet &H00B83B5E
    expect(ass).toContain('&H00FFFFFF');
    expect(ass).toContain('&H00B83B5E');

    expect(ass).toContain('[Events]');
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:03.50,Default,,0,0,0,,Hello darling');
    expect(ass).toContain('Dialogue: 0,0:00:03.50,0:00:07.20,Default,,0,0,0,,Generosity is always');
    expect(ass).toContain('Dialogue: 0,0:01:05.00,0:01:10.20,Default,,0,0,0,,One minute');
  });

  it('formats multiline text using ASS \\N delimiter', () => {
    const multilineCues: SubtitleCue[] = [
      { id: '1', start: 0, end: 3, text: 'Top line\nBottom line' },
    ];
    const ass = generateASS(multilineCues);
    expect(ass).toContain('Top line\\NBottom line');
  });

  it('handles empty cues array gracefully', () => {
    const ass = generateASS([]);
    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toContain('[Events]');
    expect(ass).not.toContain('Dialogue:');
  });
});

describe('generateTXT', () => {
  it('generates line-separated text without timestamps', () => {
    const txt = generateTXT(SAMPLE_CUES);
    const lines = txt.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Hello darling, welcome to Carousel Boutique.');
    expect(txt).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(txt).not.toContain('-->');
  });

  it('trims whitespace and filters empty cues', () => {
    const cues: SubtitleCue[] = [
      { id: '1', start: 0, end: 1, text: '   Spacious   ' },
      { id: '2', start: 1, end: 2, text: '   ' },
      { id: '3', start: 2, end: 3, text: 'Tailored' },
    ];
    const txt = generateTXT(cues);
    expect(txt).toBe('Spacious\nTailored');
  });

  it('returns empty string for empty array', () => {
    expect(generateTXT([])).toBe('');
  });
});

describe('generateJSON', () => {
  it('generates formatted JSON matching SubtitleCue structure', () => {
    const json = generateJSON(SAMPLE_CUES);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(SAMPLE_CUES);
  });

  it('handles empty array', () => {
    expect(generateJSON([])).toBe('[]');
  });
});

describe('Cue manipulation helpers', () => {
  describe('nudgeCue', () => {
    const cue: SubtitleCue = { id: 'c1', start: 2.0, end: 5.0, text: 'Fabric swatch' };

    it('shifts start and end forward with positive delta', () => {
      const nudged = nudgeCue(cue, 0.5);
      expect(nudged.start).toBe(2.5);
      expect(nudged.end).toBe(5.5);
      expect(nudged.text).toBe('Fabric swatch');
      // Original is not mutated
      expect(cue.start).toBe(2.0);
    });

    it('shifts start and end backward with negative delta', () => {
      const nudged = nudgeCue(cue, -0.5);
      expect(nudged.start).toBe(1.5);
      expect(nudged.end).toBe(4.5);
    });

    it('clamps start to zero when delta shifts below zero', () => {
      const nudged = nudgeCue(cue, -3.0);
      expect(nudged.start).toBe(0);
      expect(nudged.end).toBe(2.0);
    });

    it('guarantees end is at least start if large negative delta', () => {
      const nudged = nudgeCue(cue, -10.0);
      expect(nudged.start).toBe(0);
      expect(nudged.end).toBe(0);
    });
  });

  describe('splitCue', () => {
    it('splits a single-line cue with multiple words proportionally', () => {
      const cue: SubtitleCue = {
        id: 'c1',
        start: 0,
        end: 10,
        text: 'A fabulous gown ready for the Grand Galloping Gala',
      };
      const [cue1, cue2] = splitCue(cue, 4.0);

      expect(cue1.id).toBe('c1-1');
      expect(cue1.start).toBe(0);
      expect(cue1.end).toBe(4.0);
      expect(cue1.text).toBeTruthy();

      expect(cue2.id).toBe('c1-2');
      expect(cue2.start).toBe(4.0);
      expect(cue2.end).toBe(10);
      expect(cue2.text).toBeTruthy();

      // Words are fully preserved between the two halves
      expect(`${cue1.text} ${cue2.text}`).toBe(cue.text);
    });

    it('splits a multi-line cue at the newline boundary', () => {
      const cue: SubtitleCue = {
        id: 'c2',
        start: 1.0,
        end: 5.0,
        text: 'First line of verse\nSecond line of verse',
      };
      const [cue1, cue2] = splitCue(cue, 3.0);

      expect(cue1.start).toBe(1.0);
      expect(cue1.end).toBe(3.0);
      expect(cue1.text).toBe('First line of verse');

      expect(cue2.start).toBe(3.0);
      expect(cue2.end).toBe(5.0);
      expect(cue2.text).toBe('Second line of verse');
    });

    it('handles single-word cue gracefully', () => {
      const cue: SubtitleCue = {
        id: 'c3',
        start: 0,
        end: 2,
        text: 'Magnifique!',
      };
      const [cue1, cue2] = splitCue(cue, 1.0);
      expect(cue1.text).toBe('Magnifique!');
      expect(cue2.text).toBe('');
    });

    it('clamps splitTime if outside cue duration', () => {
      const cue: SubtitleCue = { id: 'c4', start: 2, end: 6, text: 'Chic' };
      const [c1, c2] = splitCue(cue, 0); // Before start
      expect(c1.start).toBe(2);
      expect(c1.end).toBe(2);
      expect(c2.start).toBe(2);
      expect(c2.end).toBe(6);
    });
  });

  describe('mergeCues', () => {
    it('merges multiple cues chronologically with concatenated text', () => {
      const cues: SubtitleCue[] = [
        { id: '1', start: 0, end: 2.0, text: 'Simply' },
        { id: '2', start: 2.5, end: 4.5, text: 'divine!' },
      ];
      const merged = mergeCues(cues);

      expect(merged.id).toBe('1');
      expect(merged.start).toBe(0);
      expect(merged.end).toBe(4.5);
      expect(merged.text).toBe('Simply divine!');
    });

    it('handles unsorted input cues', () => {
      const cues: SubtitleCue[] = [
        { id: '2', start: 3.0, end: 5.0, text: 'Couture' },
        { id: '1', start: 1.0, end: 2.5, text: 'Haute' },
      ];
      const merged = mergeCues(cues);
      expect(merged.start).toBe(1.0);
      expect(merged.end).toBe(5.0);
      expect(merged.text).toBe('Haute Couture');
    });

    it('handles empty cues array', () => {
      const merged = mergeCues([]);
      expect(merged.text).toBe('');
      expect(merged.start).toBe(0);
    });
  });

  describe('sortCues', () => {
    it('sorts cues by start time ascending and secondary end time', () => {
      const cues: SubtitleCue[] = [
        { id: 'c3', start: 5.0, end: 8.0, text: 'Three' },
        { id: 'c1', start: 1.0, end: 4.0, text: 'One' },
        { id: 'c2', start: 1.0, end: 3.0, text: 'One-early' },
      ];
      const sorted = sortCues(cues);
      expect(sorted[0].id).toBe('c2'); // same start, earlier end
      expect(sorted[1].id).toBe('c1');
      expect(sorted[2].id).toBe('c3');

      // Original array is unchanged
      expect(cues[0].id).toBe('c3');
    });
  });
});

describe('TranscriptChunk compatibility bridging', () => {
  it('converts TranscriptChunk to SubtitleCue and back', () => {
    const chunk: TranscriptChunk = { timestamp: [2.5, 6.0], text: 'Gemstone' };
    const cue = chunkToCue(chunk, 0);

    expect(cue.id).toBe('cue-1');
    expect(cue.start).toBe(2.5);
    expect(cue.end).toBe(6.0);
    expect(cue.text).toBe('Gemstone');

    const backToChunk = cueToChunk(cue);
    expect(backToChunk).toEqual({
      timestamp: [2.5, 6.0],
      text: 'Gemstone',
    });
  });

  it('converts arrays with chunksToCues and cuesToChunks', () => {
    const cues = chunksToCues(SAMPLE_CHUNKS);
    expect(cues).toHaveLength(3);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBe(3.5);

    const chunks = cuesToChunks(cues);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].timestamp).toEqual([0, 3.5]);
  });
});
