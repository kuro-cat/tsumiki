import { readFileSync } from 'node:fs'
import { defineConfig, type Connect, type Plugin } from 'vite'
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

/** Forwards /ai-proxy/<url> from the local dev and preview servers, for AI endpoints that don't allow browser calls (OpenCode). */
const proxyTarget = (path: string) => {
  try {
    const url = new URL(path.slice(1))
    return url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname) ? url : null
  } catch { return null }
}
const forward: Connect.NextHandleFunction = async (req, res) => {
  const target = proxyTarget(req.url ?? '')
  if (!target) { res.statusCode = 400; return res.end('Not a proxied URL') }
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers: Record<string, string> = {}
  for (const h of ['authorization', 'content-type', 'accept']) { const v = req.headers[h]; if (typeof v === 'string') headers[h] = v }
  try {
    const upstream = await fetch(target, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined })
    res.statusCode = upstream.status
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    res.end(Buffer.from(await upstream.arrayBuffer()))
  } catch (err) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: { message: `Proxy could not reach ${target.host}: ${(err as Error).message}` } }))
  }
}
const aiProxy = (): Plugin => ({
  name: 'ai-proxy',
  configureServer: (server) => { server.middlewares.use('/ai-proxy', forward) },
  configurePreviewServer: (server) => { server.middlewares.use('/ai-proxy', forward) },
})

export default defineConfig({ plugins: [react(), serviceWorker(), aiProxy()] })
