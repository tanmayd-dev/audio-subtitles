import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../App';

// Mock Web Worker
let mockWorkerInstance: {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage: ((e: MessageEvent) => void) | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockWorker = vi.fn(function (this: any) {
  this.postMessage = vi.fn();
  this.terminate = vi.fn();
  this.onmessage = null;
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  mockWorkerInstance = this;
});

vi.stubGlobal('Worker', MockWorker);

vi.mock('../utils/audio', () => ({
  decodeAudioFile: vi.fn().mockResolvedValue(new Float32Array(16000).fill(0.1)),
  resampleTo16kHz: vi.fn((buf) => buf),
}));

describe('Studio Mode Navigation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows switching to Live Captions mode and renders live recording options', async () => {
    render(<App />);

    const liveTab = screen.getByRole('tab', { name: /live captions/i });
    fireEvent.click(liveTab);

    expect(screen.getByRole('region', { name: /live captions mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /capture tab \/ meeting audio/i })).toBeInTheDocument();
  });

  it('allows switching to Video Studio mode and displays video player and subtitle timeline', async () => {
    render(<App />);

    const videoTab = screen.getByRole('tab', { name: /video studio/i });
    fireEvent.click(videoTab);

    expect(screen.getByRole('region', { name: /video studio mode/i })).toBeInTheDocument();
    expect(screen.getByText(/no video loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/subtitle timeline/i)).toBeInTheDocument();
  });

  it('allows switching to Subtitle Editor mode and displays import control', async () => {
    render(<App />);

    const editorTab = screen.getByRole('tab', { name: /subtitle editor/i });
    fireEvent.click(editorTab);

    expect(screen.getByRole('region', { name: /subtitle editor mode/i })).toBeInTheDocument();
    expect(screen.getByText(/import subtitle file/i)).toBeInTheDocument();
  });

  it('displays new export formats (VTT, ASS, JSON)', async () => {
    render(<App />);

    // Signal model ready and send complete transcript chunks
    await act(async () => {
      mockWorkerInstance?.onmessage?.({
        data: {
          type: 'complete',
          chunks: [{ timestamp: [0, 2], text: 'Test transcription cue' }],
        },
      } as MessageEvent);
    });

    expect(screen.getByRole('button', { name: /export vtt/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /export ass/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /json/i })).not.toBeDisabled();
  });

  it('guarantees model progress increases monotonically and never flickers backwards', async () => {
    render(<App />);

    // First file reaches 50%
    await act(async () => {
      mockWorkerInstance?.onmessage?.({
        data: { type: 'model_loading_progress', progress: 50 },
      } as MessageEvent);
    });
    expect(screen.getByText('50%')).toBeInTheDocument();

    // A sub-asset callback emits 5% (would cause flickering without monotonic clamping)
    await act(async () => {
      mockWorkerInstance?.onmessage?.({
        data: { type: 'model_loading_progress', progress: 5 },
      } as MessageEvent);
    });
    // Should still display 50%, ignoring regression to 5%
    expect(screen.getByText('50%')).toBeInTheDocument();

    // Progress moves up to 85%
    await act(async () => {
      mockWorkerInstance?.onmessage?.({
        data: { type: 'model_loading_progress', progress: 85 },
      } as MessageEvent);
    });
    expect(screen.getByText('85%')).toBeInTheDocument();
  });
});
