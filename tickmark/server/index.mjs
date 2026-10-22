/**
 * Tickmark's production server.
 *
 * Serves the built client from ./dist and exposes POST/GET /api/assistant,
 * which proxies to the model provider using a server-side key. Run it with:
 *
 *   npm run build && npm run serve
 *
 * Configure the model with environment variables (or a .env file):
 *   TICKMARK_LLM_API_KEY, TICKMARK_LLM_BASE_URL, TICKMARK_LLM_MODEL,
 *   TICKMARK_LLM_TEMPERATURE
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assistantConfig, handleAssistant } from './assistant.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')

const port = Number(process.env.PORT ?? 4173)
const host = process.env.HOST ?? '127.0.0.1'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'

  const resolved = path.resolve(distDir, '.' + pathname)
  if (resolved !== distDir && !resolved.startsWith(distDir + path.sep)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  let filePath = resolved
  let info
  try {
    info = await stat(filePath)
    if (info.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
      info = await stat(filePath)
    }
  } catch {
    // unknown path: hand the single-page app its index and let it route
    filePath = path.join(distDir, 'index.html')
    try {
      info = await stat(filePath)
    } catch {
      res.statusCode = 404
      res.end('Not found — run "npm run build" first.')
      return
    }
  }

  res.statusCode = 200
  res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Content-Length', info.size)
  if (path.basename(filePath) === 'index.html') res.setHeader('Cache-Control', 'no-cache')
  createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  if ((req.url ?? '').startsWith('/api/assistant')) {
    handleAssistant(req, res).catch((err) => {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error.' }))
    })
    return
  }

  serveStatic(req, res).catch(() => {
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Server error')
    }
  })
})

server.listen(port, host, () => {
  const { configured, model } = assistantConfig()
  console.log(`Tickmark is running at http://${host}:${port}`)
  console.log(
    configured
      ? `Assistant model ready: ${model}`
      : 'Assistant model not configured — Pencil will use offline notes.',
  )
})
