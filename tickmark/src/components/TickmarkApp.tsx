import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTickmark } from '../store/useTickmark'
import {
  fetchAssistantStatus,
  isLlmConfigured,
  loadLlmSettings,
  OFFLINE_STATUS,
  saveLlmSettings,
  type AssistantStatus,
  type LlmSettings,
} from '../lib/llm'
import NotebookRail from './NotebookRail'
import ChecklistView from './ChecklistView'
import AssistantPanel from './AssistantPanel'
import ExportSheet from './ExportSheet'
import SettingsSheet from './SettingsSheet'
import './TickmarkApp.css'

type MobileTab = 'notebook' | 'checklist' | 'pencil'

export default function TickmarkApp() {
  const store = useTickmark()
  const [showExport, setShowExport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<LlmSettings>(() => loadLlmSettings())
  const [status, setStatus] = useState<AssistantStatus>(OFFLINE_STATUS)
  const [tab, setTab] = useState<MobileTab>('checklist')

  const hasProject = Boolean(store.project)

  // Ask the server once whether it is offering a model.
  const refreshStatus = useCallback(() => {
    const controller = new AbortController()
    fetchAssistantStatus(controller.signal).then(setStatus)
    return () => controller.abort()
  }, [])

  useEffect(() => refreshStatus(), [refreshStatus])

  // On a phone only one pane shows at a time, so picking a checklist should
  // bring it forward instead of leaving the user staring at the notebook list.
  const revealChecklistOnPhone = () => {
    if (window.innerWidth <= 860) setTab('checklist')
  }

  // Esc closes whichever sheet is open.
  useEffect(() => {
    if (!showExport && !showSettings) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExport(false)
        setShowSettings(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showExport, showSettings])

  const checklistPane = useMemo(() => {
    if (!store.checklist) {
      return (
        <section className="welcome">
          <p className="welcome__kicker kicker">Tickmark</p>
          <h2 className="welcome__title">
            {hasProject ? 'This notebook has no pages yet' : 'Open a notebook'}
          </h2>
          <p className="welcome__line">
            {hasProject
              ? 'Make your first checklist — "Login flow", "Checkout", "Release 2.4 smoke test".'
              : 'Create a project in the Notebook, then describe it to Pencil in the margin.'}
          </p>
          <ul className="welcome__steps">
            <li>
              <span className="welcome__n">1</span> Write a step, or take one from Pencil
            </li>
            <li>
              <span className="welcome__n">2</span> Tick it off as you go — pass, fail, blocked
            </li>
            <li>
              <span className="welcome__n">3</span> Export the results when you're done
            </li>
          </ul>
        </section>
      )
    }
    return (
      <ChecklistView
        checklist={store.checklist}
        stats={store.stats}
        onTogglePass={(step) =>
          store.updateStep(store.checklist!.id, step.id, {
            status: step.status === 'pass' ? 'not-run' : 'pass',
            notes: step.status === 'pass' ? undefined : step.notes,
          })
        }
        onSetStatus={(step, status) =>
          store.updateStep(store.checklist!.id, step.id, {
            status,
            notes: status === 'not-run' ? undefined : step.notes,
          })
        }
        onNotes={(step, notes) => store.updateStep(store.checklist!.id, step.id, { notes })}
        onPatch={(step, patch) => store.updateStep(store.checklist!.id, step.id, patch)}
        onDelete={(row) => store.removeRow(store.checklist!.id, row.id)}
        onAddStep={(title) => store.addStep(store.checklist!.id, { title })}
        onAddSection={(title) => store.addSection(store.checklist!.id, title)}
        onMove={(from, to) => store.moveRow(store.checklist!.id, from, to)}
        onResetRun={() => store.resetRun(store.checklist!.id)}
        onOpenExport={() => setShowExport(true)}
      />
    )
  }, [store, hasProject])

  const assistantPane =
    store.project && store.checklist ? (
      <AssistantPanel
        key={store.checklist.id}
        project={store.project}
        checklist={store.checklist}
        settings={settings}
        status={status}
        onAddSteps={(steps) => store.addSteps(store.checklist!.id, steps)}
        onOpenSettings={() => setShowSettings(true)}
      />
    ) : (
      <div className="pane-empty">
        <p className="pane-empty__title">Pencil is waiting.</p>
        <p className="pane-empty__line">Pick a project and a checklist, then tell it what you're testing.</p>
      </div>
    )

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__brand">
          <span className="masthead__mark" aria-hidden="true">
            ✎
          </span>
          <div>
            <h1 className="masthead__title">Tickmark</h1>
            <p className="masthead__sub">
              manual testing, one scribbled page at a time
            </p>
          </div>
        </div>

        <div className="masthead__where">
          <span className="kicker">Working on</span>
          <strong>{store.project?.name ?? 'no project'}</strong>
          {store.checklist && (
            <span className="masthead__slash">/</span>
          )}
          {store.checklist && <em>{store.checklist.name}</em>}
        </div>

        <button
          type="button"
          className="masthead__gear"
          onClick={() => setShowSettings(true)}
          aria-label="Assistant settings"
          title="Pencil's brain — assistant settings"
        >
          <span aria-hidden="true">⚙</span>
          <span className={`masthead__ai${isLlmConfigured(settings, status) ? ' is-on' : ''}`}>
            {isLlmConfigured(settings, status) ? 'AI on' : 'AI off'}
          </span>
        </button>
      </header>

      <main className="layout">
        <div className={`layout__rail pane${tab === 'notebook' ? ' is-shown' : ''}`}>
          <NotebookRail
            projects={store.projects}
            project={store.project}
            checklist={store.checklist}
            onSelectProject={(id) => {
              store.selectProject(id)
              revealChecklistOnPhone()
            }}
            onSelectChecklist={(id) => {
              store.selectChecklist(id)
              revealChecklistOnPhone()
            }}
            onCreateProject={(name) => store.addProject(name)}
            onCreateChecklist={(projectId, name) => {
              store.addChecklist(projectId, name)
              revealChecklistOnPhone()
            }}
            onRemoveProject={(id) => store.removeProject(id)}
            onRemoveChecklist={(id) => store.removeChecklist(id)}
          />
        </div>

        <div className={`layout__main pane${tab === 'checklist' ? ' is-shown' : ''}`}>{checklistPane}</div>

        <div className={`layout__assistant pane${tab === 'pencil' ? ' is-shown' : ''}`}>{assistantPane}</div>
      </main>

      <nav className="tabbar" aria-label="Sections">
        <button
          type="button"
          className={`tabbar__btn${tab === 'notebook' ? ' is-on' : ''}`}
          onClick={() => setTab('notebook')}
          aria-current={tab === 'notebook'}
        >
          <span className="tabbar__icon" aria-hidden="true">
            ☰
          </span>
          Notebook
        </button>
        <button
          type="button"
          className={`tabbar__btn${tab === 'checklist' ? ' is-on' : ''}`}
          onClick={() => setTab('checklist')}
          aria-current={tab === 'checklist'}
        >
          <span className="tabbar__icon" aria-hidden="true">
            ☑
          </span>
          Checklist
          {store.stats.total > 0 && (
            <span className="tabbar__badge">
              {store.stats.run}/{store.stats.total}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`tabbar__btn${tab === 'pencil' ? ' is-on' : ''}`}
          onClick={() => setTab('pencil')}
          aria-current={tab === 'pencil'}
        >
          <span className="tabbar__icon" aria-hidden="true">
            ✎
          </span>
          Pencil
        </button>
      </nav>

      {showExport && store.checklist && (
        <ExportSheet
          project={store.project}
          checklist={store.checklist}
          stats={store.stats}
          defaultTester={store.project?.tester ?? ''}
          onRememberTester={(name) => store.project && store.updateProject(store.project.id, { tester: name })}
          onClose={() => setShowExport(false)}
        />
      )}

      {showSettings && (
        <SettingsSheet
          settings={settings}
          status={status}
          onSave={(next) => {
            setSettings(next)
            saveLlmSettings(next)
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
          onRefreshStatus={refreshStatus}
        />
      )}
    </div>
  )
}
