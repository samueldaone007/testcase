import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Checklist, type ItemStatus, type Row, type RunStats, type TestStep, isStep } from '../types'
import StepRow from './StepRow'
import './ChecklistView.css'

export type StatusFilter = ItemStatus | 'all'

interface Props {
  checklist: Checklist
  stats: RunStats
  onTogglePass: (step: TestStep) => void
  onSetStatus: (step: TestStep, status: ItemStatus) => void
  onNotes: (step: TestStep, notes: string) => void
  onPatch: (step: TestStep, patch: Partial<TestStep>) => void
  onDelete: (row: Row) => void
  onAddStep: (title: string, section: string | undefined) => void
  onAddSection: (title: string) => void
  onMove: (from: number, to: number) => void
  onResetRun: () => void
  onOpenExport: () => void
}

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'not-run', label: 'Not run' },
  { id: 'pass', label: 'Pass' },
  { id: 'fail', label: 'Fail' },
  { id: 'blocked', label: 'Blocked' },
]

function countFor(rows: Row[], filter: StatusFilter): number {
  if (filter === 'all') return rows.filter(isStep).length
  return rows.filter((row) => isStep(row) && row.status === filter).length
}

export default function ChecklistView(props: Props) {
  const { checklist, stats, onMove, onResetRun, onOpenExport, onAddStep, onAddSection } = props
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [adding, setAdding] = useState<{ kind: 'step' | 'section' } | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const draftRef = useRef<HTMLInputElement>(null)

  const dragState = useRef<number | null>(null)
  const onMoveRef = useRef(onMove)

  useEffect(() => {
    if (adding) draftRef.current?.focus()
  }, [adding])

  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  /* ---------- pointer drag reorder ---------- */

  useEffect(() => {
    if (dragIndex === null) return
    dragState.current = dragIndex

    const handleMove = (event: PointerEvent) => {
      const from = dragState.current
      if (from === null) return
      const under = document.elementFromPoint(event.clientX, event.clientY)
      const rowEl = under?.closest('[data-index]') as HTMLElement | null
      if (!rowEl) return
      const target = Number(rowEl.dataset.index)
      if (Number.isNaN(target) || target === from) return
      onMoveRef.current(from, target)
      dragState.current = target
    }

    const stop = () => setDragIndex(null)

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragIndex])

  const startDrag = useCallback(
    (index: number, event: React.PointerEvent) => {
      if (filter !== 'all') return
      event.preventDefault()
      dragState.current = index
      setDragIndex(index)
    },
    [filter],
  )

  /* ---------- filtered view ---------- */

  const visibleRows = useMemo(() => {
    if (filter === 'all') return checklist.rows
    const kept: Row[] = []
    let sectionHasMatch = false
    let pendingSection: Row | null = null
    for (const row of checklist.rows) {
      if (row.kind === 'section') {
        if (pendingSection && sectionHasMatch) kept.push(pendingSection)
        pendingSection = row
        sectionHasMatch = false
        continue
      }
      if (row.status === filter) {
        kept.push(row)
        sectionHasMatch = true
      }
    }
    if (pendingSection && sectionHasMatch) kept.push(pendingSection)
    return kept
  }, [checklist.rows, filter])

  const percent = stats.total === 0 ? 0 : Math.round((stats.run / stats.total) * 100)

  /** New steps join the section at the end of the list, so grouping stays tidy. */
  let lastSectionForAppend: string | undefined
  for (const row of checklist.rows) {
    if (row.kind === 'section') lastSectionForAppend = row.title
  }

  const submitDraft = () => {
    const title = draftTitle.trim()
    if (!title) {
      setAdding(null)
      return
    }
    if (adding?.kind === 'section') onAddSection(title)
    else onAddStep(title, lastSectionForAppend)
    setDraftTitle('')
    setAdding(null)
  }

  return (
    <section className="checklist-view" aria-label={`Checklist: ${checklist.name}`}>
      <header className="checklist-head">
        <div className="checklist-head__top">
          <div>
            <p className="kicker">Checklist</p>
            <h2 className="checklist-name">{checklist.name}</h2>
          </div>
          <div className="checklist-head__actions">
            <button type="button" className="stamp-btn" onClick={onOpenExport}>
              Export
            </button>
            <button
              type="button"
              className="stamp-btn"
              onClick={() => {
                if (stats.run === 0 || window.confirm('Reset every step back to "Not run"? Notes on fails and blocks are cleared too.')) {
                  onResetRun()
                }
              }}
              disabled={stats.total === 0}
            >
              Reset run
            </button>
          </div>
        </div>

        <div className="progress" aria-hidden="true">
          <div className="progress__track">
            <div className="progress__fill" style={{ width: `${percent}%` }} />
            <div className="progress__fail" style={{ width: `${stats.total ? (stats.fail / stats.total) * 100 : 0}%` }} />
          </div>
        </div>
        <p className="progress__label">
          <strong>{stats.run} of {stats.total} run</strong>
          {stats.fail > 0 && <span className="progress__fail-text">, {stats.fail} failed</span>}
          {stats.blocked > 0 && <span>, {stats.blocked} blocked</span>}
          {stats.total > 0 && stats.run === 0 && <span> — nothing run yet</span>}
          {stats.total > 0 && stats.run === stats.total && stats.fail === 0 && stats.blocked === 0 && (
            <span className="progress__clean"> — all clear</span>
          )}
        </p>
      </header>

      <div className="filter-bar" role="group" aria-label="Filter steps by status">
        {FILTERS.map((entry) => {
          const count = countFor(checklist.rows, entry.id)
          const active = filter === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              className={`filter-chip filter--${entry.id}${active ? ' is-on' : ''}${count === 0 && !active ? ' is-empty' : ''}`}
              aria-pressed={active}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
              <span className="filter-chip__count">{count}</span>
            </button>
          )
        })}
      </div>

      {visibleRows.length === 0 ? (
        <div className="empty-sheet">
          <p className="empty-sheet__line">
            {checklist.rows.length === 0
              ? 'This page is still blank.'
              : filter === 'all'
                ? 'This page is still blank.'
                : `Nothing marked "${FILTERS.find((f) => f.id === filter)?.label}".`}
          </p>
          <p className="empty-sheet__hint">
            {checklist.rows.length === 0
              ? 'Write your first step, or ask the pencil in the margin.'
              : 'Add a step below, or clear the filter.'}
          </p>
        </div>
      ) : (
        <ul className="step-list" ref={listRef}>
          {visibleRows.map((row, index) =>
            row.kind === 'section' ? (
              <li key={row.id} className="section-row" data-index={index}>
                <span className="section-row__rule" aria-hidden="true" />
                <h3 className="section-row__title">{row.title}</h3>
              </li>
            ) : (
              <StepRow
                key={row.id}
                step={row}
                index={index}
                total={stats.total}
                dragging={dragIndex === index}
                onTogglePass={() => props.onTogglePass(row)}
                onSetStatus={(status) => props.onSetStatus(row, status)}
                onNotes={(notes) => props.onNotes(row, notes)}
                onPatch={(patch) => props.onPatch(row, patch)}
                onDelete={() => props.onDelete(row)}
                onDragStart={startDrag}
              />
            ),
          )}
        </ul>
      )}

      {filter !== 'all' && checklist.rows.some(isStep) && (
        <p className="drag-note">Clear the filter to drag steps around.</p>
      )}

      <div className="composer">
        {adding ? (
          <div className="composer__row">
            <span className="composer__label kicker">
              {adding.kind === 'section' ? 'Section heading' : lastSectionForAppend ? `New step in “${lastSectionForAppend}”` : 'New step'}
            </span>
            <input
              ref={draftRef}
              className="composer__input"
              value={draftTitle}
              placeholder={adding.kind === 'section' ? 'e.g. Checkout' : 'e.g. Reset a password with an expired link'}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitDraft()
                }
                if (event.key === 'Escape') {
                  setAdding(null)
                  setDraftTitle('')
                }
              }}
            />
            <div className="composer__buttons">
              <button type="button" className="stamp-btn solid" onClick={submitDraft}>
                Add
              </button>
              <button
                type="button"
                className="stamp-btn ghost"
                onClick={() => {
                  setAdding(null)
                  setDraftTitle('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="composer__buttons composer__buttons--split">
            <button type="button" className="stamp-btn solid" onClick={() => setAdding({ kind: 'step' })}>
              + Add step
            </button>
            <button type="button" className="stamp-btn" onClick={() => setAdding({ kind: 'section' })}>
              + Section
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
