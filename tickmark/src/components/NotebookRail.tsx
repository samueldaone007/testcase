import { useState } from 'react'
import { type Checklist, type Project } from '../types'
import './NotebookRail.css'

interface Props {
  projects: Project[]
  project: Project | null
  checklist: Checklist | null
  onSelectProject: (id: string) => void
  onSelectChecklist: (id: string) => void
  onCreateProject: (name: string) => void
  onCreateChecklist: (projectId: string, name: string) => void
  onRemoveProject: (id: string) => void
  onRemoveChecklist: (id: string) => void
}

export default function NotebookRail({
  projects,
  project,
  checklist,
  onSelectProject,
  onSelectChecklist,
  onCreateProject,
  onCreateChecklist,
  onRemoveProject,
  onRemoveChecklist,
}: Props) {
  const [draft, setDraft] = useState<'project' | 'checklist' | null>(null)
  const [name, setName] = useState('')

  const submit = () => {
    const value = name.trim()
    if (value) {
      if (draft === 'project') onCreateProject(value)
      else if (draft === 'checklist' && project) onCreateChecklist(project.id, value)
    }
    setDraft(null)
    setName('')
  }

  const runCount = (check: Checklist) => check.rows.filter((row) => row.kind === 'step').length

  return (
    <nav className="rail" aria-label="Notebook">
      <div className="rail__head">
        <h2 className="rail__title">Notebook</h2>
        <button
          type="button"
          className="rail__new"
          onClick={() => setDraft(draft === 'project' ? null : 'project')}
          aria-expanded={draft === 'project'}
        >
          + project
        </button>
      </div>

      {draft === 'project' && (
        <div className="rail__draft">
          <input
            autoFocus
            value={name}
            placeholder="Project name, e.g. Shop 2.4"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
              if (event.key === 'Escape') setDraft(null)
            }}
          />
          <div className="rail__draft-actions">
            <button type="button" className="stamp-btn solid" onClick={submit}>
              Create
            </button>
            <button type="button" className="stamp-btn ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="rail__projects">
        {projects.length === 0 && (
          <li className="rail__empty">No projects yet — start one above.</li>
        )}
        {projects.map((entry) => {
          const active = entry.id === project?.id
          const steps = entry.checklists.reduce((sum, check) => sum + runCount(check), 0)
          return (
            <li key={entry.id} className={`rail__project${active ? ' is-active' : ''}`}>
              <button type="button" className="rail__project-btn" onClick={() => onSelectProject(entry.id)}>
                <span className="rail__project-name">{entry.name}</span>
                <span className="rail__project-meta">
                  {entry.checklists.length} {entry.checklists.length === 1 ? 'list' : 'lists'} · {steps} steps
                </span>
              </button>
              {active && (
                <button
                  type="button"
                  className="rail__delete"
                  aria-label={`Delete project ${entry.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${entry.name}" and all of its checklists?`)) onRemoveProject(entry.id)
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {project && (
        <div className="rail__block">
          <div className="rail__head rail__head--sub">
            <h3 className="rail__subtitle">Checklists</h3>
            <button
              type="button"
              className="rail__new"
              onClick={() => setDraft(draft === 'checklist' ? null : 'checklist')}
              aria-expanded={draft === 'checklist'}
            >
              + new
            </button>
          </div>

          {draft === 'checklist' && (
            <div className="rail__draft">
              <input
                autoFocus
                value={name}
                placeholder="e.g. Release 2.4 smoke"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit()
                  if (event.key === 'Escape') setDraft(null)
                }}
              />
              <div className="rail__draft-actions">
                <button type="button" className="stamp-btn solid" onClick={submit}>
                  Create
                </button>
                <button type="button" className="stamp-btn ghost" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ul className="rail__lists">
            {project.checklists.length === 0 && (
              <li className="rail__empty">No checklists yet.</li>
            )}
            {project.checklists.map((check) => {
              const active = check.id === checklist?.id
              const total = runCount(check)
              const done = check.rows.filter((row) => row.kind === 'step' && row.status !== 'not-run').length
              return (
                <li key={check.id} className={`rail__list${active ? ' is-active' : ''}`}>
                  <button type="button" className="rail__list-btn" onClick={() => onSelectChecklist(check.id)}>
                    <span className="rail__list-name">{check.name}</span>
                    <span className="rail__list-meter" aria-hidden="true">
                      <span
                        className="rail__list-meter-fill"
                        style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }}
                      />
                    </span>
                    <span className="rail__list-meta">
                      {done}/{total}
                    </span>
                  </button>
                  {active && (
                    <button
                      type="button"
                      className="rail__delete"
                      aria-label={`Delete checklist ${check.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete "${check.name}"?`)) onRemoveChecklist(check.id)
                      }}
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </nav>
  )
}
