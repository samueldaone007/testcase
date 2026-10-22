import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type Checklist,
  type ItemStatus,
  type Project,
  type Store,
  type TestStep,
  createId,
  loadStore,
  saveStore,
  statsOf,
} from '../types'
import * as ops from './operations'

export interface TickmarkApi {
  projects: Project[]
  project: Project | null
  checklist: Checklist | null
  stats: ReturnType<typeof statsOf>

  selectProject: (id: string | null) => void
  selectChecklist: (id: string | null) => void

  addProject: (name: string) => string
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'brief' | 'tester'>>) => void
  removeProject: (id: string) => void

  addChecklist: (projectId: string, name: string) => string
  removeChecklist: (checklistId: string) => void

  addStep: (checklistId: string, step: Partial<TestStep> & { title: string }) => void
  addSteps: (
    checklistId: string,
    steps: Array<Omit<TestStep, 'kind' | 'id' | 'status'> & { status?: ItemStatus }>,
  ) => number
  updateStep: (checklistId: string, stepId: string, patch: Partial<TestStep>) => void
  removeRow: (checklistId: string, rowId: string) => void
  addSection: (checklistId: string, title: string) => void
  moveRow: (checklistId: string, from: number, to: number) => void
  resetRun: (checklistId: string) => void
  setAllStatus: (checklistId: string, status: ItemStatus) => void
}

export function useTickmark(): TickmarkApi {
  const [store, setStore] = useState<Store>(() => loadStore())
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null)

  useEffect(() => {
    saveStore(store)
  }, [store])

  // Selection is derived, with fallbacks: pick what was asked for, else the
  // first thing available. Deleting a project or checklist just falls back.
  const project = useMemo(() => {
    const wanted = store.projects.find((p) => p.id === selectedProjectId)
    return wanted ?? store.projects[0] ?? null
  }, [store, selectedProjectId])

  const checklist = useMemo(() => {
    if (!project) return null
    const wanted = project.checklists.find((c) => c.id === selectedChecklistId)
    return wanted ?? project.checklists[0] ?? null
  }, [project, selectedChecklistId])

  const stats = useMemo(() => statsOf(checklist?.rows ?? []), [checklist])

  const addProject = useCallback((name: string) => {
    const projectId = createId()
    setStore((prev) => ops.addProjectTo(prev, name, projectId))
    setSelectedProjectId(projectId)
    setSelectedChecklistId(null)
    return projectId
  }, [])

  const updateProject = useCallback<TickmarkApi['updateProject']>(
    (id, patch) => setStore((prev) => ops.mapProject(prev, id, (p) => ({ ...p, ...patch }))),
    [],
  )

  const removeProject = useCallback((id: string) => {
    setStore((prev) => ops.removeProjectFrom(prev, id))
    setSelectedProjectId((cur) => (cur === id ? null : cur))
  }, [])

  const addChecklist = useCallback((projectId: string, name: string) => {
    const checklistId = createId()
    setStore((prev) => ops.addChecklistTo(prev, projectId, name, checklistId))
    setSelectedChecklistId(checklistId)
    return checklistId
  }, [])

  const removeChecklist = useCallback((checklistId: string) => {
    setStore((prev) => ops.removeChecklistFrom(prev, checklistId))
    setSelectedChecklistId((cur) => (cur === checklistId ? null : cur))
  }, [])

  const addStep = useCallback<TickmarkApi['addStep']>((checklistId, step) => {
    setStore((prev) => ops.addStepTo(prev, checklistId, step))
  }, [])

  const addSteps = useCallback<TickmarkApi['addSteps']>((checklistId, steps) => {
    let added = 0
    setStore((prev) => {
      const result = ops.addStepsTo(prev, checklistId, steps)
      added = result.added
      return result.store
    })
    return added
  }, [])

  const updateStep = useCallback<TickmarkApi['updateStep']>(
    (checklistId, stepId, patch) =>
      setStore((prev) => ops.updateStepIn(prev, checklistId, stepId, patch)),
    [],
  )

  const removeRow = useCallback<TickmarkApi['removeRow']>(
    (checklistId, rowId) => setStore((prev) => ops.removeRowFrom(prev, checklistId, rowId)),
    [],
  )

  const addSection = useCallback<TickmarkApi['addSection']>(
    (checklistId, title) => setStore((prev) => ops.addSectionTo(prev, checklistId, title)),
    [],
  )

  const moveRow = useCallback<TickmarkApi['moveRow']>(
    (checklistId, from, to) => setStore((prev) => ops.moveRowIn(prev, checklistId, from, to)),
    [],
  )

  const resetRun = useCallback<TickmarkApi['resetRun']>(
    (checklistId) => setStore((prev) => ops.resetRunIn(prev, checklistId)),
    [],
  )

  const setAllStatus = useCallback<TickmarkApi['setAllStatus']>(
    (checklistId, status) => setStore((prev) => ops.setAllStatusIn(prev, checklistId, status)),
    [],
  )

  return {
    projects: store.projects,
    project,
    checklist,
    stats,
    selectProject: setSelectedProjectId,
    selectChecklist: setSelectedChecklistId,
    addProject,
    updateProject,
    removeProject,
    addChecklist,
    removeChecklist,
    addStep,
    addSteps,
    updateStep,
    removeRow,
    addSection,
    moveRow,
    resetRun,
    setAllStatus,
  }
}
