import { describe, it, expect } from 'vitest';
import {
    secondsToSrtTime,
    generateSRT,
    generateTXT,
} from '../utils/export';
import type { TranscriptChunk } from '../utils/export';

const SAMPLE_CHUNKS: TranscriptChunk[] = [
    { timestamp: [0, 3.5], text: ' Hello world.' },
    { timestamp: [3.5, 7.2], text: ' This is a test.' },
    { timestamp: [65.0, 70.199], text: ' One minute and five seconds.' },
];

describe('secondsToSrtTime', () => {
    it('converts zero seconds correctly', () => {
        expect(secondsToSrtTime(0)).toBe('00:00:00,000');
    });

    it('converts sub-second precision correctly', () => {
        expect(secondsToSrtTime(3.5)).toBe('00:00:03,500');
    });

    it('handles minutes correctly', () => {
        expect(secondsToSrtTime(65.0)).toBe('00:01:05,000');
    });

    it('handles hours correctly', () => {
        expect(secondsToSrtTime(3661.25)).toBe('01:01:01,250');
    });

    it('handles millisecond boundary rounding', () => {
        expect(secondsToSrtTime(70.199)).toBe('00:01:10,199');
    });

    it('pads all time components to correct width', () => {
        const result = secondsToSrtTime(1.5);
        expect(result).toMatch(/^\d{2}:\d{2}:\d{2},\d{3}$/);
    });
});

describe('generateSRT', () => {
    it('generates correctly formatted SRT from chunks', () => {
        const srt = generateSRT(SAMPLE_CHUNKS);
        const blocks = srt.split('\n\n');
        expect(blocks).toHaveLength(3);
        // First block: sequence number
        expect(blocks[0]).toContain('1\n');
        // Time arrow
        expect(blocks[0]).toContain(' --> ');
        // Actual text
        expect(blocks[0]).toContain('Hello world.');
    });

    it('numbers sequences starting from 1', () => {
        const srt = generateSRT(SAMPLE_CHUNKS);
        expect(srt.startsWith('1\n')).toBe(true);
        expect(srt).toContain('\n2\n');
        expect(srt).toContain('\n3\n');
    });

    it('handles null end timestamp by falling back to start + 5s', () => {
        const chunks: TranscriptChunk[] = [
            { timestamp: [10, null], text: ' Null end test.' },
        ];
        const srt = generateSRT(chunks);
        // end = 10 + 5 = 15s
        expect(srt).toContain('00:00:10,000 --> 00:00:15,000');
    });

    it('returns empty string for empty chunks array', () => {
        expect(generateSRT([])).toBe('');
    });

    it('trims whitespace from text in each block', () => {
        const chunks: TranscriptChunk[] = [{ timestamp: [0, 2], text: '   spaces   ' }];
        const srt = generateSRT(chunks);
        expect(srt).toContain('spaces');
        expect(srt).not.toContain('   spaces   ');
    });
});

describe('generateTXT', () => {
    it('joins chunk text with newlines', () => {
        const txt = generateTXT(SAMPLE_CHUNKS);
        const lines = txt.split('\n');
        expect(lines).toHaveLength(3);
    });

    it('contains no timestamp characters', () => {
        const txt = generateTXT(SAMPLE_CHUNKS);
        expect(txt).not.toMatch(/\d{2}:\d{2}:\d{2}/);
        expect(txt).not.toContain('-->');
    });

    it('trims whitespace from each segment', () => {
        const txt = generateTXT(SAMPLE_CHUNKS);
        txt.split('\n').forEach((line) => {
            expect(line).toBe(line.trim());
        });
    });

    it('filters out empty/blank segments', () => {
        const chunks: TranscriptChunk[] = [
            { timestamp: [0, 1], text: 'Hello' },
            { timestamp: [1, 2], text: '   ' },
            { timestamp: [2, 3], text: 'World' },
        ];
        const txt = generateTXT(chunks);
        const lines = txt.split('\n');
        expect(lines).toHaveLength(2);
    });

    it('returns empty string for empty chunks', () => {
        expect(generateTXT([])).toBe('');
    });
});
