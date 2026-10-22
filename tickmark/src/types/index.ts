export type ItemStatus = 'not-run' | 'pass' | 'fail' | 'blocked'

export interface TestStep {
  kind: 'step'
  id: string
  title: string
  details?: string
  expected?: string
  status: ItemStatus
  /** Required for fail / blocked. */
  notes?: string
  /** True when the tester accepted this step from the assistant. */
  fromChat?: boolean
}

export interface SectionRow {
  kind: 'section'
  id: string
  title: string
}

export type Row = TestStep | SectionRow

export interface Checklist {
  id: string
  name: string
  rows: Row[]
  createdAt: string
}

export interface Project {
  id: string
  name: string
  /** Plain-language brief the tester gave the assistant. */
  brief?: string
  tester?: string
  checklists: Checklist[]
  createdAt: string
}

export interface Store {
  projects: Project[]
}

/* ---------- helpers ---------- */

let seq = 0
export function createId(): string {
  seq = (seq + 1) % 1000
  return Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 8)
}

export function isStep(row: Row): row is TestStep {
  return row.kind === 'step'
}

export function stepsOf(checklist: Checklist): TestStep[] {
  return checklist.rows.filter(isStep)
}

export interface RunStats {
  total: number
  run: number
  pass: number
  fail: number
  blocked: number
  notRun: number
}

export function statsOf(rows: Row[]): RunStats {
  const stats: RunStats = { total: 0, run: 0, pass: 0, fail: 0, blocked: 0, notRun: 0 }
  for (const row of rows) {
    if (!isStep(row)) continue
    stats.total++
    if (row.status === 'not-run') stats.notRun++
    else stats.run++
    if (row.status === 'pass') stats.pass++
    else if (row.status === 'fail') stats.fail++
    else if (row.status === 'blocked') stats.blocked++
  }
  return stats
}

/** progress text: "14 of 20 run, 2 failed" */
export function progressLine(stats: RunStats): string {
  if (stats.total === 0) return 'Nothing to run yet'
  const parts = [`${stats.run} of ${stats.total} run`]
  if (stats.fail > 0) parts.push(`${stats.fail} failed`)
  if (stats.blocked > 0) parts.push(`${stats.blocked} blocked`)
  return parts.join(', ')
}

/* ---------- persistence ---------- */

const STORAGE_KEY = 'tickmark.v1'

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.projects)) return parsed as Store
    }
  } catch (err) {
    console.warn('Tickmark could not read saved data', err)
  }
  return { projects: [] }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch (err) {
    console.warn('Tickmark could not save data', err)
  }
}
