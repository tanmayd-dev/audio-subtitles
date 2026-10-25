import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';
import './theme/crystalline.css';
import { Diamonds } from './components/Diamonds';
import { StudioHeader } from './components/layout/StudioHeader';
import { FileUploader } from './components/FileUploader';
import { ProgressBar } from './components/ProgressBar';
import { TranscriptDisplay } from './components/TranscriptDisplay';
import { ExportControls } from './components/ExportControls';
import { VideoPlayer } from './components/studio/VideoPlayer';
import { SubtitleEditor } from './components/studio/SubtitleEditor';
import { TeleprompterView } from './components/studio/TeleprompterView';
import { AudioVisualizer } from './components/studio/AudioVisualizer';
import { FFmpegBurnModal } from './components/export/FFmpegBurnModal';
import { decodeAudioFile } from './utils/audio';
import {
  chunksToCues,
  cuesToChunks,
  generateSRT,
  parseSRT,
  parseVTT,
  downloadFile,
} from './utils/subtitles';
import { ffmpegService } from './services/ffmpeg.service';
import { liveAudioService } from './services/liveAudio.service';
import type { TranscriptChunk } from './utils/export';
import type {
  AppMode,
  EngineStatus,
  SubtitleCue,
  FFmpegStage,
  FFmpegProgress,
  LiveStreamStats,
} from './types/studio';

const STATUS_LABELS: Record<EngineStatus, string> = {
  idle: 'idle',
  decoding: 'decoding audio',
  loading_model: 'loading model',
  processing: 'transcribing',
  done: 'done',
  error: 'error',
};

const STATUS_DOT: Record<EngineStatus, string> = {
  idle: 'status-dot--idle',
  decoding: 'status-dot--loading',
  loading_model: 'status-dot--loading',
  processing: 'status-dot--processing',
  done: 'status-dot--done',
  error: 'status-dot--error',
};

export default function App() {
  // Navigation mode
  const [mode, setMode] = useState<AppMode>('transcribe');

  // Core transcription state
  const [status, setStatus] = useState<EngineStatus>('loading_model');
  const [modelProgress, setModelProgress] = useState(0);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [isModelReady, setIsModelReady] = useState(false);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState(30);

  // Video & Editor state
  const [currentTime, setCurrentTime] = useState(0);
  const [isBurnModalOpen, setIsBurnModalOpen] = useState(false);
  const [ffmpegStage, setFfmpegStage] = useState<FFmpegStage>('idle');
  const [ffmpegProgress, setFfmpegProgress] = useState(0);
  const [ffmpegError, setFfmpegError] = useState('');

  // Live subtitling state
  const [liveStats, setLiveStats] = useState<LiveStreamStats>({
    isActive: false,
    rmsLevel: 0,
    source: 'idle',
  });
  const [copiedLive, setCopiedLive] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const modelReadyRef = useRef(false);

  // Sync chunks and cues bidirectionally
  const updateCues = useCallback((newCues: SubtitleCue[]) => {
    setCues(newCues);
    setChunks(cuesToChunks(newCues));
  }, []);

  // Initialize Whisper Web Worker
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
          setModelProgress((prev) => Math.max(prev, Math.round(msg.progress ?? 0)));
          break;
        case 'model_ready':
          modelReadyRef.current = true;
          setIsModelReady(true);
          setModelProgress(100);
          setStatus('idle');
          break;
        case 'audio_duration':
          setAudioDuration(msg.duration ?? 30);
          break;
        case 'transcription_progress':
          setTranscribeProgress((prev) => Math.max(prev, Math.round(msg.progress ?? 0)));
          setStatus('processing');
          break;
        case 'chunk':
          if (msg.data) {
            setChunks((prev) => {
              const updated = [...prev, msg.data!];
              setCues(chunksToCues(updated));
              return updated;
            });
          }
          break;
        case 'complete': {
          const finalChunks = msg.chunks ?? [];
          setChunks(finalChunks);
          setCues(chunksToCues(finalChunks));
          setTranscribeProgress(100);
          setStatus('done');
          break;
        }
        case 'error':
          setErrorMsg(msg.message ?? 'Unknown error');
          setStatus('error');
          break;
      }
    };

    workerRef.current = worker;

    // Pre-warm model on mount
    worker.postMessage({ type: 'load' });

    return () => {
      worker.terminate();
      liveAudioService.stop();
    };
  }, []);

  // Smooth progression during ONNX session compilation (after download reaches 80%)
  useEffect(() => {
    if (status !== 'loading_model') return;

    const interval = setInterval(() => {
      setModelProgress((prev) => {
        if (prev < 80 || prev >= 95) return prev;
        return prev + 1;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [status]);

  // Smooth progress ticker
  useEffect(() => {
    if (status !== 'processing') return;
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

  // Handle media file upload
  const handleFile = useCallback(async (file: File) => {
    setCurrentFile(file);
    setChunks([]);
    setCues([]);
    setTranscribeProgress(0);
    setErrorMsg('');

    try {
      setStatus('decoding');
      let audioBuffer: Float32Array;

      try {
        audioBuffer = await decodeAudioFile(file);
      } catch {
        // Fallback to in-browser FFmpeg audio extraction if native Web Audio decode fails
        setFfmpegStage('extracting');
        audioBuffer = await ffmpegService.extractAudio(file);
        setFfmpegStage('idle');
      }

      if (!modelReadyRef.current) {
        setStatus('loading_model');
        await new Promise<void>((resolve) => {
          const id = setInterval(() => {
            if (modelReadyRef.current) {
              clearInterval(id);
              resolve();
            }
          }, 300);
        });
      }

      setStatus('processing');
      workerRef.current?.postMessage({ type: 'transcribe', audio: audioBuffer }, [
        audioBuffer.buffer,
      ]);
    } catch (err) {
      setErrorMsg(String(err));
      setStatus('error');
    }
  }, []);

  // Handle direct subtitle file import (.srt / .vtt)
  const handleSubtitleImport = useCallback(async (file: File) => {
    const text = await file.text();
    let importedCues: SubtitleCue[] = [];
    if (file.name.endsWith('.vtt')) {
      importedCues = parseVTT(text);
    } else {
      importedCues = parseSRT(text);
    }
    if (importedCues.length > 0) {
      setCues(importedCues);
      setChunks(cuesToChunks(importedCues));
      setStatus('done');
    }
  }, []);

  // Live recording handlers
  const handleStartLive = useCallback(async (source: 'mic' | 'tab') => {
    try {
      setErrorMsg('');
      await liveAudioService.start(
        source,
        (pcm16k) => {
          if (modelReadyRef.current && workerRef.current) {
            workerRef.current.postMessage(
              { type: 'transcribe', audio: pcm16k, isLive: true },
              [pcm16k.buffer]
            );
          }
        },
        (stats) => setLiveStats(stats)
      );
    } catch (err) {
      setErrorMsg(`Failed to start ${source} recording: ${String(err)}`);
    }
  }, []);

  const handleStopLive = useCallback(() => {
    liveAudioService.stop();
    setLiveStats({ isActive: false, rmsLevel: 0, source: 'idle' });
  }, []);

  const handleCopyLive = useCallback(() => {
    const text = cues.map((c) => c.text.trim()).join(' ');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLive(true);
      setTimeout(() => setCopiedLive(false), 2000);
    });
  }, [cues]);

  // In-Browser FFmpeg operations
  const handleSoftMux = useCallback(async () => {
    if (!currentFile || cues.length === 0) return;
    try {
      setFfmpegStage('muxing');
      setFfmpegProgress(15);
      const srt = generateSRT(cues);
      const result = await ffmpegService.softMuxSubtitles(currentFile, srt, (p: FFmpegProgress) => {
        setFfmpegStage(p.stage);
        setFfmpegProgress(p.progress);
      });
      const url = URL.createObjectURL(result.blob);
      downloadFile(url, result.filename);
      setFfmpegStage('done');
      setFfmpegProgress(100);
    } catch (err) {
      setFfmpegStage('error');
      setFfmpegError(String(err));
    }
  }, [currentFile, cues]);

  const handleHardBurn = useCallback(async () => {
    if (!currentFile || cues.length === 0) return;
    try {
      setFfmpegStage('burning');
      setFfmpegProgress(5);
      const srt = generateSRT(cues);
      const result = await ffmpegService.hardBurnSubtitles(currentFile, srt, (p: FFmpegProgress) => {
        setFfmpegStage(p.stage);
        setFfmpegProgress(p.progress);
      });
      const url = URL.createObjectURL(result.blob);
      downloadFile(url, result.filename);
      setFfmpegStage('done');
      setFfmpegProgress(100);
    } catch (err) {
      setFfmpegStage('error');
      setFfmpegError(String(err));
    }
  }, [currentFile, cues]);

  const isWorking = status === 'decoding' || status === 'loading_model' || status === 'processing';
  const isVideo = currentFile?.type?.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(currentFile?.name ?? '');

  // Step active class logic
  const activeStep = (() => {
    if (status === 'done') return 4;
    if (status === 'processing') return chunks.length > 0 ? 3 : 2;
    if (status === 'decoding') return 2;
    if (status === 'loading_model' && currentFile) return 2;
    if (status === 'error') return 2;
    return 1;
  })();

  const cellClass = (step: number) => {
    if (step === activeStep) return 'cell cell--active';
    if (step < activeStep) return 'cell cell--done';
    return 'cell cell--inactive';
  };

  return (
    <div className="app-wrapper">
      <Diamonds />

      {/* ─── Studio Header & Navigation ─── */}
      <StudioHeader
        activeMode={mode}
        onSelectMode={setMode}
        engineStatus={status}
        isModelReady={isModelReady}
      />

      {/* ─── MODE: Live Captions ─── */}
      {mode === 'live' && (
        <section className="studio-mode-pane" aria-label="Live Captions Mode">
          <div className="glass-card" style={{ marginBottom: 20 }}>
            <div className="live-controls-row">
              <div className="live-buttons-group">
                {!liveStats.isActive ? (
                  <>
                    <button
                      type="button"
                      className="btn-crystalline btn-crystalline--primary"
                      onClick={() => handleStartLive('mic')}
                    >
                      🎙️ Start Microphone
                    </button>
                    <button
                      type="button"
                      className="btn-crystalline btn-crystalline--azure"
                      onClick={() => handleStartLive('tab')}
                    >
                      🖥️ Capture Tab / Meeting Audio
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-crystalline btn-crystalline--ghost"
                    onClick={handleStopLive}
                  >
                    ⏹ Stop Live Capture ({liveStats.source})
                  </button>
                )}
              </div>
              <AudioVisualizer
                isActive={liveStats.isActive}
                rmsLevel={liveStats.rmsLevel}
                source={liveStats.source}
              />
            </div>
          </div>

          <TeleprompterView
            cues={cues}
            isRecording={liveStats.isActive}
            onClear={() => {
              setCues([]);
              setChunks([]);
            }}
            onCopy={handleCopyLive}
            copied={copiedLive}
          />

          {cues.length > 0 && (
            <div className="glass-card" style={{ marginTop: 20 }}>
              <ExportControls
                cues={cues}
                chunks={chunks}
                baseFileName="live-subtitles"
                disabled={isWorking}
              />
            </div>
          )}
        </section>
      )}

      {/* ─── MODE: Video Studio ─── */}
      {mode === 'video' && (
        <section className="studio-mode-pane" aria-label="Video Studio Mode">
          <div className="studio-split-grid">
            <div className="studio-split-left">
              <div className="glass-card">
                <VideoPlayer
                  videoFile={isVideo ? currentFile : null}
                  cues={cues}
                  currentTime={currentTime}
                  onTimeUpdate={setCurrentTime}
                />
                {!currentFile && (
                  <div style={{ marginTop: 16 }}>
                    <FileUploader onFile={handleFile} disabled={isWorking} />
                  </div>
                )}
                {isVideo && (
                  <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                    <button
                      type="button"
                      className="btn-crystalline btn-crystalline--primary"
                      onClick={() => setIsBurnModalOpen(true)}
                      disabled={cues.length === 0}
                    >
                      🎬 Mux / Burn Subtitles with FFmpeg
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="studio-split-right">
              <div className="glass-card">
                <SubtitleEditor
                  cues={cues}
                  currentTime={currentTime}
                  onCueChange={updateCues}
                  onSeek={setCurrentTime}
                  disabled={isWorking}
                />
                <div style={{ marginTop: 16, borderTop: '1px solid rgba(109, 68, 202, 0.12)', paddingTop: 16 }}>
                  <ExportControls
                    cues={cues}
                    chunks={chunks}
                    baseFileName={currentFile?.name ?? 'video-subtitles'}
                    disabled={isWorking}
                    isVideoLoaded={isVideo}
                    onOpenVideoBurn={() => setIsBurnModalOpen(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── MODE: Subtitle Editor ─── */}
      {mode === 'editor' && (
        <section className="studio-mode-pane" aria-label="Subtitle Editor Mode">
          <div className="glass-card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1528' }}>Import Subtitle File</h3>
                <p style={{ fontSize: '0.85rem', color: '#666', marginTop: 4 }}>
                  Drop an existing .srt or .vtt file to edit timecodes, refine translations, or export into other formats.
                </p>
              </div>
              <label className="btn-crystalline btn-crystalline--azure" style={{ cursor: 'pointer' }}>
                📂 Browse SRT / VTT
                <input
                  type="file"
                  accept=".srt,.vtt"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSubtitleImport(f);
                  }}
                />
              </label>
            </div>
          </div>

          <div className="glass-card">
            <SubtitleEditor
              cues={cues}
              currentTime={currentTime}
              onCueChange={updateCues}
              onSeek={setCurrentTime}
              disabled={isWorking}
            />
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(109, 68, 202, 0.12)', paddingTop: 16 }}>
              <ExportControls
                cues={cues}
                chunks={chunks}
                baseFileName={currentFile?.name ?? 'subtitles'}
                disabled={isWorking}
              />
            </div>
          </div>
        </section>
      )}

      {/* ─── MODE: Transcribe (Default 4-Step Flow) ─── */}
      {mode === 'transcribe' && (
        <main className="cells">
          {/* Step 1: Upload */}
          <section className={cellClass(1)} id="upload-section">
            <header className="cell__header">
              <span className="cell__label">Step 1</span>
              <h2 className="cell__title">Upload Audio</h2>
            </header>
            <FileUploader onFile={handleFile} disabled={isWorking} />
          </section>

          {/* Step 2: Processing */}
          <section className={cellClass(2)} id="progress-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <header className="cell__header" style={{ marginBottom: 0 }}>
                <span className="cell__label" style={{ marginBottom: 0 }}>Step 2</span>
                <h2 className="cell__title" style={{ marginBottom: 0 }}>Processing</h2>
              </header>
              <span className="status-badge" id="status-badge">
                <span className={`status-dot ${STATUS_DOT[status]}`} />
                {status === 'loading_model' && modelProgress >= 80
                  ? 'initializing engine'
                  : STATUS_LABELS[status]}
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

          {/* Step 3: Transcript */}
          <section className={cellClass(3)} id="transcript-section">
            <header className="cell__header">
              <span className="cell__label">Step 3</span>
              <h2 className="cell__title">Transcript</h2>
            </header>
            <TranscriptDisplay chunks={chunks} />
          </section>

          {/* Step 4: Export */}
          <section className={cellClass(4)} id="export-section">
            <header className="cell__header">
              <span className="cell__label">Step 4</span>
              <h2 className="cell__title">Export</h2>
            </header>
            <p style={{ marginBottom: 16, fontSize: '0.9rem', color: '#555' }}>
              Download your subtitles in SRT, WebVTT, ASS, TXT, or JSON.
            </p>
            <ExportControls
              chunks={chunks}
              cues={cues}
              baseFileName={currentFile?.name ?? 'subtitles'}
              disabled={isWorking}
              isVideoLoaded={isVideo}
              onOpenVideoBurn={() => setIsBurnModalOpen(true)}
            />
          </section>
        </main>
      )}

      {/* ─── FFmpeg In-Browser Subtitling Modal ─── */}
      <FFmpegBurnModal
        isOpen={isBurnModalOpen}
        onClose={() => {
          setIsBurnModalOpen(false);
          setFfmpegStage('idle');
          setFfmpegError('');
        }}
        videoFile={currentFile}
        hasCues={cues.length > 0}
        stage={ffmpegStage}
        progress={ffmpegProgress}
        errorMessage={ffmpegError}
        onSoftMux={handleSoftMux}
        onHardBurn={handleHardBurn}
      />
    </div>
  );
}
