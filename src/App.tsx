import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';
import { Diamonds } from './components/Diamonds';
import { FileUploader } from './components/FileUploader';
import { ProgressBar } from './components/ProgressBar';
import { TranscriptDisplay } from './components/TranscriptDisplay';
import { ExportControls } from './components/ExportControls';
import { decodeAudioFile } from './utils/audio';
import type { TranscriptChunk } from './utils/export';

type AppStatus = 'idle' | 'decoding' | 'loading_model' | 'processing' | 'done' | 'error';

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: 'idle',
  decoding: 'decoding audio',
  loading_model: 'loading model',
  processing: 'transcribing',
  done: 'done',
  error: 'error',
};

const STATUS_DOT: Record<AppStatus, string> = {
  idle: 'status-dot--idle',
  decoding: 'status-dot--loading',
  loading_model: 'status-dot--loading',
  processing: 'status-dot--processing',
  done: 'status-dot--done',
  error: 'status-dot--error',
};

export default function App() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [modelProgress, setModelProgress] = useState(0);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState(30); // seconds, default estimate

  const workerRef = useRef<Worker | null>(null);
  const modelReadyRef = useRef(false);

  // Initialise worker once
  useEffect(() => {
    const worker = new Worker(
      new URL('./worker/whisper.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as {
        type: string;
        progress?: number;
        data?: TranscriptChunk;
        chunks?: TranscriptChunk[];
        message?: string;
        duration?: number;
      };

      switch (msg.type) {
        case 'model_loading_progress':
          setModelProgress(Math.round(msg.progress ?? 0));
          break;
        case 'model_ready':
          modelReadyRef.current = true;
          setModelProgress(100);
          setStatus('idle');
          break;
        case 'audio_duration':
          setAudioDuration(msg.duration ?? 30);
          break;
        case 'transcription_progress':
          setTranscribeProgress(Math.round(msg.progress ?? 0));
          setStatus('processing');
          break;
        case 'chunk':
          if (msg.data) setChunks((prev) => [...prev, msg.data!]);
          break;
        case 'complete':
          setChunks(msg.chunks ?? []);
          setTranscribeProgress(100);
          setStatus('done');
          break;
        case 'error':
          setErrorMsg(msg.message ?? 'Unknown error');
          setStatus('error');
          break;
      }
    };

    workerRef.current = worker;

    // Pre-warm: start loading the model immediately on page load
    worker.postMessage({ type: 'load' });
    setStatus('loading_model');

    return () => worker.terminate();
  }, []);

  // Smooth simulated progress scaled by audio duration.
  // Longer files = slower ticks, shorter files = faster ticks.
  // Targets reaching ~90% right around when transcription finishes.
  // Whisper processes roughly 1x realtime on average hardware with WASM.
  useEffect(() => {
    if (status !== 'processing') return;

    // Tick interval scales with duration: ~200ms for 30s audio, ~700ms for 100s, etc.
    const tickMs = Math.max(150, Math.min(1000, audioDuration * 7));

    const interval = setInterval(() => {
      setTranscribeProgress((prev) => {
        if (prev >= 85) return prev;
        const remaining = 85 - prev;
        return prev + Math.max(1, Math.ceil(remaining * 0.025));
      });
    }, tickMs);

    return () => clearInterval(interval);
  }, [status, audioDuration]);

  const handleFile = useCallback(async (file: File) => {
    setCurrentFile(file);
    setChunks([]);
    setTranscribeProgress(0);
    setErrorMsg('');

    try {
      setStatus('decoding');
      const audioBuffer = await decodeAudioFile(file);

      // If model isn't ready yet, wait for loading_model state naturally
      if (!modelReadyRef.current) {
        setStatus('loading_model');
        // Poll until model is ready
        await new Promise<void>((resolve) => {
          const id = setInterval(() => {
            if (modelReadyRef.current) { clearInterval(id); resolve(); }
          }, 300);
        });
      }

      setStatus('processing');
      workerRef.current?.postMessage({ type: 'transcribe', audio: audioBuffer }, [audioBuffer.buffer]);
    } catch (err) {
      setErrorMsg(String(err));
      setStatus('error');
    }
  }, []);

  const isWorking = status === 'decoding' || status === 'loading_model' || status === 'processing';

  // Determine which step is currently active (1-indexed)
  const activeStep = (() => {
    if (status === 'done') return 4;
    if (status === 'processing') return chunks.length > 0 ? 3 : 2;
    if (status === 'decoding') return 2;
    if (status === 'loading_model' && currentFile) return 2;
    if (status === 'error') return 2;
    return 1; // idle or loading_model without file
  })();

  const cellClass = (step: number) => {
    if (step === activeStep) return 'cell cell--active';
    if (step < activeStep) return 'cell cell--done';
    return 'cell cell--inactive';
  };

  return (
    <div className="app-wrapper">
      <Diamonds />

      {/* ─── Hero ─── */}
      <header className="hero">
        <h1 className="hero__title">Audio Subtitles</h1>
        <p className="hero__subtitle">
          100% local · nothing uploaded · supports EN / HI / mixed
        </p>
      </header>

      <main className="cells">

        {/* ─── Cell 1: Upload ─── */}
        <section className={cellClass(1)} id="upload-section">
          <header className="cell__header">
            <span className="cell__label">Step 1</span>
            <h2 className="cell__title">Upload Audio</h2>
          </header>
          <FileUploader onFile={handleFile} disabled={isWorking} />
        </section>

        {/* ─── Cell 2: Processing ─── */}
        <section className={cellClass(2)} id="progress-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <header className="cell__header" style={{ marginBottom: 0 }}>
              <span className="cell__label" style={{ marginBottom: 0 }}>Step 2</span>
              <h2 className="cell__title" style={{ marginBottom: 0 }}>Processing</h2>
            </header>
            <span className="status-badge" id="status-badge">
              <span className={`status-dot ${STATUS_DOT[status]}`} />
              {STATUS_LABELS[status]}
            </span>
          </div>

          <div className="progress-section">
            <ProgressBar
              label="Model ready"
              progress={modelProgress}
              variant="purple"
            />
            <ProgressBar
              label="Transcription"
              progress={transcribeProgress}
              variant="blue"
            />
          </div>

          {status === 'error' && (
            <p style={{ marginTop: 14, color: '#f44', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
              ⚠ {errorMsg}
            </p>
          )}
        </section>

        {/* ─── Cell 3: Transcript ─── */}
        <section className={cellClass(3)} id="transcript-section">
          <header className="cell__header">
            <span className="cell__label">Step 3</span>
            <h2 className="cell__title">Transcript</h2>
          </header>
          <TranscriptDisplay chunks={chunks} />
        </section>

        {/* ─── Cell 4: Export ─── */}
        <section className={cellClass(4)} id="export-section">
          <header className="cell__header">
            <span className="cell__label">Step 4</span>
            <h2 className="cell__title">Export</h2>
          </header>
          <p style={{ marginBottom: 16, fontSize: '0.9rem', color: '#555' }}>
            Download your subtitles. SRT includes timestamps; TXT is plain text only.
          </p>
          <ExportControls
            chunks={chunks}
            baseFileName={currentFile?.name ?? 'subtitles'}
            disabled={isWorking}
          />
        </section>

      </main>
    </div>
  );
}
