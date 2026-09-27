import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Emits sw.js with every built file and public asset listed for precaching. */
const serviceWorker = (): Plugin => ({
  name: 'service-worker',
  apply: 'build',
  generateBundle(_, bundle) {
    const files = ['/', '/fonts/archivo.woff2', '/icon.svg', '/manifest.webmanifest', ...Object.keys(bundle).filter((f) => f !== 'index.html').map((f) => `/${f}`)]
    const source = readFileSync('src/sw.js', 'utf8').replace('__VERSION__', Date.now().toString(36)).replace('__FILES__', JSON.stringify(files))
    this.emitFile({ type: 'asset', fileName: 'sw.js', source })
  },
})

export default defineConfig({ plugins: [react(), serviceWorker()] })
