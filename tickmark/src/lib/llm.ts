/**
 * The optional model backend, from the browser's point of view.
 *
 * Tickmark works fully offline with the deterministic engine in `assistant.ts`.
 * If the server has a model configured, the client can send the same turn to
 * Tickmark's own /api/assistant endpoint, which adds the API key server-side and
 * returns the model's JSON. The browser never sees a key.
 *
 * If the endpoint is missing, unconfigured or fails, `respondSmart` quietly
 * falls back to the local engine so the assistant never goes dark.
 */

import {
  respond,
  normalise,
  type AssistantReply,
  type AssistantRequest,
  type Suggestion,
} from './assistant'

export interface LlmSettings {
  /** the tester's own switch to stay fully offline even when a model exists */
  enabled: boolean
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = { enabled: true }

const SETTINGS_KEY = 'tickmark.llm.v2'
const ENDPOINT = '/api/assistant'

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LlmSettings>
      return { enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_LLM_SETTINGS.enabled }
    }
  } catch (err) {
    console.warn('Tickmark could not read assistant settings', err)
  }
  return { ...DEFAULT_LLM_SETTINGS }
}

export function saveLlmSettings(settings: LlmSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('Tickmark could not save assistant settings', err)
  }
}

/* ---------- is the server offering a model? ---------- */

export interface AssistantStatus {
  available: boolean
  /** the model the server is configured to use, for display only */
  model?: string
}

export const OFFLINE_STATUS: AssistantStatus = { available: false }

/** Ask the server whether it has a model. Never throws — offline on any trouble. */
export async function fetchAssistantStatus(signal?: AbortSignal): Promise<AssistantStatus> {
  try {
    const response = await fetch(ENDPOINT, { signal, headers: { Accept: 'application/json' } })
    if (!response.ok) return OFFLINE_STATUS
    const data = (await response.json()) as { available?: unknown; model?: unknown }
    if (data?.available !== true) return OFFLINE_STATUS
    return { available: true, model: typeof data.model === 'string' ? data.model : undefined }
  } catch {
    return OFFLINE_STATUS
  }
}

/** The model is used only when the tester allows it and the server offers one. */
export function isLlmConfigured(settings: LlmSettings, status: AssistantStatus): boolean {
  return settings.enabled && status.available
}

/* ---------- request building ---------- */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = [
  'You are "Pencil", the margin-notes assistant inside Tickmark, a manual-testing checklist app for QA testers.',
  '',
  'Your job is to suggest concrete test steps the tester can run by hand. You NEVER add anything to a checklist yourself — the tester accepts each suggestion one at a time.',
  '',
  'Voice: brief, warm and practical, like a seasoned QA lead scribbling in a notebook margin. No emoji, no exclamation marks, no marketing words, no sparkles. Keep the reply to one or two short sentences.',
  '',
  'Reply with STRICT JSON and nothing else — no markdown fences, no commentary:',
  '{',
  '  "reply": "one or two short sentences in your voice",',
  '  "followUp": "one short question you are still chewing on (optional)",',
  '  "quickReplies": ["up to 3 very short chips the tester might tap"],',
  '  "suggestions": [',
  '    {',
  '      "title": "an imperative, repeatable test step",',
  '      "details": "how to do it (optional)",',
  '      "expected": "what should happen (optional)",',
  '      "section": "a short grouping heading"',
  '    }',
  '  ]',
  '}',
  '',
  'Rules:',
  '- Offer 3 to 8 suggestions.',
  '- Every title is a specific, repeatable step, not a vague area.',
  '- NEVER repeat or paraphrase a step that is already on the checklist (see CONTEXT).',
  '- Group related steps under a short section name such as "Edge cases" or "Payments".',
  '- Follow what the tester asked for. If they ask what is missing, lean on gaps, edge cases and things that bite late in a release.',
  '- Never claim you added anything. You only ever suggest.',
].join('\n')

function contextBlock(request: AssistantRequest): string {
  const titles = request.existingTitles.map((t) => `- ${t}`).join('\n')
  return [
    'CONTEXT',
    `Project: ${request.projectName}`,
    `Checklist: ${request.checklistName}`,
    `Brief: ${request.brief?.trim() || '(none given)'}`,
    'Steps already on the checklist:',
    titles || '(the checklist is empty)',
  ].join('\n')
}

export function buildMessages(request: AssistantRequest): ChatMessage[] {
  const history: ChatMessage[] = (request.history ?? []).slice(-8).map((turn) => ({
    role: turn.who === 'tester' ? 'user' : 'assistant',
    content: turn.text,
  }))
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: contextBlock(request) },
    ...history,
    { role: 'user', content: request.input },
  ]
}

/* ---------- response parsing ---------- */

export interface LlmResult {
  reply: string
  suggestions: Array<{
    title: string
    details?: string
    expected?: string
    section?: string
  }>
  followUp?: string
  quickReplies?: string[]
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : text).trim()
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** Tolerant JSON reader: models love to wrap their answer in prose or fences. */
export function parseLlmContent(content: string): LlmResult {
  const text = stripFences(content)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('The model did not return JSON.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error('The model returned JSON that would not parse.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('The model returned an unexpected shape.')
  }
  const record = parsed as Record<string, unknown>

  const rawSuggestions = Array.isArray(record.suggestions) ? record.suggestions : []
  const suggestions: LlmResult['suggestions'] = []
  for (const item of rawSuggestions) {
    if (typeof item !== 'object' || item === null) continue
    const s = item as Record<string, unknown>
    const title = str(s.title)
    if (!title) continue
    suggestions.push({
      title,
      details: str(s.details),
      expected: str(s.expected),
      section: str(s.section),
    })
  }

  const quickReplies = Array.isArray(record.quickReplies)
    ? record.quickReplies.map(str).filter((v): v is string => Boolean(v)).slice(0, 3)
    : undefined

  return {
    reply: str(record.reply) ?? 'Here are a few steps worth trying.',
    suggestions,
    followUp: str(record.followUp),
    quickReplies: quickReplies && quickReplies.length > 0 ? quickReplies : undefined,
  }
}

/* ---------- talking to the server ---------- */

/** One request to Tickmark's own endpoint; returns the model's raw text. */
async function postAssistant(payload: unknown, signal?: AbortSignal): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  let data: { content?: unknown; error?: unknown } | null = null
  try {
    data = (await response.json()) as { content?: unknown; error?: unknown }
  } catch {
    data = null
  }

  if (!response.ok) {
    const message =
      data && typeof data.error === 'string'
        ? data.error
        : `The assistant server replied ${response.status}.`
    throw new Error(message)
  }

  const content = data?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('The assistant server returned an empty answer.')
  }
  return content
}

/** A real turn. Throws on any failure. */
export async function askLlm(request: AssistantRequest, signal?: AbortSignal): Promise<LlmResult> {
  const content = await postAssistant({ messages: buildMessages(request) }, signal)
  return parseLlmContent(content)
}

/** A cheap round-trip used by the "Test connection" button. */
export async function pingLlm(signal?: AbortSignal): Promise<void> {
  await postAssistant(
    {
      messages: [
        { role: 'system', content: 'You are a connectivity check. Reply with the single word: ready.' },
        { role: 'user', content: 'ready?' },
      ],
    },
    signal,
  )
}

/* ---------- the smart entry point ---------- */

function toSuggestion(step: LlmResult['suggestions'][number]): Suggestion {
  return {
    key: normalise(step.title),
    title: step.title,
    details: step.details,
    expected: step.expected,
    section: step.section ?? 'Suggested',
  }
}

function localReply(request: AssistantRequest, error?: string): AssistantReply {
  const reply = respond(request)
  return error ? { ...reply, error } : reply
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Prefer the server's model; otherwise (or on any failure) use the local
 * engine. This never rejects, so the panel can always render a reply.
 */
export async function respondSmart(
  request: AssistantRequest,
  settings: LlmSettings,
  status: AssistantStatus,
  signal?: AbortSignal,
): Promise<AssistantReply> {
  if (!isLlmConfigured(settings, status)) {
    // keep the "pencil is writing" beat for the local engine, which is instant
    await delay(520)
    return localReply(request)
  }

  try {
    const result = await askLlm(request, signal)
    return {
      reply: result.reply,
      suggestions: result.suggestions.map(toSuggestion),
      followUp: result.followUp,
      quickReplies: result.quickReplies,
      // the model path keeps its own history; carry topic memory across a
      // clean hand-over if the tester later switches the model off
      memory: request.memory,
      duplicatesSkipped: 0,
      source: 'model',
    }
  } catch (err) {
    if (signal?.aborted) throw err
    const reason = err instanceof Error ? err.message : 'The model could not be reached.'
    return localReply(request, reason)
  }
}
