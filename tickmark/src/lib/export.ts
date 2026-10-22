import { type Checklist, type Project, type Row, type RunStats, isStep, statsOf } from '../types'

export interface ExportContext {
  project?: Project | null
  checklist: Checklist
  tester: string
  stats: RunStats
}

function formatDate(date = new Date()): string {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_LABEL: Record<string, string> = {
  'not-run': 'Not run',
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function summaryLine(stats: RunStats): string {
  const parts = [
    `${stats.total} steps`,
    `${stats.pass} passed`,
    `${stats.fail} failed`,
    `${stats.blocked} blocked`,
    `${stats.notRun} not run`,
  ]
  return parts.join(' · ')
}

export function toMarkdown(ctx: ExportContext): string {
  const { checklist, project, tester, stats } = ctx
  const lines: string[] = []

  lines.push(`# ${checklist.name} — test results`)
  lines.push('')
  lines.push(`- **Project:** ${project?.name ?? '—'}`)
  lines.push(`- **Tester:** ${tester.trim() || '—'}`)
  lines.push(`- **Date:** ${formatDate()}`)
  lines.push(`- **Result:** ${summaryLine(stats)}`)
  lines.push('')

  if (stats.total > 0) {
    lines.push(_asciiBar(stats))
    lines.push('')
  }

  let currentSection: string | null = null
  let wroteSteps = false

  for (const row of checklist.rows as Row[]) {
    if (row.kind === 'section') {
      lines.push('')
      lines.push(`## ${row.title}`)
      lines.push('')
      currentSection = row.title
      continue
    }
    if (!isStep(row)) continue
    if (currentSection === null && !wroteSteps) {
      lines.push('## Steps')
      lines.push('')
      currentSection = 'Steps'
    }
    const mark = row.status === 'pass' ? 'x' : ' '
    lines.push(`- [${mark}] **${row.title}** — ${STATUS_LABEL[row.status]}`)
    if (row.expected) lines.push(`  - expected: ${row.expected}`)
    if (row.details) lines.push(`  - notes: ${row.details}`)
    if (row.notes) lines.push(`  - tester note: ${row.notes.replace(/\n/g, ' ')}`)
    wroteSteps = true
  }

  if (stats.fail > 0 || stats.blocked > 0) {
    lines.push('')
    lines.push('## Needs attention')
    lines.push('')
    for (const row of checklist.rows) {
      if (!isStep(row) || (row.status !== 'fail' && row.status !== 'blocked')) continue
      lines.push(`- **${STATUS_LABEL[row.status]}** ${row.title}${row.notes ? ` — ${row.notes}` : ''}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

function _asciiBar(stats: RunStats): string {
  const width = 24
  const filled = stats.total === 0 ? 0 : Math.round((stats.run / stats.total) * width)
  const failed = stats.total === 0 ? 0 : Math.round((stats.fail / stats.total) * width)
  const blocked = stats.total === 0 ? 0 : Math.round((stats.blocked / stats.total) * width)
  const okWidth = Math.max(0, filled - failed - blocked)
  const bar =
    '█'.repeat(okWidth) +
    '▓'.repeat(failed) +
    '▒'.repeat(blocked) +
    '░'.repeat(Math.max(0, width - filled))
  return `\`${bar}\``
}

export function toCsv(ctx: ExportContext): string {
  const { checklist, project, tester, stats } = ctx
  const header = [
    'project',
    'checklist',
    'tester',
    'exported_at',
    'section',
    'step',
    'status',
    'expected',
    'details',
    'tester_notes',
    'from_chat',
  ]
  const stamp = new Date().toISOString()

  const lines: string[] = [header.join(',')]
  let section = ''
  for (const row of checklist.rows) {
    if (row.kind === 'section') {
      section = row.title
      continue
    }
    lines.push(
      [
        escapeCsv(project?.name ?? ''),
        escapeCsv(checklist.name),
        escapeCsv(tester.trim()),
        escapeCsv(stamp),
        escapeCsv(section),
        escapeCsv(row.title),
        STATUS_LABEL[row.status],
        escapeCsv(row.expected ?? ''),
        escapeCsv(row.details ?? ''),
        escapeCsv(row.notes ?? ''),
        row.fromChat ? 'yes' : 'no',
      ].join(','),
    )
  }

  // summary rows, so the numbers travel with the file
  lines.push('')
  lines.push('summary,,,' + escapeCsv(tester.trim()) + ',,,,')
  lines.push(
    [
      '',
      '',
      '',
      escapeCsv(stamp),
      'SUMMARY',
      `${stats.total} steps`,
      '',
      `${stats.pass} passed`,
      `${stats.fail} failed`,
      `${stats.blocked} blocked`,
      `${stats.notRun} not run`,
    ].join(','),
  )
  return lines.join('\n')
}

export function statsForExport(checklist: Checklist): RunStats {
  return statsOf(checklist.rows)
}
