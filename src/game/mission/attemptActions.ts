import { judgeEstimate, parseEstimate } from '../../engine/estimate'
import type { HintUse } from '../../engine/hints'
import type { Mission, Variant } from '../../engine/mission'
import { pickVariant, type Attempt, type Phase, type Save } from '../../save'

export type EstimateKey = 'readRps' | 'writeRps' | 'storageGbPerMonth'
export const ESTIMATE_KEYS: EstimateKey[] = ['readRps', 'writeRps', 'storageGbPerMonth']
/** Cifras tal como las escribió el jugador; AttemptProgress solo guarda veredictos. */
export type EstimateDraft = Record<EstimateKey, string>

export const draftKey = (missionId: string) => `mision:${missionId}:estimacion`
const emptyDraft = (): EstimateDraft => ({ readRps: '', writeRps: '', storageGbPerMonth: '' })

export function startAttempt(save: Save, mission: Mission, now: Date): Save {
  if (save.current) return save
  const current: Attempt = {
    missionId: mission.id, variantId: pickVariant(save, mission).id, phase: 'informe', startedAt: now.toISOString(),
    facts: { askedQuestionIds: [], scopeChoices: {}, estimates: {} },
    design: { nodes: [{ id: 'client', kind: 'client', instances: 1 }], edges: [] },
    designRevision: 0, simulatedRevision: null,
    decisions: {}, justifications: {}, hints: [], disputedDifferenceIds: [],
  }
  return clearDraft({ ...save, current }, mission.id)
}

/** Los intentos terminados no se tocan. */
export function abandonAttempt(save: Save): Save {
  return save.current ? clearDraft({ ...save, current: null }, save.current.missionId) : save
}

export const askQuestion = (a: Attempt, questionId: string): Attempt =>
  a.facts.askedQuestionIds.includes(questionId) ? a
    : { ...a, facts: { ...a.facts, askedQuestionIds: [...a.facts.askedQuestionIds, questionId] } }

/** Registra todos los elementos del alcance, marcados o no. */
export function setScopeChoice(a: Attempt, mission: Mission, itemId: string, marked: boolean): Attempt {
  const scopeChoices = Object.fromEntries(mission.scope.map((s) => [s.id, a.facts.scopeChoices[s.id] ?? false]))
  return { ...a, facts: { ...a.facts, scopeChoices: { ...scopeChoices, [itemId]: marked } } }
}

export const setPhase = (a: Attempt, phase: Phase): Attempt => ({ ...a, phase })

export function submitEstimates(a: Attempt, variant: Variant, draft: EstimateDraft):
  { ok: true; attempt: Attempt } | { ok: false; invalid: EstimateKey[] } {
  const values = ESTIMATE_KEYS.map((k) => [k, parseEstimate(draft[k])] as const)
  const invalid = values.filter(([, v]) => v === null).map(([k]) => k)
  if (invalid.length > 0) return { ok: false, invalid }
  const estimates = Object.fromEntries(values.map(([k, v]) => [k, judgeEstimate(v!, variant[k])]))
  return { ok: true, attempt: { ...a, facts: { ...a.facts, estimates } } }
}

export const recordHint = (a: Attempt, use: HintUse): Attempt =>
  a.hints.some((h) => h.key === use.key && h.level === use.level) ? a : { ...a, hints: [...a.hints, use] }

export function readDraft(save: Save, missionId: string): EstimateDraft {
  const raw = save.lessonState[draftKey(missionId)]
  const draft = emptyDraft()
  if (typeof raw === 'object' && raw !== null) {
    for (const k of ESTIMATE_KEYS) {
      const v = (raw as Record<string, unknown>)[k]
      if (typeof v === 'string') draft[k] = v
    }
  }
  return draft
}

export const writeDraft = (save: Save, missionId: string, draft: EstimateDraft): Save =>
  ({ ...save, lessonState: { ...save.lessonState, [draftKey(missionId)]: draft } })

function clearDraft(save: Save, missionId: string): Save {
  const { [draftKey(missionId)]: _, ...lessonState } = save.lessonState
  return { ...save, lessonState }
}
