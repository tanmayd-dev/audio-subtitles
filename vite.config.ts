import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Whisper runs in a WASM Web Worker and needs SharedArrayBuffer, which browsers
// only expose under "cross-origin isolation" (COOP + COEP). Those headers must
// be served in production as well -- see public/_headers, which the build ships
// into dist/ for Cloudflare Workers/Pages to read. Note: GitHub Pages cannot set
// custom headers, so this app cannot be hosted there.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// Project-page hosts (e.g. /audio-subtitles/) can set VITE_BASE_PATH at build.
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  worker: {
    format: 'es',
  },
})
