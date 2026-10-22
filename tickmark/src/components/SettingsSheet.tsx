import { useEffect, useRef, useState } from 'react'
import { isLlmConfigured, pingLlm, type AssistantStatus, type LlmSettings } from '../lib/llm'
import './SettingsSheet.css'

interface Props {
  settings: LlmSettings
  status: AssistantStatus
  onSave: (settings: LlmSettings) => void
  onClose: () => void
  onRefreshStatus: () => void
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

export default function SettingsSheet({ settings, status, onSave, onClose, onRefreshStatus }: Props) {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [test, setTest] = useState<TestState>('idle')
  const [testMsg, setTestMsg] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const runTest = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 20000)
    setTest('testing')
    setTestMsg('')
    try {
      await pingLlm(controller.signal)
      setTest('ok')
      setTestMsg('Pencil reached the model. Good to go.')
      onRefreshStatus()
    } catch (err) {
      setTest('fail')
      setTestMsg(err instanceof Error ? err.message : 'No answer from the model.')
    } finally {
      clearTimeout(timeout)
    }
  }

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Assistant settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section className="sheet settings">
        <header className="sheet__head">
          <div>
            <p className="kicker">Assistant</p>
            <h2 className="sheet__title">Pencil's brain</h2>
          </div>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <p className="settings__lead">
          Tickmark suggests steps on its own, with no model and no network. When the server
          has a model configured, Pencil can borrow it for richer ideas — and still never
          touches the checklist without your say-so.
        </p>

        <label className={`settings__toggle${enabled ? ' is-on' : ''}`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.target.checked)
              setTest('idle')
              setTestMsg('')
            }}
          />
          <span className="settings__toggle-box" aria-hidden="true" />
          <span className="settings__toggle-text">
            <strong>Use the assistant's model</strong>
            <span>Switch this off to keep everything on this device.</span>
          </span>
        </label>

        <div className="settings__server">
          <span className="kicker">Server</span>
          {status.available ? (
            <p className="settings__server-line">
              <span className="settings__dot is-on" aria-hidden="true" />
              A model is available{status.model ? <> — <code>{status.model}</code></> : null}
              {enabled ? '.' : ', but you have it switched off.'}
            </p>
          ) : (
            <p className="settings__server-line">
              <span className="settings__dot" aria-hidden="true" />
              No model is configured on this server. Pencil will use its offline notes.
            </p>
          )}

          <div className="settings__test">
            <button
              type="button"
              className="stamp-btn"
              disabled={!isLlmConfigured({ enabled: true }, status) || test === 'testing'}
              onClick={runTest}
            >
              {test === 'testing' ? 'Knocking…' : 'Test connection'}
            </button>
            <button type="button" className="stamp-btn ghost" onClick={onRefreshStatus}>
              Refresh
            </button>
            {testMsg && (
              <span className={`settings__test-msg is-${test}`} role="status">
                {testMsg}
              </span>
            )}
          </div>
        </div>

        <p className="settings__warn">
          The model's API key lives on the server, never in this browser. Tickmark calls its
          own <code>/api/assistant</code> endpoint and the server adds the key. Set{' '}
          <code>TICKMARK_LLM_API_KEY</code> (and optionally{' '}
          <code>TICKMARK_LLM_BASE_URL</code>, <code>TICKMARK_LLM_MODEL</code>) in the server's
          environment to turn this on.
        </p>

        <footer className="sheet__foot">
          <span className="settings__privacy">Offline notes are always available.</span>
          <div className="sheet__buttons">
            <button type="button" className="stamp-btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="stamp-btn solid" onClick={() => onSave({ enabled })}>
              Save
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
