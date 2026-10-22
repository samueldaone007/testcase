/**
 * Server-side proxy for Pencil's optional model backend.
 *
 * The browser never holds an API key. It calls Tickmark's own /api/assistant
 * endpoint; this module adds the key from the server environment and forwards
 * the request to an OpenAI-compatible provider. If no key is configured the
 * endpoint reports itself unavailable and the client quietly uses the offline
 * suggestion engine instead.
 *
 * This file is deliberately dependency-free and is shared by the dev server
 * (wired in through vite.config.ts) and the production server (server/index.mjs).
 */

// Load a .env file when the runtime supports it (Node 20.12+). Real environment
// variables always win. Must run before any config is read.
try {
  process.loadEnvFile?.()
} catch {
  /* no .env file — nothing to load */
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TEMPERATURE = 0.4

const MAX_BODY_BYTES = 256 * 1024
const MAX_MESSAGES = 60
const MAX_CONTENT_CHARS = 20000

/** Read the provider settings from the environment, with sane defaults. */
export function assistantConfig(env = process.env) {
  const apiKey = String(env.TICKMARK_LLM_API_KEY ?? '').trim()
  const baseUrl = String(env.TICKMARK_LLM_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  const model = String(env.TICKMARK_LLM_MODEL ?? DEFAULT_MODEL).trim()
  const parsed = Number(env.TICKMARK_LLM_TEMPERATURE)
  const temperature = Number.isFinite(parsed) ? parsed : DEFAULT_TEMPERATURE
  return {
    apiKey,
    baseUrl,
    model,
    temperature,
    configured: Boolean(apiKey && baseUrl && model),
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let settled = false
    const chunks = []
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        settled = true
        reject(httpError(413, 'That request is too large.'))
        // Drain and discard whatever else arrives so the 413 can be written
        // cleanly instead of resetting the socket.
        req.resume()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(httpError(400, 'The request body was not valid JSON.'))
      }
    })
    req.on('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

/** Keep only well-formed chat messages; the client is untrusted. */
function cleanMessages(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw httpError(400, 'No messages were provided.')
  }
  if (input.length > MAX_MESSAGES) {
    throw httpError(400, 'That is too many messages.')
  }
  const out = []
  for (const item of input) {
    if (!item || typeof item !== 'object') {
      throw httpError(400, 'A message was malformed.')
    }
    const { role, content } = item
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      throw httpError(400, `Unknown message role: ${String(role)}`)
    }
    if (typeof content !== 'string' || content.trim() === '') {
      throw httpError(400, 'A message had no content.')
    }
    out.push({ role, content: content.slice(0, MAX_CONTENT_CHARS) })
  }
  return out
}

/** A light guard so the endpoint cannot be used as an open relay. */
function sameOrigin(req) {
  const origin = req.headers.origin
  const host = req.headers.host
  if (!origin || !host) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function describeProviderError(status, detail) {
  const suffix = detail ? ` — ${detail}` : ''
  if (status === 401 || status === 403) return `The provider rejected the server API key.${suffix}`
  if (status === 404) return `The model endpoint was not found. Check TICKMARK_LLM_BASE_URL and TICKMARK_LLM_MODEL.${suffix}`
  if (status === 429) return `The provider is rate-limiting right now.${suffix}`
  return `The provider replied ${status}${suffix}`
}

/**
 * Handle GET (status) and POST (a chat turn) for /api/assistant.
 * Uses the Web fetch available in Node 18+, or an injected one for tests.
 */
export async function handleAssistant(req, res, env = process.env, fetchImpl = fetch) {
  if (req.method === 'GET') {
    const { configured, model } = assistantConfig(env)
    sendJson(res, 200, configured ? { available: true, model } : { available: false })
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Only GET and POST are supported.' })
    return
  }

  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' })
    return
  }

  const config = assistantConfig(env)
  if (!config.configured) {
    sendJson(res, 503, { error: 'No assistant model is configured on the server yet.' })
    return
  }

  let body
  try {
    body = await readJson(req)
  } catch (err) {
    sendJson(res, err.status ?? 400, { error: err.message })
    return
  }

  let messages
  try {
    messages = cleanMessages(body.messages)
  } catch (err) {
    sendJson(res, err.status ?? 400, { error: err.message })
    return
  }

  try {
    const upstream = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        messages,
      }),
    })

    if (!upstream.ok) {
      let detail = ''
      try {
        detail = (await upstream.text()).slice(0, 300)
      } catch {
        /* ignore */
      }
      sendJson(res, upstream.status === 429 ? 429 : 502, {
        error: describeProviderError(upstream.status, detail),
      })
      return
    }

    const data = await upstream.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      sendJson(res, 502, { error: 'The model returned an empty answer.' })
      return
    }

    sendJson(res, 200, { content })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error'
    sendJson(res, 502, { error: `Could not reach the model: ${detail}` })
  }
}
