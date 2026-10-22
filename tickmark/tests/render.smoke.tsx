/**
 * Render smoke test. Stubs localStorage, renders the whole app on the server,
 * and checks the pieces the brief calls for actually make it into the markup.
 */
import { renderToString } from 'react-dom/server'
import App from '../src/App.tsx'
import SettingsSheet from '../src/components/SettingsSheet.tsx'
import { DEFAULT_LLM_SETTINGS, OFFLINE_STATUS } from '../src/lib/llm.ts'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function stubStorage(seed: unknown) {
  const bag = new Map<string, string>()
  if (seed) bag.set('tickmark.v1', JSON.stringify(seed))
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => void bag.set(key, value),
    removeItem: (key: string) => void bag.delete(key),
  }
}

/** React SSR inserts <!-- --> between adjacent text nodes; strip them so we
 *  can assert on the text a tester would actually see. */
function visible(markup: string): string {
  return markup.replace(/<!--\s*-->/g, '')
}

const seed = {
  projects: [
    {
      id: 'p1',
      name: 'Shop 2.4',
      tester: 'Ada',
      brief: 'a shop with a checkout',
      createdAt: '2026-01-01T00:00:00.000Z',
      checklists: [
        {
          id: 'c1',
          name: 'Checkout',
          createdAt: '2026-01-01T00:00:00.000Z',
          rows: [
            { kind: 'section', id: 's1', title: 'Payments' },
            {
              kind: 'step',
              id: 'st1',
              title: 'Pay for a normal order with a valid card',
              expected: 'One charge only.',
              status: 'pass',
            },
            {
              kind: 'step',
              id: 'st2',
              title: 'Pay with a declined card',
              status: 'fail',
              notes: 'Blank page, no message.',
              fromChat: true,
            },
            { kind: 'step', id: 'st3', title: 'Search with no matches', status: 'blocked', notes: 'Box missing.' },
            { kind: 'step', id: 'st4', title: 'Sign in with valid credentials', status: 'not-run' },
          ],
        },
      ],
    },
  ],
}

console.log('\nrender: empty notebook')
stubStorage(null)
let html = renderToString(<App />)
check('shows the masthead', html.includes('Tickmark'))
check('invites a first project', /No projects yet/.test(html))
check('welcome explains the flow', /manual testing/i.test(html))

console.log('\nrender: seeded project')
stubStorage(seed)
html = renderToString(<App />)
const text = visible(html)
check('renders the project name', text.includes('Shop 2.4'))
check('renders the checklist name', text.includes('Checkout'))
check('shows the run summary', text.includes('3 of 4 run'), text.match(/\d+ of \d+ run/)?.[0] ?? 'not found')
check('calls out the failure', /1 failed/.test(text))
check('renders section heading', text.includes('Payments'))
check('renders the pass stamp', text.includes('stamp--pass') && text.includes('PASS'))
check('renders the fail stamp', text.includes('stamp--fail') && text.includes('FAIL'))
check('renders the blocked stamp', text.includes('stamp--blocked'))
check('marks chat-sourced steps', text.includes('from chat'))
check('has a checkbox role', text.includes('role="checkbox"'))
check('shows the fail note field', text.includes('What went wrong?'))
check('shows the blocked note field', text.includes('What is in the way?'))
check('has status chips', text.includes('chip--fail') && text.includes('chip--blocked'))
check('has a drag handle', text.includes('drag-handle') && text.includes('Reorder'))
check('has the progress bar', text.includes('progress__track'))
check('has filters with counts', text.includes('filter--fail'))
check('has the pencil assistant', text.includes('Margin notes') && text.includes('Pencil'))
check('assistant says it will not touch the list', /never touches your checklist|nothing lands until/i.test(text))
check('has the export control', text.includes('Export'))
check('has the reset control', text.includes('Reset run'))
check('has add-step controls', text.includes('Add step') && text.includes('Section'))
check('assistant composer present', text.includes('assistant-input'))
check('has the assistant settings control', text.includes('masthead__gear') && text.includes('Assistant settings'))
check('assistant shows the offline mode', /offline notes/.test(text))

console.log('\nrender: assistant settings sheet')
const sheetOffline = visible(
  renderToString(
    <SettingsSheet
      settings={DEFAULT_LLM_SETTINGS}
      status={OFFLINE_STATUS}
      onSave={() => {}}
      onClose={() => {}}
      onRefreshStatus={() => {}}
    />,
  ),
)
check('opens as a dialog', sheetOffline.includes('role="dialog"') && sheetOffline.includes('Assistant settings'))
check('has the master switch', sheetOffline.includes('Use the assistant'))
check('has a test button', sheetOffline.includes('Test connection'))
check('reports no model on the server', /No model is configured/i.test(sheetOffline))
check('points at the env var', sheetOffline.includes('TICKMARK_LLM_API_KEY'))
check('keeps the key off the client', /never in this browser/i.test(sheetOffline))
check('offers offline notes', /Offline notes are always available/i.test(sheetOffline))

console.log('\nrender: assistant settings sheet, model available')
const sheetLive = visible(
  renderToString(
    <SettingsSheet
      settings={DEFAULT_LLM_SETTINGS}
      status={{ available: true, model: 'gpt-4o-mini' }}
      onSave={() => {}}
      onClose={() => {}}
      onRefreshStatus={() => {}}
    />,
  ),
)
check('shows the available model', sheetLive.includes('gpt-4o-mini'))
check('reports a model is available', /A model is available/i.test(sheetLive))

console.log('\nrender: settings sheet keeps no secret fields')
check('has no api key field', !sheetLive.includes('type="password"') && !sheetLive.includes('settings__key'))
check('has no base url field', !sheetLive.includes('Base URL'))
check('has no provider presets', !sheetLive.includes('OpenRouter') && !sheetLive.includes('Ollama'))
check('has no model picker', !sheetLive.includes('Presets'))

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}\n`)
process.exit(failures === 0 ? 0 : 1)
