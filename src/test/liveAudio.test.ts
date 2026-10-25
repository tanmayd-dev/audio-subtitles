import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveAudioService, liveAudioService } from '../services/liveAudio.service';
import type { LiveStreamStats } from '../types/studio';

describe('LiveAudioService', () => {
  let mockGetUserMedia: ReturnType<typeof vi.fn>;
  let mockGetDisplayMedia: ReturnType<typeof vi.fn>;
  let mockAudioTrack: { kind: string; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
  let mockVideoTrack: { kind: string; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
  let mockStream: {
    getTracks: ReturnType<typeof vi.fn>;
    getAudioTracks: ReturnType<typeof vi.fn>;
    getVideoTracks: ReturnType<typeof vi.fn>;
  };
  let mockProcessorNode: {
    onaudioprocess: ((event: unknown) => void) | null;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let mockGainNode: {
    gain: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let mockSourceNode: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let mockAudioContextInstance: {
    sampleRate: number;
    state: string;
    resume: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    createMediaStreamSource: ReturnType<typeof vi.fn>;
    createScriptProcessor: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    destination: Record<string, unknown>;
  };

  beforeEach(() => {
    mockAudioTrack = {
      kind: 'audio',
      stop: vi.fn(),
      onended: null,
    };
    mockVideoTrack = {
      kind: 'video',
      stop: vi.fn(),
      onended: null,
    };

    mockStream = {
      getTracks: vi.fn(() => [mockAudioTrack, mockVideoTrack]),
      getAudioTracks: vi.fn(() => [mockAudioTrack]),
      getVideoTracks: vi.fn(() => [mockVideoTrack]),
    };

    mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
    mockGetDisplayMedia = vi.fn().mockResolvedValue(mockStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
        getDisplayMedia: mockGetDisplayMedia,
      },
      configurable: true,
      writable: true,
    });

    mockGainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    mockProcessorNode = {
      onaudioprocess: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    mockAudioContextInstance = {
      sampleRate: 48000,
      state: 'running',
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      createMediaStreamSource: vi.fn(() => mockSourceNode),
      createScriptProcessor: vi.fn(() => mockProcessorNode),
      createGain: vi.fn(() => mockGainNode),
      destination: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.stubGlobal('AudioContext', vi.fn(function (this: any) {
      Object.assign(this, mockAudioContextInstance);
      return this;
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes in an idle inactive state', () => {
    const service = new LiveAudioService();
    expect(service.isActive()).toBe(false);
    expect(service.getSource()).toBe('idle');
  });

  it('exports singleton liveAudioService instance', () => {
    expect(liveAudioService).toBeInstanceOf(LiveAudioService);
    expect(liveAudioService.isActive()).toBe(false);
  });

  it('starts microphone capture with expected audio constraints', async () => {
    const service = new LiveAudioService();
    const onChunk = vi.fn();
    const onStats = vi.fn();

    await service.start('mic', onChunk, onStats);

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    expect(service.isActive()).toBe(true);
    expect(service.getSource()).toBe('mic');

    // Should emit initial active stats
    expect(onStats).toHaveBeenCalledWith({
      isActive: true,
      rmsLevel: 0,
      source: 'mic',
    });
  });

  it('starts tab capture and stops video track immediately', async () => {
    const service = new LiveAudioService();
    const onChunk = vi.fn();
    const onStats = vi.fn();

    await service.start('tab', onChunk, onStats);

    expect(mockGetDisplayMedia).toHaveBeenCalledWith({
      audio: true,
      video: true,
    });

    // Tab video track should be stopped to conserve resources
    expect(mockVideoTrack.stop).toHaveBeenCalled();

    expect(service.isActive()).toBe(true);
    expect(service.getSource()).toBe('tab');
    expect(onStats).toHaveBeenCalledWith({
      isActive: true,
      rmsLevel: 0,
      source: 'tab',
    });
  });

  it('throws and resets stats if tab sharing has no audio track', async () => {
    const service = new LiveAudioService();
    const onChunk = vi.fn();
    const onStats = vi.fn();

    // Stream with video track only, no audio track
    mockStream.getAudioTracks.mockReturnValue([]);
    mockStream.getVideoTracks.mockReturnValue([mockVideoTrack]);
    mockStream.getTracks.mockReturnValue([mockVideoTrack]);

    await expect(service.start('tab', onChunk, onStats)).rejects.toThrow(
      /No audio track was selected/i
    );

    expect(service.isActive()).toBe(false);
    expect(service.getSource()).toBe('idle');
    expect(mockVideoTrack.stop).toHaveBeenCalled();
  });

  it('cleans up resources and resets state when stop() is called', async () => {
    const service = new LiveAudioService();
    const onChunk = vi.fn();
    const onStats = vi.fn();

    await service.start('mic', onChunk, onStats);
    expect(service.isActive()).toBe(true);

    service.stop();

    expect(service.isActive()).toBe(false);
    expect(service.getSource()).toBe('idle');
    expect(mockAudioTrack.stop).toHaveBeenCalled();
    expect(mockProcessorNode.disconnect).toHaveBeenCalled();
    expect(mockSourceNode.disconnect).toHaveBeenCalled();
    expect(mockGainNode.disconnect).toHaveBeenCalled();
    expect(mockAudioContextInstance.close).toHaveBeenCalled();

    expect(onStats).toHaveBeenLastCalledWith({
      isActive: false,
      rmsLevel: 0,
      source: 'idle',
    });
  });

  it('automatically triggers stop() when audio track ends (e.g. user stops sharing)', async () => {
    const service = new LiveAudioService();
    const onChunk = vi.fn();
    const onStats = vi.fn();

    await service.start('tab', onChunk, onStats);
    expect(service.isActive()).toBe(true);

    // Verify track.onended listener was registered
    expect(mockAudioTrack.onended).toBeTypeOf('function');

    // Trigger browser track onended
    mockAudioTrack.onended!();

    expect(service.isActive()).toBe(false);
    expect(service.getSource()).toBe('idle');
    expect(onStats).toHaveBeenLastCalledWith({
      isActive: false,
      rmsLevel: 0,
      source: 'idle',
    });
  });

  it('computes RMS volume level on audio process event', async () => {
    const service = new LiveAudioService();
    const onChunk = vi.fn();
    const statsHistory: LiveStreamStats[] = [];
    const onStats = vi.fn((s: LiveStreamStats) => statsHistory.push(s));

    await service.start('mic', onChunk, onStats);
    expect(mockProcessorNode.onaudioprocess).toBeTypeOf('function');

    // Simulate an audio processing event with steady amplitude 0.1
    const bufferSize = 4096;
    const channelData = new Float32Array(bufferSize).fill(0.1);
    const audioEvent = {
      inputBuffer: {
        numberOfChannels: 1,
        length: bufferSize,
        getChannelData: vi.fn(() => channelData),
      },
    };

    mockProcessorNode.onaudioprocess!(audioEvent);

    // RMS of 0.1 array is 0.1; rmsLevel = min(1, 0.1 * 5) = 0.5
    const latestStats = statsHistory[statsHistory.length - 1];
    expect(latestStats.isActive).toBe(true);
    expect(latestStats.source).toBe('mic');
    expect(latestStats.rmsLevel).toBeCloseTo(0.5, 2);
  });

  it('accumulates and emits sliding window PCM chunks at 16kHz', async () => {
    // 0.1s window = 1600 samples at 16kHz, overlap 0.05s = 800 samples
    const service = new LiveAudioService({
      windowDurationSec: 0.1,
      overlapDurationSec: 0.05,
      bufferSize: 2048,
    });

    const receivedChunks: Float32Array[] = [];
    const onChunk = vi.fn((chunk: Float32Array) => receivedChunks.push(chunk));
    const onStats = vi.fn();

    await service.start('mic', onChunk, onStats);

    // Push 3 frames of audio (2048 samples at 48kHz resamples to ~683 samples at 16kHz each)
    // 3 * 683 = ~2049 samples, which exceeds windowDuration 1600 samples
    const channelData = new Float32Array(2048).fill(0.05);
    const audioEvent = {
      inputBuffer: {
        numberOfChannels: 1,
        length: 2048,
        getChannelData: vi.fn(() => channelData),
      },
    };

    mockProcessorNode.onaudioprocess!(audioEvent);
    mockProcessorNode.onaudioprocess!(audioEvent);
    mockProcessorNode.onaudioprocess!(audioEvent);

    expect(receivedChunks.length).toBeGreaterThan(0);
    // Target window duration 0.1s * 16000 = 1600 samples
    expect(receivedChunks[0].length).toBe(1600);
    expect(receivedChunks[0]).toBeInstanceOf(Float32Array);
  });

  it('stops previous capture before starting a new one on double start', async () => {
    const service = new LiveAudioService();
    const onChunk = vi.fn();
    const onStats = vi.fn();

    await service.start('mic', onChunk, onStats);
    const firstTrackStop = mockAudioTrack.stop;

    // Start tab without calling stop() manually
    await service.start('tab', onChunk, onStats);

    expect(firstTrackStop).toHaveBeenCalled();
    expect(service.getSource()).toBe('tab');
    expect(service.isActive()).toBe(true);
  });

  it('handles permission denied error cleanly', async () => {
    const service = new LiveAudioService();
    const onChunk = vi.fn();
    const onStats = vi.fn();

    mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(service.start('mic', onChunk, onStats)).rejects.toThrow('Permission denied');
    expect(service.isActive()).toBe(false);
    expect(onStats).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isActive: false,
        source: 'idle',
        error: 'Permission denied',
      })
    );
  });
});
