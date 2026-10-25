import type { LiveStreamStats } from '../types/studio';
import { resampleTo16kHz } from '../utils/audio';

export interface LiveAudioConfig {
  /** Target window duration in seconds for each emitted audio chunk (default: 3.0s) */
  windowDurationSec?: number;
  /** Overlap duration in seconds between consecutive chunks (default: 0.5s) */
  overlapDurationSec?: number;
  /** ScriptProcessor buffer size (must be 256, 512, 1024, 2048, 4096, 8192, or 16384). Default: 4096 */
  bufferSize?: number;
}

const DEFAULT_CONFIG: Required<LiveAudioConfig> = {
  windowDurationSec: 3.0,
  overlapDurationSec: 0.5,
  bufferSize: 4096,
};

/**
 * Service for capturing real-time live audio from user microphone or tab sharing,
 * calculating RMS audio levels, resampling frames to 16,000 Hz, and emitting
 * sliding window PCM buffers for Whisper model inference.
 */
export class LiveAudioService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private muteGainNode: GainNode | null = null;

  private running: boolean = false;
  private currentSource: 'mic' | 'tab' | 'idle' = 'idle';
  private pcmBuffer: Float32Array = new Float32Array(0);

  private onChunkCallback: ((pcm16kHz: Float32Array) => void) | null = null;
  private onStatsCallback: ((stats: LiveStreamStats) => void) | null = null;

  private config: Required<LiveAudioConfig>;

  constructor(config?: LiveAudioConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Updates sliding window configuration.
   */
  public setConfig(config: Partial<LiveAudioConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Returns the current configuration.
   */
  public getConfig(): Readonly<Required<LiveAudioConfig>> {
    return this.config;
  }

  /**
   * Returns whether live audio capture is currently active.
   */
  public isActive(): boolean {
    return this.running;
  }

  /**
   * Returns the current active audio source.
   */
  public getSource(): 'mic' | 'tab' | 'idle' {
    return this.currentSource;
  }

  /**
   * Starts live audio capture from the specified source ('mic' or 'tab').
   *
   * @param source 'mic' for user microphone, 'tab' for system/tab audio share.
   * @param onChunk Callback receiving 16kHz mono Float32Array sliding audio window.
   * @param onStats Callback receiving audio levels (RMS 0-1) and stream status.
   */
  public async start(
    source: 'mic' | 'tab',
    onChunk: (pcm16kHz: Float32Array) => void,
    onStats: (stats: LiveStreamStats) => void
  ): Promise<void> {
    // If already active, cleanly stop first
    if (this.isActive()) {
      this.stop();
    }

    this.onChunkCallback = onChunk;
    this.onStatsCallback = onStats;
    this.currentSource = source;
    this.pcmBuffer = new Float32Array(0);

    try {
      if (!navigator?.mediaDevices) {
        throw new Error('navigator.mediaDevices is not supported in this environment.');
      }

      let stream: MediaStream;
      if (source === 'mic') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } else {
        // Tab / System audio via Screen Capture API
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });

        // Immediately stop video tracks to save resources
        const videoTracks = stream.getVideoTracks();
        for (const track of videoTracks) {
          track.stop();
        }

        // Validate that an audio track was provided
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error('No audio track was selected. Please make sure to check "Share audio" when selecting the tab.');
        }
      }

      this.mediaStream = stream;

      // Handle stream termination (e.g. user clicks browser "Stop Sharing" button)
      const audioTracks = stream.getAudioTracks();
      for (const track of audioTracks) {
        track.onended = () => {
          this.stop();
        };
      }

      // Initialize Web Audio Context
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API (AudioContext) is not available.');
      }

      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Audio processing pipeline:
      // StreamSource -> ScriptProcessor -> MuteGain(0) -> Destination
      // (Mute gain prevents acoustic feedback loop while keeping node alive)
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.processorNode = this.audioContext.createScriptProcessor(
        this.config.bufferSize,
        1,
        1
      );
      this.muteGainNode = this.audioContext.createGain();
      this.muteGainNode.gain.value = 0;

      const sampleRate = this.audioContext.sampleRate;
      const targetWindowSamples = Math.round(this.config.windowDurationSec * 16000);
      const targetOverlapSamples = Math.round(this.config.overlapDurationSec * 16000);
      const targetStepSamples = Math.max(1, targetWindowSamples - targetOverlapSamples);

      this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this.running) return;

        const inputBuffer = event.inputBuffer;
        const numChannels = inputBuffer.numberOfChannels;
        const length = inputBuffer.length;

        // Downmix channels to mono
        const mono = new Float32Array(length);
        for (let c = 0; c < numChannels; c++) {
          const channelData = inputBuffer.getChannelData(c);
          for (let i = 0; i < length; i++) {
            mono[i] += channelData[i] / numChannels;
          }
        }

        // Calculate RMS volume level
        let sum = 0;
        for (let i = 0; i < length; i++) {
          const val = mono[i];
          sum += val * val;
        }
        const rms = length > 0 ? Math.sqrt(sum / length) : 0;
        const rmsLevel = Math.min(1, Math.max(0, rms * 5));

        this.onStatsCallback?.({
          isActive: true,
          rmsLevel,
          source: this.currentSource,
        });

        // Resample mono frame to 16,000 Hz
        const resampled = resampleTo16kHz(mono, sampleRate);
        if (resampled.length === 0) return;

        // Accumulate resampled samples into sliding buffer
        const nextBuffer = new Float32Array(this.pcmBuffer.length + resampled.length);
        nextBuffer.set(this.pcmBuffer);
        nextBuffer.set(resampled, this.pcmBuffer.length);
        this.pcmBuffer = nextBuffer;

        // Emit sliding window chunks when buffer reaches target window size
        while (this.pcmBuffer.length >= targetWindowSamples) {
          const chunk = this.pcmBuffer.slice(0, targetWindowSamples);
          this.onChunkCallback?.(chunk);
          this.pcmBuffer = this.pcmBuffer.slice(targetStepSamples);
        }
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.muteGainNode);
      this.muteGainNode.connect(this.audioContext.destination);

      this.running = true;

      // Initial stats announcement
      this.onStatsCallback({
        isActive: true,
        rmsLevel: 0,
        source: this.currentSource,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.stop();
      if (this.onStatsCallback) {
        this.onStatsCallback({
          isActive: false,
          rmsLevel: 0,
          source: 'idle',
          error: errorMsg,
        });
      }
      throw err;
    }
  }

  /**
   * Stops live audio capture, disconnects all audio nodes, stops media tracks,
   * closes AudioContext, and notifies stats callback.
   */
  public stop(): void {
    this.running = false;
    this.currentSource = 'idle';

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.processorNode = null;
    }

    if (this.muteGainNode) {
      try {
        this.muteGainNode.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.muteGainNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      try {
        const tracks = this.mediaStream.getTracks();
        for (const track of tracks) {
          track.onended = null;
          track.stop();
        }
      } catch {
        // Ignore track stop errors
      }
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        // Ignore audioContext close errors
      }
      this.audioContext = null;
    }

    this.pcmBuffer = new Float32Array(0);

    if (this.onStatsCallback) {
      this.onStatsCallback({
        isActive: false,
        rmsLevel: 0,
        source: 'idle',
      });
    }
  }
}

/** Global singleton instance */
export const liveAudioService = new LiveAudioService();
