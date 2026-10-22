import { useEffect, useRef, useState } from 'react'
import { type Project, type Checklist, type TestStep } from '../types'
import { type Suggestion, STARTER_BRIEFS } from '../lib/assistant'
import { respondSmart, isLlmConfigured, type AssistantStatus, type LlmSettings } from '../lib/llm'
import PencilMascot from './PencilMascot'
import './AssistantPanel.css'

interface Entry {
  id: string
  who: 'tester' | 'pencil'
  text: string
  suggestions?: Suggestion[]
  followUp?: string
  quickReplies?: string[]
  /** keys already dropped onto the checklist from this entry */
  accepted: string[]
  /** where the reply came from */
  source?: 'local' | 'model'
  /** set when a live model was tried but the local engine answered instead */
  error?: string
}

interface Props {
  project: Project
  checklist: Checklist
  settings: LlmSettings
  status: AssistantStatus
  onAddSteps: (steps: Array<Omit<TestStep, 'kind' | 'id' | 'status'>>) => number
  onOpenSettings: () => void
}

let entrySeq = 0
const nextId = () => `e${++entrySeq}`

export default function AssistantPanel({
  project,
  checklist,
  settings,
  status,
  onAddSteps,
  onOpenSettings,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>(() => [
    {
      id: nextId(),
      who: 'pencil',
      text: project.brief
        ? `Right — ${project.name}. I've read your brief and I can see "${checklist.name}" in front of me. What are we pulling apart first?`
        : `Pencil ready. Tell me what the thing is in plain words — "a booking site with login, search and payments" is plenty to start with.`,
      accepted: [],
      quickReplies: project.brief ? undefined : STARTER_BRIEFS,
    },
  ])
  const [memory, setMemory] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [writing, setWriting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [entries, writing])

  const configured = isLlmConfigured(settings, status)

  const existingTitles = checklist.rows
    .filter((row) => row.kind === 'step')
    .map((row) => row.title)

  const send = (raw: string) => {
    const input = raw.trim()
    if (!input || writing) return
    setDraft('')

    // snapshot the conversation before this turn so the model has context
    const history = entries.slice(-6).map((entry) => ({ who: entry.who, text: entry.text }))

    setEntries((prev) => [...prev, { id: nextId(), who: 'tester', text: input, accepted: [] }])
    setWriting(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 30000)

    respondSmart(
      {
        input,
        projectName: project.name,
        brief: project.brief,
        checklistName: checklist.name,
        existingTitles,
        memory,
        history,
      },
      settings,
      status,
      controller.signal,
    )
      .then((reply) => {
        setMemory(reply.memory)
        setEntries((prev) => [
          ...prev,
          {
            id: nextId(),
            who: 'pencil',
            text: reply.reply,
            suggestions: reply.suggestions,
            followUp: reply.followUp,
            quickReplies: reply.quickReplies,
            accepted: [],
            source: reply.source,
            error: reply.error,
          },
        ])
      })
      .catch(() => {
        /* aborted on unmount or by a newer turn — nothing to render */
      })
      .finally(() => {
        window.clearTimeout(timeout)
        if (abortRef.current === controller) abortRef.current = null
        setWriting(false)
      })
  }

  const markAccepted = (entryId: string, keys: string[]) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, accepted: [...new Set([...entry.accepted, ...keys])] }
          : entry,
      ),
    )
  }

  const acceptOne = (entry: Entry, suggestion: Suggestion) => {
    onAddSteps([
      {
        title: suggestion.title,
        details: suggestion.details,
        expected: suggestion.expected,
        section: suggestion.section,
      } as Omit<TestStep, 'kind' | 'id' | 'status'>,
    ])
    markAccepted(entry.id, [suggestion.key])
  }

  const acceptAll = (entry: Entry) => {
    const pending = (entry.suggestions ?? []).filter((s) => !entry.accepted.includes(s.key))
    if (pending.length === 0) return
    onAddSteps(
      pending.map(
        (s) =>
          ({
            title: s.title,
            details: s.details,
            expected: s.expected,
            section: s.section,
          }) as Omit<TestStep, 'kind' | 'id' | 'status'>,
      ),
    )
    markAccepted(entry.id, pending.map((s) => s.key))
  }

  const pendingCount = (entry: Entry) =>
    (entry.suggestions ?? []).filter((s) => !entry.accepted.includes(s.key)).length

  return (
    <aside className="assistant" aria-label="Margin notes assistant">
      <header className="assistant__head">
        <PencilMascot mood={writing ? 'writing' : 'idle'} />
        <div className="assistant__titles">
          <p className="kicker">Margin notes</p>
          <h2 className="assistant__title">Pencil</h2>
          <p className="assistant__blurb">Suggests steps. Never touches your checklist without a say.</p>
        </div>
        <button
          type="button"
          className="assistant__gear"
          onClick={onOpenSettings}
          aria-label="Assistant settings"
          title="Pencil's brain — assistant settings"
        >
          ⚙
        </button>
      </header>

      <div className={`assistant__mode${configured ? ' is-live' : ''}`}>
        {configured ? (
          <>
            <span className="assistant__mode-dot" aria-hidden="true" />
            live model{status.model ? ` · ${status.model}` : ''}
          </>
        ) : (
          <>offline notes — pricked from Pencil's own notebook</>
        )}
      </div>

      <div className="assistant__scroll" ref={scrollRef}>
        {entries.map((entry) => (
          <article key={entry.id} className={`note note--${entry.who}`}>
            {entry.who === 'tester' ? (
              <>
                <span className="note__tag">you</span>
                <p className="note__hand note__hand--tester">{entry.text}</p>
              </>
            ) : (
              <>
                <span className="note__tag note__tag--pencil">
                  ✎ pencil{entry.source === 'model' ? ' · live' : ''}
                </span>
                <p className="note__hand">{entry.text}</p>

                {entry.error && (
                  <p className="note__fallback">
                    ↯ couldn't reach the model — using my own notes instead. {entry.error}
                  </p>
                )}

                {entry.suggestions && entry.suggestions.length > 0 && (
                  <div className="cards">
                    {entry.suggestions.map((suggestion) => {
                      const done = entry.accepted.includes(suggestion.key)
                      return (
                        <div key={suggestion.key} className={`slip${done ? ' is-in' : ''}`}>
                          <div className="slip__top">
                            <span className="slip__section">{suggestion.section ?? 'Steps'}</span>
                            {done && <span className="slip__done">on the list</span>}
                          </div>
                          <p className="slip__title">{suggestion.title}</p>
                          {suggestion.details && <p className="slip__detail">{suggestion.details}</p>}
                          {suggestion.expected && (
                            <p className="slip__expect">
                              <span className="kicker">expect</span> {suggestion.expected}
                            </p>
                          )}
                          <button
                            type="button"
                            className="slip__add stamp-btn"
                            disabled={done}
                            onClick={() => acceptOne(entry, suggestion)}
                          >
                            {done ? '✓ Added' : 'Add to checklist'}
                          </button>
                        </div>
                      )
                    })}
                    <div className="cards__foot">
                      <button
                        type="button"
                        className="stamp-btn solid cards__add-all"
                        onClick={() => acceptAll(entry)}
                        disabled={pendingCount(entry) === 0}
                      >
                        {pendingCount(entry) === 0
                          ? '✓ All added'
                          : `Add all ${pendingCount(entry)} remaining`}
                      </button>
                      <span className="cards__note">nothing lands until you press it</span>
                    </div>
                  </div>
                )}

                {entry.followUp && <p className="note__follow">↳ {entry.followUp}</p>}

                {entry.quickReplies && entry.quickReplies.length > 0 && (
                  <div className="quick">
                    {entry.quickReplies.map((reply) => (
                      <button key={reply} type="button" className="quick__chip" onClick={() => send(reply)}>
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </article>
        ))}

        {writing && (
          <article className="note note--pencil note--writing" aria-live="polite">
            <span className="note__tag note__tag--pencil">✎ pencil</span>
            <p className="note__hand note__hand--idle">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </p>
          </article>
        )}
      </div>

      <form
        className="composer-box"
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        <label className="composer-box__label kicker" htmlFor="assistant-input">
          Tell the pencil
        </label>
        <div className="composer-box__row">
          <textarea
            id="assistant-input"
            className="composer-box__input"
            rows={2}
            value={draft}
            placeholder="it's a booking site with login, search and payments…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send(draft)
              }
            }}
          />
          <button type="submit" className="stamp-btn solid composer-box__send" disabled={!draft.trim() || writing}>
            Note it
          </button>
        </div>
      </form>
    </aside>
  )
}
