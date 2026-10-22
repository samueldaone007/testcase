import { useEffect, useId, useRef, useState } from 'react'
import { type ItemStatus, type TestStep } from '../types'
import Stamp from './Stamp'
import './StepRow.css'

interface Props {
  step: TestStep
  index: number
  total: number
  dragging?: boolean
  onTogglePass: () => void
  onSetStatus: (status: ItemStatus) => void
  onNotes: (notes: string) => void
  onPatch: (patch: Partial<TestStep>) => void
  onDelete: () => void
  onDragStart: (index: number, event: React.PointerEvent) => void
}

const STATUS_NOTE: Partial<Record<ItemStatus, string>> = {
  fail: 'What went wrong?',
  blocked: 'What is in the way?',
}

export default function StepRow({
  step,
  index,
  total,
  dragging,
  onTogglePass,
  onSetStatus,
  onNotes,
  onPatch,
  onDelete,
  onDragStart,
}: Props) {
  const titleId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title: step.title, details: step.details ?? '', expected: step.expected ?? '' })
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      titleRef.current?.focus()
      titleRef.current?.select()
    }
  }, [editing])

  const isPass = step.status === 'pass'
  const isFail = step.status === 'fail'
  const isBlocked = step.status === 'blocked'
  const needsNotes = isFail || isBlocked

  const saveEdit = () => {
    const title = draft.title.trim()
    onPatch({ title: title || step.title, details: draft.details.trim() || undefined, expected: draft.expected.trim() || undefined })
    setEditing(false)
  }

  return (
    <li
      className={`step-row status-${step.status}${dragging ? ' is-dragging' : ''}`}
      data-step-id={step.id}
      data-index={index}
      aria-label={`Step ${index + 1} of ${total}`}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Reorder "${step.title}"`}
        title="Drag to reorder"
        onPointerDown={(event) => onDragStart(index, event)}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>

      <div className="step-main">
        <div className="step-head">
          <button
            type="button"
            className={`tactile-box${isPass ? ' is-checked' : ''}`}
            role="checkbox"
            aria-checked={isPass}
            aria-labelledby={titleId}
            onClick={onTogglePass}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path className="tactile-box__tick" d="M5 13.2 L9.6 17.8 L19 6.8" />
            </svg>
          </button>

          <div className="step-titles">
            {editing ? (
              <textarea
                ref={titleRef}
                className="edit-title"
                value={draft.title}
                rows={1}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    saveEdit()
                  }
                  if (event.key === 'Escape') setEditing(false)
                }}
                aria-label="Step title"
              />
            ) : (
              <button type="button" className="step-title" id={titleId} onClick={() => setEditing(true)} title="Click to edit">
                {step.fromChat && <span className="from-chat">from chat</span>}
                <span className="step-title__text">{step.title}</span>
              </button>
            )}
            {step.status !== 'not-run' && <Stamp status={step.status} />}
          </div>

          <div className="row-tools">
            <button type="button" className="tool" onClick={() => setEditing((value) => !value)} aria-label={editing ? 'Cancel edit' : 'Edit step'}>
              {editing ? '✕' : '✎'}
            </button>
            <button type="button" className="tool tool--danger" onClick={onDelete} aria-label={`Delete "${step.title}"`}>
              ✕
            </button>
          </div>
        </div>

        {editing ? (
          <div className="edit-panel">
            <label className="edit-field">
              <span className="kicker">Details</span>
              <textarea
                rows={2}
                value={draft.details}
                placeholder="How to do it, what data to use…"
                onChange={(event) => setDraft({ ...draft, details: event.target.value })}
              />
            </label>
            <label className="edit-field">
              <span className="kicker">Expected result</span>
              <textarea
                rows={2}
                value={draft.expected}
                placeholder="What a pass looks like…"
                onChange={(event) => setDraft({ ...draft, expected: event.target.value })}
              />
            </label>
            <div className="edit-actions">
              <button type="button" className="stamp-btn solid" onClick={saveEdit}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {step.details && <p className="step-details">{step.details}</p>}
            {step.expected && (
              <p className="step-expected">
                <span className="kicker">Expect</span> {step.expected}
              </p>
            )}
          </>
        )}

        <div className="status-strip" role="group" aria-label={`Status for ${step.title}`}>
          <button
            type="button"
            className={`chip chip--pass${isPass ? ' is-on' : ''}`}
            aria-pressed={isPass}
            onClick={() => onSetStatus(isPass ? 'not-run' : 'pass')}
          >
            Pass
          </button>
          <button
            type="button"
            className={`chip chip--fail${isFail ? ' is-on' : ''}`}
            aria-pressed={isFail}
            onClick={() => onSetStatus(isFail ? 'not-run' : 'fail')}
          >
            Fail
          </button>
          <button
            type="button"
            className={`chip chip--blocked${isBlocked ? ' is-on' : ''}`}
            aria-pressed={isBlocked}
            onClick={() => onSetStatus(isBlocked ? 'not-run' : 'blocked')}
          >
            Blocked
          </button>
          {!isPass && !isFail && !isBlocked && <span className="chip chip--hint">not run</span>}
        </div>

        {needsNotes && (
          <label className="notes">
            <span className="notes__prompt">{STATUS_NOTE[step.status]}</span>
            <textarea
              rows={2}
              value={step.notes ?? ''}
              onChange={(event) => onNotes(event.target.value)}
              placeholder="Jot it down while it's fresh…"
            />
          </label>
        )}
      </div>
    </li>
  )
}
