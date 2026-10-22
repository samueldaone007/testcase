import { useMemo, useState } from 'react'
import { type Checklist, type Project, type RunStats } from '../types'
import { toCsv, toMarkdown } from '../lib/export'
import './ExportSheet.css'

interface Props {
  project: Project | null
  checklist: Checklist
  stats: RunStats
  defaultTester: string
  onRememberTester: (name: string) => void
  onClose: () => void
}

export default function ExportSheet({
  project,
  checklist,
  stats,
  defaultTester,
  onRememberTester,
  onClose,
}: Props) {
  const [tester, setTester] = useState(defaultTester)
  const [format, setFormat] = useState<'markdown' | 'csv'>('markdown')
  const [copied, setCopied] = useState(false)
  // Capture the export date once, so the filename and preview stay stable across renders.
  const [stampDate] = useState(() => new Date().toISOString().slice(0, 10))

  const ctx = useMemo(
    () => ({ project, checklist, tester, stats }),
    [project, checklist, tester, stats],
  )

  const body = format === 'markdown' ? toMarkdown(ctx) : toCsv(ctx)
  const filename = `${checklist.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${stampDate}.${
    format === 'markdown' ? 'md' : 'csv'
  }`

  const download = () => {
    const mime = format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/csv;charset=utf-8'
    const blob = new Blob(['\uFEFF' + body], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    if (tester.trim()) onRememberTester(tester.trim())
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      if (tester.trim()) onRememberTester(tester.trim())
    } catch {
      window.prompt('Select and copy:', body)
    }
  }

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Export checklist results"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section className="sheet">
        <header className="sheet__head">
          <div>
            <p className="kicker">Export</p>
            <h2 className="sheet__title">{checklist.name}</h2>
          </div>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Close export">
            ✕
          </button>
        </header>

        <div className="sheet__fields">
          <label className="field">
            <span className="kicker">Tester</span>
            <input
              value={tester}
              placeholder="Who ran this?"
              onChange={(event) => setTester(event.target.value)}
              onBlur={() => tester.trim() && onRememberTester(tester.trim())}
            />
          </label>

          <fieldset className="format">
            <legend className="kicker">Format</legend>
            <label className={`format__opt${format === 'markdown' ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="format"
                checked={format === 'markdown'}
                onChange={() => setFormat('markdown')}
              />
              <span className="format__name">Markdown</span>
              <span className="format__hint">ticks, sections, a needs-attention list</span>
            </label>
            <label className={`format__opt${format === 'csv' ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="format"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
              />
              <span className="format__name">CSV</span>
              <span className="format__hint">one row per step, plus a summary row</span>
            </label>
          </fieldset>

          <div className="summary-strip">
            <span className="summary-pill summary-pill--pass">{stats.pass} pass</span>
            <span className="summary-pill summary-pill--fail">{stats.fail} fail</span>
            <span className="summary-pill summary-pill--blocked">{stats.blocked} blocked</span>
            <span className="summary-pill summary-pill--rest">{stats.notRun} not run</span>
          </div>
        </div>

        <pre className="sheet__preview" aria-label="Export preview">
          {body}
        </pre>

        <footer className="sheet__foot">
          <span className="sheet__filename">{filename}</span>
          <div className="sheet__buttons">
            <button type="button" className="stamp-btn" onClick={copy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button type="button" className="stamp-btn solid" onClick={download}>
              Download
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
