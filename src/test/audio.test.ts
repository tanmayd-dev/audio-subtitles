import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resampleTo16kHz } from '../utils/audio';

describe('resampleTo16kHz', () => {
    it('returns the buffer unchanged if already 16kHz', () => {
        const buffer = new Float32Array([0.1, 0.2, 0.3]);
        const result = resampleTo16kHz(buffer, 16000);
        expect(result).toBe(buffer);
    });

    it('downsamples from 32kHz to 16kHz (halves length)', () => {
        const fourSamples = new Float32Array([0, 0.5, 1, 0.5]);
        const result = resampleTo16kHz(fourSamples, 32000);
        expect(result.length).toBe(2);
    });

    it('upsamples from 8kHz to 16kHz (doubles length)', () => {
        const twoSamples = new Float32Array([0, 1]);
        const result = resampleTo16kHz(twoSamples, 8000);
        expect(result.length).toBe(4);
    });

    it('produces values within [-1, 1] for standard PCM input', () => {
        const source = new Float32Array(Array.from({ length: 100 }, (_, i) => Math.sin(i)));
        const result = resampleTo16kHz(source, 44100);
        for (const sample of result) {
            expect(Math.abs(sample)).toBeLessThanOrEqual(1);
        }
    });

    it('handles a single sample without throwing', () => {
        const single = new Float32Array([0.5]);
        expect(() => resampleTo16kHz(single, 44100)).not.toThrow();
    });

    it('handles empty buffer without throwing', () => {
        const empty = new Float32Array(0);
        const result = resampleTo16kHz(empty, 44100);
        expect(result.length).toBe(0);
    });
});

// Integration test for decodeAudioFile using a constructor-based mock
describe('decodeAudioFile (mocked AudioContext)', () => {
    beforeEach(() => {
        const mockGetChannelData = vi.fn().mockReturnValue(new Float32Array(16000).fill(0.1));
        const mockAudioBuffer = {
            numberOfChannels: 1,
            length: 16000,
            sampleRate: 16000,
            getChannelData: mockGetChannelData,
        };

        const mockDecodeAudioData = vi.fn().mockResolvedValue(mockAudioBuffer);
        const mockClose = vi.fn().mockResolvedValue(undefined);

        // Must use function keyword for new-able mock constructor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.stubGlobal('AudioContext', vi.fn(function (this: any) {
            this.decodeAudioData = mockDecodeAudioData;
            this.close = mockClose;
        }));
    });

    it('resolves to a Float32Array', async () => {
        const { decodeAudioFile } = await import('../utils/audio');
        const fakeFile = new File([new ArrayBuffer(8)], 'test.ogg', { type: 'audio/ogg' });
        const result = await decodeAudioFile(fakeFile);
        expect(result).toBeInstanceOf(Float32Array);
    });

    it('returns 16kHz mono audio of expected length', async () => {
        const { decodeAudioFile } = await import('../utils/audio');
        const fakeFile = new File([new ArrayBuffer(8)], 'test.ogg', { type: 'audio/ogg' });
        const result = await decodeAudioFile(fakeFile);
        expect(result.length).toBe(16000);
    });
});
