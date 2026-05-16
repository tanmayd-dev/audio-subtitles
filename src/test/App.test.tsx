import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../App';
import * as audioModule from '../utils/audio';

// ─── Mock the Web Worker ───────────────────────────────────────────────────────
// vi.stubGlobal with a constructor needs a real `function` (not arrow fn)
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
    // Store the most recently created instance so tests can access it
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mockWorkerInstance = this;
});

vi.stubGlobal('Worker', MockWorker);

// Mock the audio decoding utility to avoid needing a real AudioContext
vi.mock('../utils/audio', () => ({
    decodeAudioFile: vi.fn().mockResolvedValue(new Float32Array(16000).fill(0.1)),
}));

// ─── Helper: send message AND flush React state ───────────────────────────────
const sendWorkerMessage = async (data: object) => {
    await act(async () => {
        if (mockWorkerInstance?.onmessage) {
            mockWorkerInstance.onmessage({ data } as MessageEvent);
        }
    });
};

const makeFile = (name = 'test.ogg') =>
    new File([new Uint8Array(100)], name, { type: 'audio/ogg' });

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('App integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('renders the hero title', () => {
        render(<App />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Audio Subtitles');
    });

    it('renders all four step sections', () => {
        render(<App />);
        expect(screen.getByText('Upload Audio')).toBeInTheDocument();
        expect(screen.getByText('Processing')).toBeInTheDocument();
        expect(screen.getByText('Transcript')).toBeInTheDocument();
        expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('sends a "load" message to worker on mount', () => {
        render(<App />);
        expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({ type: 'load' });
    });

    it('export buttons are disabled when no transcript exists', () => {
        render(<App />);
        const srtBtn = screen.getByRole('button', { name: /export srt/i });
        const txtBtn = screen.getByRole('button', { name: /export txt/i });
        expect(srtBtn).toBeDisabled();
        expect(txtBtn).toBeDisabled();
    });

    it('updates model progress bar when worker reports model_loading_progress', async () => {
        render(<App />);
        await sendWorkerMessage({ type: 'model_loading_progress', progress: 42 });
        expect(screen.getByText('42%')).toBeInTheDocument();
    });

    it('shows status "done" and enables export when complete message received', async () => {
        render(<App />);
        await sendWorkerMessage({ type: 'model_ready' });
        await sendWorkerMessage({
            type: 'complete',
            chunks: [{ timestamp: [0, 3], text: ' Test subtitle.' }],
        });

        expect(screen.getByText('done')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /export srt/i })).not.toBeDisabled();
        expect(screen.getByRole('button', { name: /export txt/i })).not.toBeDisabled();
    });

    it('shows error message when worker reports an error', async () => {
        render(<App />);
        await sendWorkerMessage({ type: 'error', message: 'Model failed to load.' });
        expect(screen.getByText(/model failed to load/i)).toBeInTheDocument();
    });

    it('dropping a file triggers audio decoding (decodeAudioFile called)', async () => {
        // App starts in 'loading_model' state (disabled). We must signal model_ready first.
        const decodeSpy = vi.spyOn(audioModule, 'decodeAudioFile');
        render(<App />);

        // Signal model ready — this transitions App to idle (enabled)
        await sendWorkerMessage({ type: 'model_ready' });

        // Wait for uploader to become interactive (disabled attr removed)
        await waitFor(() =>
            expect(screen.getByLabelText('Upload audio file')).not.toHaveAttribute('disabled')
        );

        const dropZone = screen.getByLabelText('Upload audio file');
        const file = makeFile();
        await act(async () => {
            fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
        });

        expect(decodeSpy).toHaveBeenCalledWith(file);
    });

    it('updates transcript display when a chunk arrives', async () => {
        render(<App />);
        await sendWorkerMessage({ type: 'model_ready' });
        await sendWorkerMessage({ type: 'chunk', data: { timestamp: [0, 2], text: ' Hello from worker.' } });
        expect(screen.getByText(/hello from worker/i)).toBeInTheDocument();
    });
});
