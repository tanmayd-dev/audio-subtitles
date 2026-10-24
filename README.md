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

### First-run model download

When you open the app, it immediately starts preparing the ASR model so you don't
wait when you actually drop a file in.

- **What downloads:** the [`Xenova/whisper-base`](https://huggingface.co/Xenova/whisper-base)
  multilingual Whisper base model (~74M params) served as quantized ONNX weights
  plus the WASM backend, ~200–300 MB total from the HuggingFace CDN
  (`huggingface.co` / `cdn-lfs.huggingface.co`).
- **When:** automatically, on page load (before any file is dropped). During the
  download the status pill shows **"loading model"** with a progress bar that
  tracks the download from 0–100%. Nothing is sent from your machine — it is a
  plain CDN fetch, and no API key is needed.
- **Where it's cached:** Transformers.js stores the weights in the browser's
  [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) partitioned
  for this origin (visible in DevTools → Application → Cache Storage). The next
  visit loads from cache — no re-download, near-instant model warmup.
- **How to clear it:** delete the cache entries in DevTools (Application →
  Cache Storage) or clear site data to reclaim the disk space and go back to a
  fresh first-run download.

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

**CI:** GitHub Actions (`.github/workflows/ci.yml`) runs `npm test` (33 tests) and
`npm run build` on every push and pull request.

```bash
npm run build     # -> dist/
npm run preview   # serves dist/ *with* the required headers
```

**The host must send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`**, otherwise the browser withholds
`SharedArrayBuffer` and the WASM worker cannot run with threads. Those headers
are committed in [`public/_headers`](public/_headers) (Vite copies it to the root
of `dist/`), which **Netlify** and **Cloudflare Pages** read automatically.

### Deploying to Netlify

1. Push this repo to GitHub (already hosted at `tanmayd-dev/audio-subtitles`).
2. In the Netlify dashboard: **Add new site → Import an existing project →
   GitHub → audio-subtitles**, authorize the Netlify GitHub app if asked.
3. Netlify auto-detects `netlify.toml`: build command `npm run build`, publish
   directory `dist`. No extra environment variables are needed. Click
   **Deploy site**.
4. Every subsequent push to any branch deploys (production deploys from the
   default branch; Netlify also builds the CI status on each PR).
5. Once deployed, verify the headers:

   ```bash
   curl -I https://<your-site>.netlify.app/ | grep -i cross-origin
   # expect: Cross-Origin-Opener-Policy: same-origin
   #         Cross-Origin-Embedder-Policy: require-corp
   ```

### Cloudflare Pages (alternative)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
   → pick `audio-subtitles`.
2. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. Headers: Cloudflare Pages also honours `public/_headers` shipped in `dist/`,
   so the COOP/COEP headers apply with no extra configuration.

> ⚠️ **Not GitHub Pages.** Pages cannot set custom response headers, so this app
> cannot be hosted there. (It will appear to load but transcription will fall
> back to single-threaded WASM, which is far too slow for practical use.)

## License

[MIT](LICENSE)
