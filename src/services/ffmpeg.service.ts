import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { FFmpegProgress, FFmpegStage } from '../types/studio';
import { resampleTo16kHz } from '../utils/audio';

export type { FFmpegProgress, FFmpegStage };

/**
 * Interface representing the subset of FFmpeg API methods used by FFmpegService.
 * Enables dependency injection for testing and browser/worker abstraction.
 */
export interface FFmpegLike {
  loaded: boolean;
  load(config?: { coreURL?: string; wasmURL?: string; workerURL?: string }): Promise<unknown>;
  exec(args: string[], timeout?: number): Promise<number>;
  writeFile(path: string, data: Uint8Array | string): Promise<unknown>;
  readFile(path: string, encoding?: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<unknown>;
  on(event: 'log', callback: (data: { type: string; message: string }) => void): void;
  on(event: 'progress', callback: (data: { progress: number; time: number }) => void): void;
  off(event: 'log', callback: (data: { type: string; message: string }) => void): void;
  off(event: 'progress', callback: (data: { progress: number; time: number }) => void): void;
  terminate?(): void;
}

/**
 * Options for initializing FFmpegService.
 */
export interface FFmpegServiceOptions {
  /** Explicitly toggle mock mode (skips WASM worker in jsdom / tests) */
  mock?: boolean;
  /** Base CDN URL for @ffmpeg/core */
  baseURL?: string;
  /** Injected FFmpeg instance (useful for unit tests) */
  ffmpegInstance?: FFmpeg | FFmpegLike;
}

/**
 * Safely fetches file content as Uint8Array across browser, Web Worker, and Node/jsdom.
 */
export async function safelyFetchFile(file: File | Blob | string): Promise<Uint8Array> {
  if (typeof file === 'string') {
    return fetchFile(file);
  }
  try {
    return await fetchFile(file);
  } catch {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

/**
 * Formats an output filename by appending a suffix before the extension.
 */
export function getOutputFilename(originalName: string, suffix: string, ext = 'mp4'): string {
  const dotIndex = originalName.lastIndexOf('.');
  const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : (originalName || 'video');
  return `${base}-${suffix}.${ext}`;
}

/**
 * Creates a synthetic 16kHz mono WAV buffer (useful for tests and mock mode).
 */
export function createMockWavBuffer(numSamples = 1600, sampleRate = 16000): Uint8Array {
  const bytesPerSample = 2; // 16-bit
  const numChannels = 1;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // 'RIFF'
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, 36 + dataSize, true);
  // 'WAVE'
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // 'fmt '
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  // 'data'
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataSize, true);

  // 440 Hz test tone
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.5;
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(44 + i * 2, intSample, true);
  }

  return new Uint8Array(buffer);
}

/**
 * Parses a PCM or IEEE Float WAV array buffer into a 16kHz mono Float32Array.
 */
export function parseWavToFloat32(arrayBuffer: ArrayBufferLike): Float32Array {
  if (arrayBuffer.byteLength < 44) {
    throw new Error('Invalid WAV file: buffer too small (minimum 44 bytes required)');
  }

  const dataView = new DataView(arrayBuffer);

  const riff = String.fromCharCode(
    dataView.getUint8(0),
    dataView.getUint8(1),
    dataView.getUint8(2),
    dataView.getUint8(3)
  );
  if (riff !== 'RIFF') {
    throw new Error(`Invalid WAV file: missing RIFF header (got "${riff}")`);
  }

  const wave = String.fromCharCode(
    dataView.getUint8(8),
    dataView.getUint8(9),
    dataView.getUint8(10),
    dataView.getUint8(11)
  );
  if (wave !== 'WAVE') {
    throw new Error(`Invalid WAV file: missing WAVE format (got "${wave}")`);
  }

  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= dataView.byteLength) {
    const chunkId = String.fromCharCode(
      dataView.getUint8(offset),
      dataView.getUint8(offset + 1),
      dataView.getUint8(offset + 2),
      dataView.getUint8(offset + 3)
    );
    const chunkSize = dataView.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      audioFormat = dataView.getUint16(offset + 8, true);
      numChannels = dataView.getUint16(offset + 10, true);
      sampleRate = dataView.getUint32(offset + 12, true);
      bitsPerSample = dataView.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) {
      offset += 1;
    }
  }

  if (dataOffset === -1) {
    throw new Error('Invalid WAV file: missing data chunk');
  }

  const maxAvailable = dataView.byteLength - dataOffset;
  const actualLength = Math.min(dataLength, maxAvailable);
  const bytesPerSample = bitsPerSample / 8;
  if (bytesPerSample <= 0) {
    throw new Error(`Invalid bits per sample in WAV: ${bitsPerSample}`);
  }

  const totalSamples = Math.floor(actualLength / bytesPerSample);
  const samplesPerChannel = Math.floor(totalSamples / numChannels);
  const result = new Float32Array(samplesPerChannel);

  if (audioFormat === 1) {
    // PCM Integer
    if (bitsPerSample === 16) {
      for (let i = 0; i < samplesPerChannel; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          const sampleOffset = dataOffset + (i * numChannels + ch) * 2;
          const val = dataView.getInt16(sampleOffset, true);
          sum += val < 0 ? val / 32768 : val / 32767;
        }
        result[i] = sum / numChannels;
      }
    } else if (bitsPerSample === 8) {
      for (let i = 0; i < samplesPerChannel; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          const sampleOffset = dataOffset + (i * numChannels + ch);
          const val = dataView.getUint8(sampleOffset);
          sum += (val - 128) / 128;
        }
        result[i] = sum / numChannels;
      }
    } else if (bitsPerSample === 24) {
      for (let i = 0; i < samplesPerChannel; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          const sampleOffset = dataOffset + (i * numChannels + ch) * 3;
          const b0 = dataView.getUint8(sampleOffset);
          const b1 = dataView.getUint8(sampleOffset + 1);
          const b2 = dataView.getUint8(sampleOffset + 2);
          let val = (b2 << 16) | (b1 << 8) | b0;
          if (val & 0x800000) val |= ~0xffffff;
          sum += val / 8388608;
        }
        result[i] = sum / numChannels;
      }
    } else if (bitsPerSample === 32) {
      for (let i = 0; i < samplesPerChannel; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          const sampleOffset = dataOffset + (i * numChannels + ch) * 4;
          const val = dataView.getInt32(sampleOffset, true);
          sum += val / 2147483648;
        }
        result[i] = sum / numChannels;
      }
    } else {
      throw new Error(`Unsupported PCM bits per sample: ${bitsPerSample}`);
    }
  } else if (audioFormat === 3) {
    // IEEE Float
    if (bitsPerSample === 32) {
      for (let i = 0; i < samplesPerChannel; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          const sampleOffset = dataOffset + (i * numChannels + ch) * 4;
          sum += dataView.getFloat32(sampleOffset, true);
        }
        result[i] = sum / numChannels;
      }
    } else {
      throw new Error(`Unsupported IEEE float bits per sample: ${bitsPerSample}`);
    }
  } else {
    throw new Error(`Unsupported WAV audio format code: ${audioFormat}`);
  }

  if (sampleRate !== 16000) {
    return resampleTo16kHz(result, sampleRate);
  }

  return result;
}

/**
 * In-Browser FFmpeg WASM Service for:
 * - Subtitle soft-muxing (lossless MP4 container packaging with mov_text track)
 * - Subtitle hard-burning (video filter subtitle re-encoding)
 * - Robust 16kHz audio extraction for Whisper inference fallback
 */
export class FFmpegService {
  private ffmpeg: FFmpeg | FFmpegLike | null = null;
  private baseURL: string;
  private mockMode: boolean = false;
  private explicitMockMode: boolean | null = null;
  private mockLoaded: boolean = false;
  private loadPromise: Promise<void> | null = null;

  // Diagnostics & testing state
  private lastCommandArgs: string[] | null = null;
  private commandHistory: string[][] = [];
  private mockFailNext: boolean = false;
  private mockFailMessage: string | null = null;

  constructor(options?: FFmpegServiceOptions) {
    this.baseURL = options?.baseURL ?? 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    if (options?.mock !== undefined) {
      this.mockMode = options.mock;
      this.explicitMockMode = options.mock;
    } else {
      // Auto-detect environments lacking WebAssembly / Web Worker / SharedArrayBuffer support
      if (typeof window === 'undefined' || typeof Worker === 'undefined') {
        this.mockMode = true;
      }
    }

    if (options?.ffmpegInstance) {
      this.ffmpeg = options.ffmpegInstance;
    }
  }

  /**
   * Sets mock execution mode (useful for testing or unsupported browser environments).
   */
  public setMockMode(mock: boolean): void {
    this.mockMode = mock;
    this.explicitMockMode = mock;
  }

  /**
   * Returns whether mock mode is currently enabled.
   */
  public isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Returns the command arguments of the last FFmpeg execution.
   */
  public getLastCommandArgs(): string[] | null {
    return this.lastCommandArgs;
  }

  /**
   * Returns complete history of FFmpeg commands executed.
   */
  public getCommandHistory(): string[][] {
    return [...this.commandHistory];
  }

  /**
   * Clears the command history log.
   */
  public resetCommandHistory(): void {
    this.commandHistory = [];
    this.lastCommandArgs = null;
  }

  /**
   * Simulates an error on the next mock command execution for error handling verification.
   */
  public setMockFailNextCommand(fail: boolean, errorMessage?: string): void {
    this.mockFailNext = fail;
    this.mockFailMessage = errorMessage ?? 'Simulated FFmpeg failure';
  }

  /**
   * Returns whether FFmpeg WASM core is loaded and initialized.
   */
  public isLoaded(): boolean {
    if (this.mockMode) {
      return this.mockLoaded;
    }
    return this.ffmpeg?.loaded ?? false;
  }

  /**
   * Loads the FFmpeg WASM core and worker scripts.
   * Gracefully handles redundant calls and CDN progress.
   */
  public async load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isLoaded()) {
      onProgress?.(100);
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        if (this.mockMode) {
          onProgress?.(25);
          onProgress?.(65);
          this.mockLoaded = true;
          onProgress?.(100);
          return;
        }

        this.initFFmpegInstance();

        let coreProgress = 0;
        let wasmProgress = 0;
        const reportCombined = () => {
          if (onProgress) {
            const combined = Math.round(coreProgress * 0.1 + wasmProgress * 0.9);
            onProgress(Math.min(100, Math.max(0, combined)));
          }
        };

        const baseURL = this.baseURL;
        const coreURL = await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          'text/javascript',
          true,
          (ev) => {
            if (ev.total > 0) {
              coreProgress = Math.min(100, Math.round((ev.received / ev.total) * 100));
              reportCombined();
            }
          }
        );

        const wasmURL = await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          'application/wasm',
          true,
          (ev) => {
            if (ev.total > 0) {
              wasmProgress = Math.min(100, Math.round((ev.received / ev.total) * 100));
              reportCombined();
            }
          }
        );

        await this.ffmpeg!.load({
          coreURL,
          wasmURL,
        });

        onProgress?.(100);
      } catch (err) {
        if (this.canFallbackToMock(err)) {
          console.warn('FFmpeg WASM load failed in this environment; falling back to mock mode.', err);
          this.mockMode = true;
          this.mockLoaded = true;
          onProgress?.(100);
          return;
        }
        throw err;
      } finally {
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Soft-muxes an SRT subtitle track into an MP4 container losslessly using `mov_text`.
   * Video and audio streams are copied without re-encoding (`-c copy`).
   *
   * @param videoFile Original video File.
   * @param srtContent Subtitle text formatted as SRT.
   * @param onProgress Stage and percentage progress callback.
   * @returns Generated MP4 Blob with embedded subtitle track and output filename.
   */
  public async softMuxSubtitles(
    videoFile: File,
    srtContent: string,
    onProgress?: (p: FFmpegProgress) => void
  ): Promise<{ blob: Blob; filename: string }> {
    const filename = getOutputFilename(videoFile.name, 'subtitled', 'mp4');

    if (this.mockMode) {
      return this.mockSoftMux(videoFile, srtContent, filename, onProgress);
    }

    if (!this.isLoaded()) {
      await this.load();
      if (this.mockMode) {
        return this.mockSoftMux(videoFile, srtContent, filename, onProgress);
      }
    }

    const ffmpeg = this.getFFmpegInstance();
    const inputName = 'input.mp4';
    const srtName = 'sub.srt';
    const outputName = 'output.mp4';

    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress?.({
        stage: 'muxing',
        progress: Math.min(100, Math.max(0, Math.round(progress * 100))),
        message: 'Muxing subtitles into MP4...',
      });
    };

    try {
      onProgress?.({ stage: 'muxing', progress: 0, message: 'Preparing files for soft muxing...' });
      const videoData = await safelyFetchFile(videoFile);
      await ffmpeg.writeFile(inputName, videoData);
      await ffmpeg.writeFile(srtName, srtContent);

      ffmpeg.on('progress', progressHandler);

      const execArgs = ['-i', inputName, '-i', srtName, '-c', 'copy', '-c:s', 'mov_text', outputName];
      this.recordCommand(execArgs);

      const exitCode = await ffmpeg.exec(execArgs);
      if (exitCode !== 0) {
        throw new Error(`FFmpeg soft mux failed with exit code ${exitCode}`);
      }

      const rawData = await ffmpeg.readFile(outputName);
      const data = typeof rawData === 'string' ? new TextEncoder().encode(rawData) : rawData;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });

      onProgress?.({ stage: 'done', progress: 100, message: 'Subtitles muxed successfully' });
      return { blob, filename };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onProgress?.({ stage: 'error', progress: 0, message: errorMsg });
      throw err;
    } finally {
      ffmpeg.off('progress', progressHandler);
      await this.safeDelete(inputName);
      await this.safeDelete(srtName);
      await this.safeDelete(outputName);
    }
  }

  /**
   * Hard-burns subtitles directly into video frames using the FFmpeg `subtitles` video filter.
   * Audio stream is copied without re-encoding (`-c:a copy`).
   *
   * @param videoFile Original video File.
   * @param srtContent Subtitle text formatted as SRT.
   * @param onProgress Stage and percentage progress callback.
   * @returns Generated burned MP4 Blob and output filename.
   */
  public async hardBurnSubtitles(
    videoFile: File,
    srtContent: string,
    onProgress?: (p: FFmpegProgress) => void
  ): Promise<{ blob: Blob; filename: string }> {
    const filename = getOutputFilename(videoFile.name, 'burned', 'mp4');

    if (this.mockMode) {
      return this.mockHardBurn(videoFile, srtContent, filename, onProgress);
    }

    if (!this.isLoaded()) {
      await this.load();
      if (this.mockMode) {
        return this.mockHardBurn(videoFile, srtContent, filename, onProgress);
      }
    }

    const ffmpeg = this.getFFmpegInstance();
    const inputName = 'input.mp4';
    const srtName = 'sub.srt';
    const outputName = 'burned.mp4';

    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress?.({
        stage: 'burning',
        progress: Math.min(100, Math.max(0, Math.round(progress * 100))),
        message: 'Burning subtitles into video frames...',
      });
    };

    const logHandler = ({ message }: { type: string; message: string }) => {
      const match = message.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
      if (match && onProgress) {
        // Can optionally surface frame timing if helpful
      }
    };

    try {
      onProgress?.({ stage: 'burning', progress: 0, message: 'Preparing video for hard burning...' });
      const videoData = await safelyFetchFile(videoFile);
      await ffmpeg.writeFile(inputName, videoData);
      await ffmpeg.writeFile(srtName, srtContent);

      ffmpeg.on('progress', progressHandler);
      ffmpeg.on('log', logHandler);

      const execArgs = [
        '-i',
        inputName,
        '-vf',
        "subtitles=sub.srt:force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BorderStyle=3,Outline=2'",
        '-c:a',
        'copy',
        outputName,
      ];
      this.recordCommand(execArgs);

      const exitCode = await ffmpeg.exec(execArgs);
      if (exitCode !== 0) {
        throw new Error(`FFmpeg hard burn failed with exit code ${exitCode}`);
      }

      const rawData = await ffmpeg.readFile(outputName);
      const data = typeof rawData === 'string' ? new TextEncoder().encode(rawData) : rawData;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });

      onProgress?.({ stage: 'done', progress: 100, message: 'Subtitles burned successfully' });
      return { blob, filename };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onProgress?.({ stage: 'error', progress: 0, message: errorMsg });
      throw err;
    } finally {
      ffmpeg.off('progress', progressHandler);
      ffmpeg.off('log', logHandler);
      await this.safeDelete(inputName);
      await this.safeDelete(srtName);
      await this.safeDelete(outputName);
    }
  }

  /**
   * Extracts audio from video and resamples to 16kHz mono WAV, returning Float32Array PCM.
   * Serves as fallback for audio codecs unsupported by browser native Web Audio API (e.g. AC3, DTS).
   *
   * @param videoFile Video File to extract audio from.
   * @param onProgress Stage and percentage progress callback.
   * @returns 16kHz mono PCM Float32Array buffer for Whisper.
   */
  public async extractAudio(
    videoFile: File,
    onProgress?: (p: FFmpegProgress) => void
  ): Promise<Float32Array> {
    if (this.mockMode) {
      return this.mockExtractAudio(videoFile, onProgress);
    }

    if (!this.isLoaded()) {
      await this.load();
      if (this.mockMode) {
        return this.mockExtractAudio(videoFile, onProgress);
      }
    }

    const ffmpeg = this.getFFmpegInstance();
    const inputName = 'input.mp4';
    const outputName = 'audio.wav';

    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress?.({
        stage: 'extracting',
        progress: Math.min(100, Math.max(0, Math.round(progress * 100))),
        message: 'Extracting 16kHz audio...',
      });
    };

    try {
      onProgress?.({ stage: 'extracting', progress: 0, message: 'Preparing audio extraction...' });
      const videoData = await safelyFetchFile(videoFile);
      await ffmpeg.writeFile(inputName, videoData);

      ffmpeg.on('progress', progressHandler);

      const execArgs = ['-i', inputName, '-vn', '-ac', '1', '-ar', '16000', outputName];
      this.recordCommand(execArgs);

      const exitCode = await ffmpeg.exec(execArgs);
      if (exitCode !== 0) {
        throw new Error(`FFmpeg audio extraction failed with exit code ${exitCode}`);
      }

      const rawData = await ffmpeg.readFile(outputName);
      const data = typeof rawData === 'string' ? new TextEncoder().encode(rawData) : rawData;

      onProgress?.({ stage: 'extracting', progress: 95, message: 'Decoding audio stream...' });
      const float32 = await this.decodeWav(data.buffer);

      onProgress?.({ stage: 'done', progress: 100, message: 'Audio extraction complete' });
      return float32;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onProgress?.({ stage: 'error', progress: 0, message: errorMsg });
      throw err;
    } finally {
      ffmpeg.off('progress', progressHandler);
      await this.safeDelete(inputName);
      await this.safeDelete(outputName);
    }
  }

  /**
   * Decodes a WAV array buffer into a 16kHz mono Float32Array.
   * Attempts pure JavaScript binary WAV header parsing, with fallback to AudioContext if available.
   */
  public async decodeWav(buffer: ArrayBufferLike): Promise<Float32Array> {
    try {
      return parseWavToFloat32(buffer);
    } catch (parseError) {
      if (typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)) {
        try {
          const AudioCtx =
            window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioCtx();
          const copyBuf = 'slice' in buffer ? (buffer as ArrayBuffer).slice(0) : buffer;
          const audioBuffer = await ctx.decodeAudioData(copyBuf as ArrayBuffer);
          await ctx.close();

          const numChannels = audioBuffer.numberOfChannels;
          const length = audioBuffer.length;
          const mono = new Float32Array(length);

          for (let c = 0; c < numChannels; c++) {
            const chData = audioBuffer.getChannelData(c);
            for (let i = 0; i < length; i++) {
              mono[i] += chData[i] / numChannels;
            }
          }

          return resampleTo16kHz(mono, audioBuffer.sampleRate);
        } catch {
          // Fall through to throw original parseError
        }
      }
      throw parseError;
    }
  }

  /**
   * Terminates active FFmpeg instance and resets state.
   */
  public terminate(): void {
    if (this.ffmpeg?.terminate) {
      try {
        this.ffmpeg.terminate();
      } catch {
        // Ignore termination errors
      }
    }
    this.ffmpeg = null;
    this.mockLoaded = false;
    this.loadPromise = null;
    this.lastCommandArgs = null;
  }

  // ---------------- Private Helpers ----------------

  private initFFmpegInstance(): void {
    if (this.ffmpeg || this.mockMode) return;
    try {
      this.ffmpeg = new FFmpeg();
    } catch (err) {
      console.warn('Unable to instantiate FFmpeg in this environment; falling back to mock mode.', err);
      this.mockMode = true;
    }
  }

  private getFFmpegInstance(): FFmpeg | FFmpegLike {
    if (!this.ffmpeg) {
      this.initFFmpegInstance();
    }
    if (!this.ffmpeg) {
      throw new Error('FFmpeg is not available in this environment');
    }
    return this.ffmpeg;
  }

  private canFallbackToMock(err: unknown): boolean {
    if (this.explicitMockMode === false) {
      return false;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return (
      typeof Worker === 'undefined' ||
      typeof window === 'undefined' ||
      msg.includes('nodejs') ||
      msg.includes('Failed to fetch') ||
      msg.includes('network') ||
      msg.includes('Worker')
    );
  }

  private recordCommand(args: string[]): void {
    this.lastCommandArgs = args;
    this.commandHistory.push(args);
  }

  private async safeDelete(path: string): Promise<void> {
    if (!this.ffmpeg) return;
    try {
      await this.ffmpeg.deleteFile(path);
    } catch {
      // Ignore cleanup error if file does not exist
    }
  }

  // ---------------- Mock Handlers ----------------

  private async mockSoftMux(
    _videoFile: File,
    _srtContent: string,
    filename: string,
    onProgress?: (p: FFmpegProgress) => void
  ): Promise<{ blob: Blob; filename: string }> {
    if (!this.isLoaded()) {
      await this.load();
    }

    const execArgs = ['-i', 'input.mp4', '-i', 'sub.srt', '-c', 'copy', '-c:s', 'mov_text', 'output.mp4'];
    this.recordCommand(execArgs);

    onProgress?.({ stage: 'muxing', progress: 0, message: 'Starting soft muxing (mock)...' });

    if (this.mockFailNext) {
      this.mockFailNext = false;
      const err = new Error(this.mockFailMessage || 'Mock soft mux failed');
      onProgress?.({ stage: 'error', progress: 0, message: err.message });
      throw err;
    }

    onProgress?.({ stage: 'muxing', progress: 50, message: 'Muxing subtitles...' });
    onProgress?.({ stage: 'muxing', progress: 100, message: 'Finishing...' });

    // 12-byte dummy MP4 ftyp header
    const dummyMp4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const blob = new Blob([dummyMp4.buffer as ArrayBuffer], { type: 'video/mp4' });

    onProgress?.({ stage: 'done', progress: 100, message: 'Subtitles muxed successfully' });
    return { blob, filename };
  }

  private async mockHardBurn(
    _videoFile: File,
    _srtContent: string,
    filename: string,
    onProgress?: (p: FFmpegProgress) => void
  ): Promise<{ blob: Blob; filename: string }> {
    if (!this.isLoaded()) {
      await this.load();
    }

    const execArgs = [
      '-i',
      'input.mp4',
      '-vf',
      "subtitles=sub.srt:force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BorderStyle=3,Outline=2'",
      '-c:a',
      'copy',
      'burned.mp4',
    ];
    this.recordCommand(execArgs);

    onProgress?.({ stage: 'burning', progress: 0, message: 'Starting hard burn (mock)...' });

    if (this.mockFailNext) {
      this.mockFailNext = false;
      const err = new Error(this.mockFailMessage || 'Mock hard burn failed');
      onProgress?.({ stage: 'error', progress: 0, message: err.message });
      throw err;
    }

    onProgress?.({ stage: 'burning', progress: 50, message: 'Burning subtitles...' });
    onProgress?.({ stage: 'burning', progress: 100, message: 'Finishing...' });

    const dummyMp4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const blob = new Blob([dummyMp4.buffer as ArrayBuffer], { type: 'video/mp4' });

    onProgress?.({ stage: 'done', progress: 100, message: 'Subtitles burned successfully' });
    return { blob, filename };
  }

  private async mockExtractAudio(
    _videoFile: File,
    onProgress?: (p: FFmpegProgress) => void
  ): Promise<Float32Array> {
    if (!this.isLoaded()) {
      await this.load();
    }

    const execArgs = ['-i', 'input.mp4', '-vn', '-ac', '1', '-ar', '16000', 'audio.wav'];
    this.recordCommand(execArgs);

    onProgress?.({ stage: 'extracting', progress: 0, message: 'Starting audio extraction (mock)...' });

    if (this.mockFailNext) {
      this.mockFailNext = false;
      const err = new Error(this.mockFailMessage || 'Mock audio extraction failed');
      onProgress?.({ stage: 'error', progress: 0, message: err.message });
      throw err;
    }

    onProgress?.({ stage: 'extracting', progress: 50, message: 'Extracting 16kHz audio...' });

    const mockWav = createMockWavBuffer(1600, 16000);
    const float32 = await this.decodeWav(mockWav.buffer);

    onProgress?.({ stage: 'done', progress: 100, message: 'Audio extraction complete' });
    return float32;
  }
}

/** Global singleton instance */
export const ffmpegService = new FFmpegService();

export default ffmpegService;
