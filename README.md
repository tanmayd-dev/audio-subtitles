# audio-subtitles

Private, in-browser audio transcription — drop in an audio file and get timestamped subtitles without anything ever leaving your machine. Whisper runs **fully client-side** via Transformers.js in a Web Worker.

## Features

- **100% local** — `Xenova/whisper-base` (~74M params) runs on-device with weights cached in the browser; no uploads, no server, no API key
- **Multilingual** — auto-detects language; handles English, Hindi, and mixed code-switching
- **Live streaming transcript** — segments appear as they're transcribed, with auto-scroll and copy-to-clipboard
- **Subtitle export** — one-click **SRT** (timestamped) and **TXT** (plain text), filenames derived from the upload
- **Long-audio support** — files over ~35s are processed in 30s sliding windows (2s overlap) with timestamp-offset correction and cross-chunk deduplication
- **Resilient UX** — 4-step guided UI (upload → process → review → export) with dual model/transcription progress bars and clear status states
- **Wide format support** — mp3, mp4, ogg, wav, webm, m4a, aac, flac, opus (decoded + resampled to 16kHz mono in-browser)
- **Tested** — 33 Vitest tests covering transcription flow, audio utils, and export formats

## Tech Stack

- **Core:** React 19, TypeScript, Vite
- **AI:** HuggingFace Transformers.js v3, Whisper-base (ONNX), Web Worker + WASM (COOP/COEP isolated)
- **Audio:** Web Audio API (`decodeAudioData`), custom linear resampler
- **Testing:** Vitest + Testing Library + jsdom

## Getting Started

### Prerequisites

- Node.js 18+
- A modern browser (Web Workers + WebAssembly required)

### Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build
npm run preview  # preview production build
npm test         # run the test suite
```

On first run the app downloads the Whisper model (~200–300MB) from the HuggingFace CDN; subsequent loads use the cached copy.

### Use

1. Drop an audio file onto the upload zone (Step 1).
2. Wait while the model loads and transcription streams in (Steps 2–3).
3. Copy the transcript or export **SRT** / **TXT** (Step 4).

## Project Structure

```
src/
├── App.tsx                 # Orchestrator: worker lifecycle, progress, state machine
├── worker/whisper.worker.ts# Model loading, chunked transcription, dedup
├── utils/audio.ts          # Decode + resample to 16kHz mono
├── utils/export.ts         # SRT/TXT generation + file download
├── components/             # Uploader, progress bar, transcript, export controls
└── test/                   # Vitest suite (33 tests)
```

## Deploy

```bash
npm run build     # -> dist/
npm run preview   # serves dist/ *with* the required headers
```

**The host must send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`**, otherwise the browser withholds
`SharedArrayBuffer` and the WASM worker cannot run with threads. Those headers
are committed in [`public/_headers`](public/_headers), which **Netlify** and
**Cloudflare Pages** read automatically — connect the repo and they just work.

> ⚠️ **Not GitHub Pages.** Pages cannot set custom response headers, so this app
> cannot be hosted there. (It will appear to load but transcription will fall
> back to single-threaded WASM, which is far too slow for practical use.)
