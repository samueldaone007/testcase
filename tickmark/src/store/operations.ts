/**
 * Pure store transforms. Keeping these free of React makes the fiddly rules
 * (dedupe, notes cleanup on reset, reordering) easy to reason about and test.
 */
import {
  type Checklist,
  type ItemStatus,
  type Project,
  type Row,
  type Store,
  type TestStep,
  createId,
  isStep,
} from '../types'

export function mapChecklist(store: Store, checklistId: string, fn: (c: Checklist) => Checklist): Store {
  let touched = false
  const projects = store.projects.map((project) => {
    if (!project.checklists.some((c) => c.id === checklistId)) return project
    touched = true
    return {
      ...project,
      checklists: project.checklists.map((c) => (c.id === checklistId ? fn(c) : c)),
    }
  })
  return touched ? { projects } : store
}

export function mapProject(store: Store, projectId: string, fn: (p: Project) => Project): Store {
  return { projects: store.projects.map((p) => (p.id === projectId ? fn(p) : p)) }
}

export function addProjectTo(store: Store, name: string, id = createId()): Store {
  const project: Project = {
    id,
    name: name.trim() || 'Untitled project',
    checklists: [],
    createdAt: new Date().toISOString(),
  }
  return { projects: [...store.projects, project] }
}

export function removeProjectFrom(store: Store, projectId: string): Store {
  return { projects: store.projects.filter((p) => p.id !== projectId) }
}

export function addChecklistTo(store: Store, projectId: string, name: string, id = createId()): Store {
  const checklist: Checklist = {
    id,
    name: name.trim() || 'Untitled checklist',
    rows: [],
    createdAt: new Date().toISOString(),
  }
  return mapProject(store, projectId, (p) => ({ ...p, checklists: [...p.checklists, checklist] }))
}

export function removeChecklistFrom(store: Store, checklistId: string): Store {
  return {
    projects: store.projects.map((p) => ({
      ...p,
      checklists: p.checklists.filter((c) => c.id !== checklistId),
    })),
  }
}

export function addStepTo(
  store: Store,
  checklistId: string,
  step: Partial<TestStep> & { title: string },
): Store {
  return mapChecklist(store, checklistId, (c) => ({
    ...c,
    rows: [
      ...c.rows,
      {
        kind: 'step',
        id: step.id ?? createId(),
        title: step.title,
        details: step.details,
        expected: step.expected,
        status: step.status ?? 'not-run',
        notes: step.notes,
        fromChat: step.fromChat,
      } satisfies TestStep,
    ],
  }))
}

/**
 * Add many steps at once, skipping any title already present (the assistant
 * may not know about steps the tester typed by hand while cards were open).
 * Returns the new store plus how many actually landed.
 */
export function addStepsTo(
  store: Store,
  checklistId: string,
  steps: Array<Omit<TestStep, 'kind' | 'id' | 'status'> & { status?: ItemStatus }>,
): { store: Store; added: number } {
  let added = 0
  const next = mapChecklist(store, checklistId, (c) => {
    const seen = new Set(c.rows.filter(isStep).map((row) => row.title.trim().toLowerCase()))
    const fresh: TestStep[] = []
    for (const step of steps) {
      const key = step.title.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      fresh.push({
        kind: 'step',
        id: createId(),
        title: step.title,
        details: step.details,
        expected: step.expected,
        status: step.status ?? 'not-run',
        notes: step.notes,
        fromChat: true,
      })
    }
    added = fresh.length
    if (fresh.length === 0) return c
    return { ...c, rows: [...c.rows, ...fresh] }
  })
  return { store: next, added }
}

export function updateStepIn(
  store: Store,
  checklistId: string,
  stepId: string,
  patch: Partial<TestStep>,
): Store {
  return mapChecklist(store, checklistId, (c) => ({
    ...c,
    rows: c.rows.map((row) => (row.id === stepId && isStep(row) ? { ...row, ...patch } : row)),
  }))
}

export function removeRowFrom(store: Store, checklistId: string, rowId: string): Store {
  return mapChecklist(store, checklistId, (c) => ({
    ...c,
    rows: c.rows.filter((row) => row.id !== rowId),
  }))
}

export function addSectionTo(store: Store, checklistId: string, title: string): Store {
  return mapChecklist(store, checklistId, (c) => ({
    ...c,
    rows: [...c.rows, { kind: 'section', id: createId(), title }],
  }))
}

export function moveRowIn(store: Store, checklistId: string, from: number, to: number): Store {
  return mapChecklist(store, checklistId, (c) => {
    if (from === to || from < 0 || to < 0 || from >= c.rows.length || to >= c.rows.length) return c
    const rows = [...c.rows]
    const [moved] = rows.splice(from, 1)
    rows.splice(to, 0, moved)
    return { ...c, rows }
  })
}

/** Everything back to "Not run". Notes belong to a run, so they go too. */
export function resetRunIn(store: Store, checklistId: string): Store {
  return mapChecklist(store, checklistId, (c) => ({
    ...c,
    rows: c.rows.map((row): Row => (isStep(row) ? { ...row, status: 'not-run', notes: undefined } : row)),
  }))
}

export function setAllStatusIn(store: Store, checklistId: string, status: ItemStatus): Store {
  const keepNotes = status === 'fail' || status === 'blocked'
  return mapChecklist(store, checklistId, (c) => ({
    ...c,
    rows: c.rows.map((row): Row =>
      isStep(row) ? { ...row, status, notes: keepNotes ? row.notes : undefined } : row,
    ),
  }))
}
