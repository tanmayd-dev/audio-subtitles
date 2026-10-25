import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FFmpegService,
  ffmpegService,
  parseWavToFloat32,
  createMockWavBuffer,
  getOutputFilename,
  type FFmpegLike,
} from '../services/ffmpeg.service';
import type { FFmpegProgress } from '../types/studio';

describe('FFmpegService', () => {
  let service: FFmpegService;

  beforeEach(() => {
    service = new FFmpegService({ mock: true });
    service.resetCommandHistory();
  });

  describe('Instantiation & Configuration', () => {
    it('initializes a default singleton instance', () => {
      expect(ffmpegService).toBeInstanceOf(FFmpegService);
      expect(typeof ffmpegService.load).toBe('function');
      expect(typeof ffmpegService.softMuxSubtitles).toBe('function');
      expect(typeof ffmpegService.hardBurnSubtitles).toBe('function');
      expect(typeof ffmpegService.extractAudio).toBe('function');
    });

    it('reports not loaded before load() is called', () => {
      const fresh = new FFmpegService({ mock: true });
      expect(fresh.isLoaded()).toBe(false);
    });

    it('allows toggling mock mode', () => {
      const testService = new FFmpegService({ mock: true });
      expect(testService.isMockMode()).toBe(true);

      testService.setMockMode(false);
      expect(testService.isMockMode()).toBe(false);

      testService.setMockMode(true);
      expect(testService.isMockMode()).toBe(true);
    });

    it('terminates and resets loaded state', async () => {
      await service.load();
      expect(service.isLoaded()).toBe(true);

      service.terminate();
      expect(service.isLoaded()).toBe(false);
    });
  });

  describe('Mock Execution & Stage Reporting', () => {
    it('loads successfully and reports progress', async () => {
      const progressUpdates: number[] = [];
      await service.load((p) => progressUpdates.push(p));

      expect(service.isLoaded()).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });

    it('resolves immediately if already loaded', async () => {
      await service.load();
      const progressUpdates: number[] = [];
      await service.load((p) => progressUpdates.push(p));

      expect(progressUpdates).toEqual([100]);
    });

    it('executes softMuxSubtitles in mock mode and returns an MP4 Blob', async () => {
      const file = new File(['fake-video-bytes'], 'test-video.mp4', { type: 'video/mp4' });
      const srt = `1\n00:00:01,000 --> 00:00:03,000\nHello World\n`;

      const progressHistory: FFmpegProgress[] = [];
      const result = await service.softMuxSubtitles(file, srt, (p) => progressHistory.push(p));

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.type).toBe('video/mp4');
      expect(result.filename).toBe('test-video-subtitled.mp4');

      expect(progressHistory.some((p) => p.stage === 'muxing')).toBe(true);
      expect(progressHistory[progressHistory.length - 1]).toEqual({
        stage: 'done',
        progress: 100,
        message: 'Subtitles muxed successfully',
      });
    });

    it('executes hardBurnSubtitles in mock mode and returns an MP4 Blob', async () => {
      const file = new File(['fake-video-bytes'], 'presentation.mov', { type: 'video/quicktime' });
      const srt = `1\n00:00:00,500 --> 00:00:02,000\nKeynote Title\n`;

      const progressHistory: FFmpegProgress[] = [];
      const result = await service.hardBurnSubtitles(file, srt, (p) => progressHistory.push(p));

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.type).toBe('video/mp4');
      expect(result.filename).toBe('presentation-burned.mp4');

      expect(progressHistory.some((p) => p.stage === 'burning')).toBe(true);
      expect(progressHistory[progressHistory.length - 1]).toEqual({
        stage: 'done',
        progress: 100,
        message: 'Subtitles burned successfully',
      });
    });

    it('executes extractAudio in mock mode and returns Float32Array PCM at 16kHz', async () => {
      const file = new File(['fake-video-bytes'], 'lecture.mp4', { type: 'video/mp4' });

      const progressHistory: FFmpegProgress[] = [];
      const pcm = await service.extractAudio(file, (p) => progressHistory.push(p));

      expect(pcm).toBeInstanceOf(Float32Array);
      expect(pcm.length).toBe(1600); // Default mock size (0.1s at 16kHz)
      expect(progressHistory.some((p) => p.stage === 'extracting')).toBe(true);
      expect(progressHistory[progressHistory.length - 1]).toEqual({
        stage: 'done',
        progress: 100,
        message: 'Audio extraction complete',
      });
    });
  });

  describe('Parameter Building & Command Verification', () => {
    it('builds exact FFmpeg arguments for softMuxSubtitles', async () => {
      const file = new File(['data'], 'sample.mp4', { type: 'video/mp4' });
      await service.softMuxSubtitles(file, '1\n00:00:01,000 --> 00:00:02,000\nHi\n');

      const lastArgs = service.getLastCommandArgs();
      expect(lastArgs).toEqual([
        '-i',
        'input.mp4',
        '-i',
        'sub.srt',
        '-c',
        'copy',
        '-c:s',
        'mov_text',
        'output.mp4',
      ]);
    });

    it('builds exact FFmpeg arguments for hardBurnSubtitles', async () => {
      const file = new File(['data'], 'sample.mp4', { type: 'video/mp4' });
      await service.hardBurnSubtitles(file, '1\n00:00:01,000 --> 00:00:02,000\nHi\n');

      const lastArgs = service.getLastCommandArgs();
      expect(lastArgs).toEqual([
        '-i',
        'input.mp4',
        '-vf',
        "subtitles=sub.srt:force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BorderStyle=3,Outline=2'",
        '-c:a',
        'copy',
        'burned.mp4',
      ]);
    });

    it('builds exact FFmpeg arguments for extractAudio (16kHz mono WAV)', async () => {
      const file = new File(['data'], 'sample.mp4', { type: 'video/mp4' });
      await service.extractAudio(file);

      const lastArgs = service.getLastCommandArgs();
      expect(lastArgs).toEqual([
        '-i',
        'input.mp4',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        'audio.wav',
      ]);
    });

    it('maintains command history and allows resetting', async () => {
      const file = new File(['data'], 'sample.mp4', { type: 'video/mp4' });
      await service.softMuxSubtitles(file, 'test');
      await service.hardBurnSubtitles(file, 'test');

      const history = service.getCommandHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toContain('mov_text');
      expect(history[1]).toContain('burned.mp4');

      service.resetCommandHistory();
      expect(service.getCommandHistory()).toEqual([]);
      expect(service.getLastCommandArgs()).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('handles simulated error in softMuxSubtitles and notifies stage error', async () => {
      const file = new File(['data'], 'error.mp4', { type: 'video/mp4' });
      service.setMockFailNextCommand(true, 'Disk I/O error');

      const progressUpdates: FFmpegProgress[] = [];
      await expect(
        service.softMuxSubtitles(file, 'sub', (p) => progressUpdates.push(p))
      ).rejects.toThrow('Disk I/O error');

      const errorProgress = progressUpdates.find((p) => p.stage === 'error');
      expect(errorProgress).toBeDefined();
      expect(errorProgress?.message).toContain('Disk I/O error');
    });

    it('handles simulated error in hardBurnSubtitles and notifies stage error', async () => {
      const file = new File(['data'], 'error.mp4', { type: 'video/mp4' });
      service.setMockFailNextCommand(true, 'Font rendering failed');

      const progressUpdates: FFmpegProgress[] = [];
      await expect(
        service.hardBurnSubtitles(file, 'sub', (p) => progressUpdates.push(p))
      ).rejects.toThrow('Font rendering failed');

      const errorProgress = progressUpdates.find((p) => p.stage === 'error');
      expect(errorProgress).toBeDefined();
      expect(errorProgress?.message).toContain('Font rendering failed');
    });

    it('handles simulated error in extractAudio and notifies stage error', async () => {
      const file = new File(['data'], 'error.mp4', { type: 'video/mp4' });
      service.setMockFailNextCommand(true, 'Corrupt audio stream');

      const progressUpdates: FFmpegProgress[] = [];
      await expect(
        service.extractAudio(file, (p) => progressUpdates.push(p))
      ).rejects.toThrow('Corrupt audio stream');

      const errorProgress = progressUpdates.find((p) => p.stage === 'error');
      expect(errorProgress).toBeDefined();
      expect(errorProgress?.message).toContain('Corrupt audio stream');
    });
  });

  describe('Injected Mock FFmpeg (Real Worker Code Paths)', () => {
    let mockFFmpeg: FFmpegLike;
    let virtualFS: Map<string, Uint8Array | string>;
    let listeners: Record<string, ((data: { type: string; message: string } | { progress: number; time: number }) => void)[]>;

    beforeEach(() => {
      virtualFS = new Map();
      listeners = { log: [], progress: [] };

      mockFFmpeg = {
        loaded: true,
        load: vi.fn().mockResolvedValue(true),
        exec: vi.fn().mockImplementation(async (args: string[]) => {
          if (listeners.progress) {
            listeners.progress.forEach((cb) => cb({ progress: 0.5, time: 5000 }));
            listeners.progress.forEach((cb) => cb({ progress: 1.0, time: 10000 }));
          }

          if (args.includes('output.mp4')) {
            virtualFS.set('output.mp4', new Uint8Array([1, 2, 3, 4]));
          } else if (args.includes('burned.mp4')) {
            virtualFS.set('burned.mp4', new Uint8Array([5, 6, 7, 8]));
          } else if (args.includes('audio.wav')) {
            virtualFS.set('audio.wav', createMockWavBuffer(320, 16000));
          }
          return 0;
        }),
        writeFile: vi.fn().mockImplementation(async (path: string, data: Uint8Array | string) => {
          virtualFS.set(path, data);
        }),
        readFile: vi.fn().mockImplementation(async (path: string) => {
          const data = virtualFS.get(path);
          if (!data) throw new Error(`File not found: ${path}`);
          return data;
        }),
        deleteFile: vi.fn().mockImplementation(async (path: string) => {
          virtualFS.delete(path);
        }),
        on: vi.fn().mockImplementation((event: 'log' | 'progress', cb: (data: unknown) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb as (data: { type: string; message: string } | { progress: number; time: number }) => void);
        }),
        off: vi.fn().mockImplementation((event: 'log' | 'progress', cb: (data: unknown) => void) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((fn) => fn !== cb);
          }
        }),
        terminate: vi.fn(),
      };
    });

    it('exercises real softMuxSubtitles pipeline: writes files, attaches listeners, cleans up', async () => {
      const customService = new FFmpegService({
        mock: false,
        ffmpegInstance: mockFFmpeg,
      });

      const file = new File(['video-payload'], 'input.mp4', { type: 'video/mp4' });
      const srt = `1\n00:00:00,000 --> 00:00:01,000\nTest\n`;

      const progressList: FFmpegProgress[] = [];
      const result = await customService.softMuxSubtitles(file, srt, (p) => progressList.push(p));

      expect(mockFFmpeg.writeFile).toHaveBeenCalledWith('input.mp4', expect.any(Uint8Array));
      expect(mockFFmpeg.writeFile).toHaveBeenCalledWith('sub.srt', srt);
      expect(mockFFmpeg.exec).toHaveBeenCalledWith([
        '-i',
        'input.mp4',
        '-i',
        'sub.srt',
        '-c',
        'copy',
        '-c:s',
        'mov_text',
        'output.mp4',
      ]);
      expect(mockFFmpeg.readFile).toHaveBeenCalledWith('output.mp4');

      // Verifies cleanup in finally block
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('input.mp4');
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('sub.srt');
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('output.mp4');
      expect(mockFFmpeg.off).toHaveBeenCalledWith('progress', expect.any(Function));

      expect(result.blob).toBeInstanceOf(Blob);
      expect(progressList.some((p) => p.progress === 50)).toBe(true);
    });

    it('exercises real hardBurnSubtitles pipeline with filters and cleanup', async () => {
      const customService = new FFmpegService({
        mock: false,
        ffmpegInstance: mockFFmpeg,
      });

      const file = new File(['video-payload'], 'input.mp4', { type: 'video/mp4' });
      const srt = `1\n00:00:00,000 --> 00:00:01,000\nTest\n`;

      const result = await customService.hardBurnSubtitles(file, srt);

      expect(mockFFmpeg.writeFile).toHaveBeenCalledWith('input.mp4', expect.any(Uint8Array));
      expect(mockFFmpeg.writeFile).toHaveBeenCalledWith('sub.srt', srt);
      expect(mockFFmpeg.exec).toHaveBeenCalledWith([
        '-i',
        'input.mp4',
        '-vf',
        "subtitles=sub.srt:force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BorderStyle=3,Outline=2'",
        '-c:a',
        'copy',
        'burned.mp4',
      ]);
      expect(mockFFmpeg.readFile).toHaveBeenCalledWith('burned.mp4');
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('input.mp4');
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('sub.srt');
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('burned.mp4');
      expect(result.filename).toBe('input-burned.mp4');
    });

    it('exercises real extractAudio pipeline and decodes WAV to Float32Array', async () => {
      const customService = new FFmpegService({
        mock: false,
        ffmpegInstance: mockFFmpeg,
      });

      const file = new File(['video-payload'], 'clip.mp4', { type: 'video/mp4' });
      const pcm = await customService.extractAudio(file);

      expect(mockFFmpeg.writeFile).toHaveBeenCalledWith('input.mp4', expect.any(Uint8Array));
      expect(mockFFmpeg.exec).toHaveBeenCalledWith([
        '-i',
        'input.mp4',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        'audio.wav',
      ]);
      expect(mockFFmpeg.readFile).toHaveBeenCalledWith('audio.wav');
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('input.mp4');
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('audio.wav');
      expect(pcm).toBeInstanceOf(Float32Array);
      expect(pcm.length).toBe(320);
    });

    it('handles non-zero exit code by throwing and still cleaning up virtual files', async () => {
      mockFFmpeg.exec = vi.fn().mockResolvedValue(1); // Exit code 1 (failure)

      const customService = new FFmpegService({
        mock: false,
        ffmpegInstance: mockFFmpeg,
      });

      const file = new File(['corrupt'], 'corrupt.mp4', { type: 'video/mp4' });

      await expect(customService.extractAudio(file)).rejects.toThrow(
        'FFmpeg audio extraction failed with exit code 1'
      );

      // Verify cleanup was still invoked in finally block
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('input.mp4');
      expect(mockFFmpeg.deleteFile).toHaveBeenCalledWith('audio.wav');
      expect(mockFFmpeg.off).toHaveBeenCalled();
    });
  });

  describe('WAV Decoding & Audio Parsing', () => {
    it('parses a standard 16-bit mono 16kHz WAV buffer', () => {
      const wav = createMockWavBuffer(800, 16000);
      const float32 = parseWavToFloat32(wav.buffer);

      expect(float32.length).toBe(800);
      // Ensure samples are within valid normalized audio range [-1.0, 1.0]
      for (let i = 0; i < float32.length; i++) {
        expect(float32[i]).toBeGreaterThanOrEqual(-1.0);
        expect(float32[i]).toBeLessThanOrEqual(1.0);
      }
    });

    it('correctly downmixes stereo 16-bit PCM WAV to mono', () => {
      const numSamples = 100;
      const numChannels = 2;
      const dataSize = numSamples * numChannels * 2;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      // Header
      view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
      view.setUint32(4, 36 + dataSize, true);
      view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
      view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, 16000, true);
      view.setUint32(28, 16000 * numChannels * 2, true);
      view.setUint16(32, numChannels * 2, true);
      view.setUint16(34, 16, true);
      view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
      view.setUint32(40, dataSize, true);

      // Channel 1 = +16384 (~0.5), Channel 2 = -16384 (~-0.5) => average should be ~0.0
      for (let i = 0; i < numSamples; i++) {
        view.setInt16(44 + (i * 2) * 2, 16384, true);
        view.setInt16(44 + (i * 2 + 1) * 2, -16384, true);
      }

      const mono = parseWavToFloat32(buffer);
      expect(mono.length).toBe(numSamples);
      expect(Math.abs(mono[0])).toBeLessThan(0.01);
    });

    it('parses 32-bit IEEE float WAV format', () => {
      const numSamples = 50;
      const dataSize = numSamples * 4;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
      view.setUint32(4, 36 + dataSize, true);
      view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
      view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
      view.setUint32(16, 16, true);
      view.setUint16(20, 3, true); // IEEE Float = 3
      view.setUint16(22, 1, true);
      view.setUint32(24, 16000, true);
      view.setUint32(28, 16000 * 4, true);
      view.setUint16(32, 4, true);
      view.setUint16(34, 32, true); // 32-bit
      view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
      view.setUint32(40, dataSize, true);

      for (let i = 0; i < numSamples; i++) {
        view.setFloat32(44 + i * 4, 0.75, true);
      }

      const result = parseWavToFloat32(buffer);
      expect(result.length).toBe(numSamples);
      expect(result[0]).toBeCloseTo(0.75, 4);
    });

    it('resamples non-16kHz WAV to 16kHz', () => {
      // 3200 samples at 32kHz = 0.1s -> should resample to ~1600 samples at 16kHz
      const wav32k = createMockWavBuffer(3200, 32000);
      const result = parseWavToFloat32(wav32k.buffer);

      expect(result.length).toBe(1600);
    });

    it('rejects buffers smaller than 44 bytes', () => {
      const tiny = new ArrayBuffer(30);
      expect(() => parseWavToFloat32(tiny)).toThrow('buffer too small');
    });

    it('rejects WAV missing RIFF header', () => {
      const corrupt = createMockWavBuffer(10, 16000);
      corrupt[0] = 0x00; // Destroy 'R'
      expect(() => parseWavToFloat32(corrupt.buffer)).toThrow('missing RIFF header');
    });

    it('rejects WAV missing WAVE format identifier', () => {
      const corrupt = createMockWavBuffer(10, 16000);
      corrupt[8] = 0x00; // Destroy 'W'
      expect(() => parseWavToFloat32(corrupt.buffer)).toThrow('missing WAVE format');
    });

    it('rejects WAV missing data chunk', () => {
      const corrupt = createMockWavBuffer(10, 16000);
      corrupt[36] = 0x58; // Change 'data' to 'Xata'
      expect(() => parseWavToFloat32(corrupt.buffer)).toThrow('missing data chunk');
    });
  });

  describe('Filename Formatting Helper', () => {
    it('appends suffix before extension', () => {
      expect(getOutputFilename('movie.mp4', 'subtitled')).toBe('movie-subtitled.mp4');
      expect(getOutputFilename('clip.mkv', 'burned')).toBe('clip-burned.mp4');
    });

    it('handles files with multiple dots', () => {
      expect(getOutputFilename('release.v1.0.mp4', 'subtitled')).toBe('release.v1.0-subtitled.mp4');
    });

    it('handles files without extensions', () => {
      expect(getOutputFilename('untitled', 'subtitled')).toBe('untitled-subtitled.mp4');
      expect(getOutputFilename('', 'burned')).toBe('video-burned.mp4');
    });
  });
});
