/**
 * Smoke test for the pure logic: assistant replies, dedupe, gap analysis,
 * and both exporters. Run with: node src/lib/__smoke__.ts
 */
import { respond, normalise } from '../src/lib/assistant.ts'
import {
  DEFAULT_LLM_SETTINGS,
  OFFLINE_STATUS,
  type AssistantStatus,
  buildMessages,
  fetchAssistantStatus,
  isLlmConfigured,
  loadLlmSettings,
  parseLlmContent,
  pingLlm,
  respondSmart,
  saveLlmSettings,
} from '../src/lib/llm.ts'
import { toCsv, toMarkdown } from '../src/lib/export.ts'
import { statsOf, progressLine, type Checklist, type Store } from '../src/types/index.ts'
import * as ops from '../src/store/operations.ts'

/* ---------- tiny stubs so the model path can be exercised offline ---------- */

const storageBag = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => storageBag.get(key) ?? null,
  setItem: (key: string, value: string) => void storageBag.set(key, value),
  removeItem: (key: string) => void storageBag.delete(key),
}

type FetchStub = (url: string, init?: RequestInit) => Promise<unknown>
const realFetch = (globalThis as unknown as { fetch?: unknown }).fetch
function setFetch(stub: FetchStub | undefined) {
  if (stub) (globalThis as unknown as { fetch: unknown }).fetch = stub
  else (globalThis as unknown as { fetch: unknown }).fetch = realFetch
}

/** A 200 from the assistant server, carrying whatever JSON we hand it. */
function json(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) }
}

/** A failed assistant server response, shaped the way the client reads it. */
function providerError(status: number, message: string) {
  return { ok: false, status, json: async () => ({ error: message }), text: async () => message }
}

const emptyStore: Store = { projects: [] }

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const checklist: Checklist = {
  id: 'c1',
  name: 'Checkout smoke',
  createdAt: new Date().toISOString(),
  rows: [
    { kind: 'section', id: 's1', title: 'Payments' },
    {
      kind: 'step',
      id: 'p1',
      title: 'Pay for a normal order with a valid card',
      status: 'pass',
      expected: 'One charge only.',
    },
    {
      kind: 'step',
      id: 'p2',
      title: 'Pay with a declined card',
      status: 'fail',
      notes: 'No error shown, page went blank.',
    },
    { kind: 'step', id: 'p3', title: 'Sign in with valid credentials', status: 'not-run' },
    { kind: 'step', id: 'p4', title: 'Search with no matches', status: 'blocked', notes: 'Search box missing.' },
  ],
}

console.log('\nstats & progress')
const stats = statsOf(checklist.rows)
check('counts only steps', stats.total === 4, `total=${stats.total}`)
check('run = pass+fail+blocked', stats.run === 3, `run=${stats.run}`)
check('fail counted', stats.fail === 1)
check('blocked counted', stats.blocked === 1)
check('notRun counted', stats.notRun === 1)
check('progress line matches the brief', progressLine(stats) === '3 of 4 run, 1 failed, 1 blocked', progressLine(stats))

console.log('\nassistant: describing a project')
const described = respond({
  input: 'it is a booking site with login, search and payments',
  projectName: 'Bookings',
  checklistName: 'Checkout smoke',
  existingTitles: checklist.rows.filter((r) => r.kind === 'step').map((r) => r.title),
  memory: [],
})
check('finds several topics', described.memory.length >= 2, `memory=${described.memory.join(',')}`)
check('offers suggestions', described.suggestions.length > 0)
check('asks a follow-up', Boolean(described.followUp))
check('does not offer the payment step already on the list', !described.suggestions.some((s) => normalise(s.title) === normalise('Pay for a normal order with a valid card')))
check('every suggestion has a section', described.suggestions.every((s) => Boolean(s.section)))
check('suggestion keys are unique', new Set(described.suggestions.map((s) => s.key)).size === described.suggestions.length)

console.log('\nassistant: edge cases for a named flow')
const edges = respond({
  input: 'add edge cases for the password reset',
  projectName: 'Bookings',
  checklistName: 'Checkout smoke',
  existingTitles: [],
  memory: [],
})
check('detects the password topic', edges.memory.includes('password'), edges.memory.join(','))
check('puts them under an edge-case heading', edges.suggestions.every((s) => s.section === 'Edge cases'))
check('includes a link-reuse case', edges.suggestions.some((s) => /reuse the same reset link/i.test(s.title)))

console.log('\nassistant: what am I missing')
const gaps = respond({
  input: 'what am I missing for payments?',
  projectName: 'Bookings',
  checklistName: 'Checkout smoke',
  existingTitles: ['Pay for a normal order with a valid card', 'Pay with a declined card'],
  memory: [],
})
check('detects payments', gaps.memory.includes('payment'), gaps.memory.join(','))
check('skips what is already on the list', !gaps.suggestions.some((s) => /valid card/i.test(s.title)))
check('reports duplicates that were skipped', gaps.duplicatesSkipped >= 2, `skipped=${gaps.duplicatesSkipped}`)
check('still finds open items', gaps.suggestions.length > 0)

console.log('\nassistant: unknown area falls back to generic')
const generic = respond({
  input: 'a thing that does stuff',
  projectName: 'X',
  checklistName: 'Y',
  existingTitles: [],
  memory: [],
})
check('falls back to generic openers', generic.suggestions.length > 0, `n=${generic.suggestions.length}`)
check('still asks something useful', Boolean(generic.followUp))

console.log('\nassistant: dedupe is title-aware')
const dupes = respond({
  input: 'payments',
  projectName: 'X',
  checklistName: 'Y',
  existingTitles: ['Pay with a declined card', 'pay with a DECLINED card!'],
  memory: [],
})
check('drops the duplicated declined-card step', !dupes.suggestions.some((s) => /declined card/i.test(s.title)))

console.log('\nexport: markdown')
const md = toMarkdown({ project: { id: 'x', name: 'Shop', checklists: [], createdAt: '' }, checklist, tester: 'Ada', stats })
check('has the title', md.includes('# Checkout smoke — test results'))
check('names the tester', md.includes('**Tester:** Ada'))
check('has a date', /\*\*Date:\*\*/.test(md))
check('has the summary', md.includes('4 steps · 1 passed · 1 failed · 1 blocked · 1 not run'))
check('keeps section headings', md.includes('## Payments'))
check('ticks a pass', md.includes('- [x] **Pay for a normal order with a valid card** — Pass'))
check('leaves others unticked', md.includes('- [ ] **Pay with a declined card** — Fail'))
check('carries tester notes', md.includes('tester note: No error shown'))
check('has a needs-attention list', md.includes('## Needs attention'))
check('lists the fail there', /- \*\*Fail\*\* Pay with a declined card/.test(md))
check('lists the block there', /- \*\*Blocked\*\* Search with no matches/.test(md))

console.log('\nexport: csv')
const csv = toCsv({ project: { id: 'x', name: 'Shop', checklists: [], createdAt: '' }, checklist, tester: 'Ada', stats })
const lines = csv.split('\n')
check('header row present', lines[0].startsWith('project,checklist,tester,exported_at,section,step,status'))
check('one row per step', lines.filter((l) => l.includes('Pay with a declined card')).length === 1)
check('section carried onto the row', lines.some((l) => l.includes(',Payments,')))
check('summary row present', csv.includes('SUMMARY'))
check('quotes values with commas', csv.includes('"No error shown, page went blank."'))

console.log('\nexport: csv escaping')
const nasty: Checklist = {
  id: 'c2',
  name: 'Nasty',
  createdAt: '',
  rows: [
    {
      kind: 'step',
      id: 'n1',
      title: 'Row with "quotes", a comma, and a\nnewline',
      status: 'pass',
      notes: '=cmd|calc',
    },
  ],
}
const nastyCsv = toCsv({ project: null, checklist: nasty, tester: 'B, "B"', stats: statsOf(nasty.rows) })
check('quotes doubled', nastyCsv.includes('""quotes""'))
check('tester name escaped', nastyCsv.includes('"B, ""B"""'))
check('newline kept inside quotes', /"[^"]*newline[^"]*"/.test(nastyCsv))

console.log('\nstore operations')
let store = ops.addProjectTo(emptyStore, 'Shop 2.4', 'proj1')
check('project added', store.projects.length === 1 && store.projects[0].name === 'Shop 2.4')
store = ops.addChecklistTo(store, 'proj1', 'Checkout', 'list1')
check('checklist added', store.projects[0].checklists.length === 1)

store = ops.addStepTo(store, 'list1', { title: 'Pay with a valid card' })
store = ops.addStepTo(store, 'list1', { title: 'Pay with a declined card' })
store = ops.addSectionTo(store, 'list1', 'Edge cases')
check('steps and a section added', store.projects[0].checklists[0].rows.length === 3)
check('new steps start not-run', statsOf(store.projects[0].checklists[0].rows).notRun === 2)

const batch = ops.addStepsTo(store, 'list1', [
  { title: 'Pay with a valid card' },
  { title: 'PAY WITH A VALID CARD' },
  { title: '  ' },
  { title: 'Refund a paid order' },
])
store = batch.store
check('batch dedupes by title', batch.added === 1, `added=${batch.added}`)
check('batch marks steps as from chat', store.projects[0].checklists[0].rows.some((r) => r.kind === 'step' && r.fromChat))

const firstStep = store.projects[0].checklists[0].rows.find((r) => r.kind === 'step')!
store = ops.updateStepIn(store, 'list1', firstStep.id, { status: 'fail', notes: 'Blank page.' })
let updated = store.projects[0].checklists[0].rows.find((r) => r.id === firstStep.id)!
check('status updated', updated.kind === 'step' && updated.status === 'fail')
check('notes kept on a fail', updated.kind === 'step' && updated.notes === 'Blank page.')

store = ops.resetRunIn(store, 'list1')
updated = store.projects[0].checklists[0].rows.find((r) => r.id === firstStep.id)!
check('reset returns to not-run', updated.kind === 'step' && updated.status === 'not-run')
check('reset clears the notes', updated.kind === 'step' && updated.notes === undefined)

store = ops.setAllStatusIn(store, 'list1', 'blocked')
check(
  'set all marks every step',
  statsOf(store.projects[0].checklists[0].rows).blocked === 3,
  `blocked=${statsOf(store.projects[0].checklists[0].rows).blocked}`,
)

const beforeMove = store.projects[0].checklists[0].rows.map((r) => r.id)
store = ops.moveRowIn(store, 'list1', 0, 2)
const afterMove = store.projects[0].checklists[0].rows.map((r) => r.id)
check('reorder moves the right row', afterMove[2] === beforeMove[0] && afterMove.length === beforeMove.length)
check('reorder keeps every row', new Set(afterMove).size === beforeMove.length)

const sectionId = store.projects[0].checklists[0].rows.find((r) => r.kind === 'section')!.id
store = ops.removeRowFrom(store, 'list1', sectionId)
check('row removed', !store.projects[0].checklists[0].rows.some((r) => r.id === sectionId))

store = ops.removeChecklistFrom(store, 'list1')
check('checklist removed', store.projects[0].checklists.length === 0)
store = ops.removeProjectFrom(store, 'proj1')
check('project removed', store.projects.length === 0)

const untouched = ops.moveRowIn(store, 'nope', 0, 5)
check('unknown checklist is a no-op', untouched === store)

/* ---------- optional model backend (server-held key) ---------- */

console.log('\nllm: settings')
check('defaults to using a model when one exists', DEFAULT_LLM_SETTINGS.enabled === true)
check('needs both the switch and a server model', !isLlmConfigured({ enabled: false }, { available: true, model: 'm' }))
check('needs the switch on as well as a model', !isLlmConfigured({ enabled: true }, OFFLINE_STATUS))
check('is configured when both line up', isLlmConfigured({ enabled: true }, { available: true, model: 'm' }))
check('has no key of its own', !('apiKey' in DEFAULT_LLM_SETTINGS) && !('baseUrl' in DEFAULT_LLM_SETTINGS))
check('loads defaults when nothing is saved', loadLlmSettings().enabled === DEFAULT_LLM_SETTINGS.enabled)
saveLlmSettings({ enabled: false })
check('round-trips through storage', loadLlmSettings().enabled === false)
saveLlmSettings({ enabled: true })

console.log('\nllm: server status')
const offline = await fetchAssistantStatus()
check('reports offline when the endpoint is missing', offline.available === false)
setFetch(() => Promise.resolve(json({ available: true, model: 'gpt-4o-mini' })))
const online = await fetchAssistantStatus()
check('reads the available model', online.available === true && online.model === 'gpt-4o-mini')
setFetch(() => Promise.resolve(json({ available: false })))
check('reads an unconfigured server', (await fetchAssistantStatus()).available === false)
setFetch(() => Promise.reject(new Error('network down')))
check('never throws when offline', (await fetchAssistantStatus()).available === false)
setFetch(undefined)

console.log('\nllm: request building')
const built = buildMessages({
  input: 'add edge cases for login',
  projectName: 'Bookings',
  brief: 'a booking site',
  checklistName: 'Checkout',
  existingTitles: ['Sign in with valid credentials'],
  memory: [],
  history: [
    { who: 'tester', text: 'it is a booking site' },
    { who: 'pencil', text: 'Noted.' },
  ],
})
check('has a system persona', built[0].role === 'system' && /Pencil/.test(built[0].content))
check('sends checklist context', built.some((m) => m.role === 'system' && m.content.includes('Sign in with valid credentials')))
check('maps tester turns to user', built.some((m) => m.role === 'user' && m.content === 'it is a booking site'))
check('maps pencil turns to assistant', built.some((m) => m.role === 'assistant' && m.content === 'Noted.'))
check('ends with the fresh input', built[built.length - 1].role === 'user' && built[built.length - 1].content === 'add edge cases for login')
check('holds no secrets for the server to add', built.every((m) => !/sk-/.test(m.content)))

console.log('\nllm: parsing')
const clean = parseLlmContent(
  JSON.stringify({ reply: 'Try these.', followUp: 'Which matters most?', suggestions: [{ title: 'Reset via email', expected: 'Link arrives.' }] }),
)
check('reads plain json', clean.reply === 'Try these.' && clean.suggestions.length === 1)
check('keeps follow-up and expected', clean.followUp === 'Which matters most?' && clean.suggestions[0].expected === 'Link arrives.')
const fenced = parseLlmContent('```json\n{"reply":"Hi","suggestions":[{"title":"A step"}]}\n```')
check('unwraps code fences', fenced.reply === 'Hi' && fenced.suggestions.length === 1)
const chatty = parseLlmContent('Sure! Here you go:\n{"reply":"Ok","suggestions":[]}\nHope that helps.')
check('survives surrounding prose', chatty.reply === 'Ok')
const partial = parseLlmContent('{"reply":"x","suggestions":[{"no":"title"},{"title":"  "},{"title":"Real"}]}')
check('drops untitled suggestions', partial.suggestions.length === 1 && partial.suggestions[0].title === 'Real')
let threw = false
try {
  parseLlmContent('not json at all')
} catch {
  threw = true
}
check('throws on nonsense', threw)

console.log('\nllm: smart reply')
const baseRequest = {
  input: 'it is a booking site with payments',
  projectName: 'Bookings',
  checklistName: 'Checkout',
  existingTitles: [],
  memory: [],
}

const offlineStatus = OFFLINE_STATUS
const liveStatus: AssistantStatus = { available: true, model: 'gpt-4o-mini' }

const offReply = await respondSmart(baseRequest, DEFAULT_LLM_SETTINGS, offlineStatus)
check('uses the local engine when the server is quiet', offReply.source === 'local' && offReply.suggestions.length > 0)
check('local reply has no error', offReply.error === undefined)

const switchedOff = await respondSmart(baseRequest, { enabled: false }, liveStatus)
check('respects the tester turning it off', switchedOff.source === 'local' && switchedOff.error === undefined)

let sentUrl = ''
let sentBody = ''
setFetch((url, init) => {
  sentUrl = String(url)
  sentBody = String(init?.body ?? '')
  return Promise.resolve(
    json({
      content: JSON.stringify({
        reply: 'Margin scrawl.',
        followUp: 'Any 3-D Secure?',
        quickReplies: ['Add more', 'What is missing?'],
        suggestions: [{ title: 'Pay with a 3-D Secure card', section: 'Payments', expected: 'Challenge appears.' }],
      }),
    }),
  )
})
const modelReply = await respondSmart(baseRequest, DEFAULT_LLM_SETTINGS, liveStatus)
check('marks model-sourced replies', modelReply.source === 'model')
check('maps suggestions with a key', modelReply.suggestions[0]?.key === 'pay with a 3 d secure card', modelReply.suggestions[0]?.key)
check('carries the reply text', modelReply.reply === 'Margin scrawl.')
check('carries quick replies', modelReply.quickReplies?.length === 2)
check('talks to the server, not the provider', sentUrl === '/api/assistant' && !/openai\.com|api\./.test(sentUrl))
check('sends only messages, never a key', JSON.parse(sentBody).messages.length >= 2 && !('apiKey' in JSON.parse(sentBody)))

let called = 0
setFetch(() => {
  called++
  return Promise.resolve(providerError(401, 'The provider rejected the server API key.'))
})
const fellBack = await respondSmart(baseRequest, DEFAULT_LLM_SETTINGS, liveStatus)
check('falls back to local on a server error', fellBack.source === 'local' && fellBack.suggestions.length > 0)
check('explains the fallback', Boolean(fellBack.error) && /key/i.test(fellBack.error!))
check('still made the network attempt', called === 1)

setFetch(() => Promise.resolve(json({ content: 'not valid json' })))
const badJson = await respondSmart(baseRequest, DEFAULT_LLM_SETTINGS, liveStatus)
check('falls back on unparseable output', badJson.source === 'local' && Boolean(badJson.error))

setFetch(() => Promise.reject(new Error('network down')))
const noNet = await respondSmart(baseRequest, DEFAULT_LLM_SETTINGS, liveStatus)
check('falls back when the server is unreachable', noNet.source === 'local' && Boolean(noNet.error))

setFetch((url, init) => {
  check('ping hits the server endpoint', String(url) === '/api/assistant')
  const body = JSON.parse(String(init?.body ?? '{}'))
  check('ping uses the tiny prompt', body.messages.length === 2 && !('apiKey' in body))
  return Promise.resolve(json({ content: 'ready' }))
})
let pingOk = true
try {
  await pingLlm()
} catch {
  pingOk = false
}
check('ping resolves on a good answer', pingOk)

setFetch(() => Promise.resolve(providerError(503, 'No assistant model is configured on the server yet.')))
let pingFailed = false
try {
  await pingLlm()
} catch (err) {
  pingFailed = err instanceof Error && /not configured|configured on the server/i.test(err.message)
}
check('ping surfaces the server message', pingFailed)

setFetch(undefined)

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}\n`)
process.exit(failures === 0 ? 0 : 1)
