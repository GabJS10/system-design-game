import { PIECES } from './components'
import type { EstimateVerdict } from './estimate'
import { scenariosFor, type Mission, type Variant } from './mission'
import { designCost, simulate } from './simulate'
import type { Design, Scenario } from './types'
import { validateDesign } from './validate'

export type StarResult = {
  performance: boolean
  reliability: boolean
  cost: boolean
  earned: number
  failedRules: string[]
  failingScenarioIds: string[]
  failingDownIds: string[]
}

export function scoreDesign(
  mission: Mission,
  variant: Variant,
  design: Design,
  decisions: Record<string, string>,
): StarResult {
  if (validateDesign(design).length > 0) {
    return {
      performance: false,
      reliability: false,
      cost: false,
      earned: 0,
      failedRules: [],
      failingScenarioIds: [],
      failingDownIds: [],
    }
  }

  const meetsTargets = (scenario: Scenario) => {
    const { p99Ms, errorRate } = simulate(design, scenario)
    return p99Ms <= mission.latencyTargetMs && errorRate <= mission.maxErrorRate
  }

  const scenarios = scenariosFor(variant)
  const peak = scenarios.find((s) => s.id === 'pico') as Scenario
  const failingScenarioIds = scenarios.filter((s) => !meetsTargets(s)).map((s) => s.id)
  const failingDownIds = design.nodes
    .filter((n) => !PIECES[n.kind].managed && !meetsTargets({ ...peak, down: n.id }))
    .map((n) => n.id)
  const failedRules = mission.rules.filter((r) => !r.check(design, decisions)).map((r) => r.id)

  const performance = failingScenarioIds.length === 0
  const reliability = failingDownIds.length === 0 && failedRules.length === 0
  const cost = designCost(design) <= variant.budget
  return {
    performance,
    reliability,
    cost,
    earned: [performance, reliability, cost].filter(Boolean).length,
    failedRules,
    failingScenarioIds,
    failingDownIds,
  }
}

export type DifferenceCategory = 'requisito' | 'estimacion' | 'pieza' | 'valido'
export type Difference = { id: string; category: DifferenceCategory; title: string; detail: string; noteUrl?: string }
export type AttemptFacts = {
  askedQuestionIds: string[]
  scopeChoices: Record<string, boolean>
  estimates: Record<'readRps' | 'writeRps' | 'storageGbPerMonth', EstimateVerdict>
}

const ESTIMATE_LABELS: Record<keyof AttemptFacts['estimates'], string> = {
  readRps: 'lecturas por segundo',
  writeRps: 'escrituras por segundo',
  storageGbPerMonth: 'almacenamiento nuevo al mes (GB)',
}

/** Clasifica las diferencias por funciones, reglas, decisiones y hechos del intento; nunca compara nodos ni aristas. */
export function compareDesign(
  mission: Mission,
  variant: Variant,
  design: Design,
  decisions: Record<string, string>,
  facts: AttemptFacts,
): Difference[] {
  const diffs: Difference[] = []

  for (const item of mission.scope) {
    if (facts.scopeChoices[item.id] === item.inScope) continue
    diffs.push({
      id: `alcance:${item.id}`,
      category: 'requisito',
      title: item.label,
      detail: item.inScope ? 'Estaba dentro del alcance y no lo marcaste.' : 'Estaba fuera del alcance y lo marcaste.',
    })
  }
  for (const q of mission.questions) {
    if (!q.useful || facts.askedQuestionIds.includes(q.id)) continue
    diffs.push({
      id: `pregunta:${q.id}`,
      category: 'requisito',
      title: q.text,
      detail: 'Era una pregunta útil que no hiciste y destapa un requisito.',
    })
  }

  for (const field of Object.keys(ESTIMATE_LABELS) as (keyof typeof ESTIMATE_LABELS)[]) {
    const verdict = facts.estimates[field]
    if (verdict === 'bien') continue
    diffs.push({
      id: `estimacion:${field}`,
      category: 'estimacion',
      title: `Estimación de ${ESTIMATE_LABELS[field]}`,
      detail: `Tu estimación quedó ${verdict}; el valor de esta variante es ${variant[field]}.`,
    })
  }

  for (const role of mission.roles) {
    const covering = design.nodes.filter((n) => role.acceptedKinds.includes(n.kind))
    if (covering.length === 0) {
      diffs.push({
        id: `rol:${role.id}`,
        category: 'pieza',
        title: role.label,
        detail: 'Ninguna pieza de tu diseño cubre esta función.',
        noteUrl: role.noteUrl,
      })
    } else if (!covering.some((n) => role.referenceKinds.includes(n.kind))) {
      diffs.push({
        id: `rol:${role.id}`,
        category: 'valido',
        title: role.label,
        detail: 'Cubriste la función con otra pieza distinta de la de la referencia, y también es válida.',
        noteUrl: role.noteUrl,
      })
    }
  }

  for (const decision of mission.decisions) {
    if (decision.validOptionIds.includes(decisions[decision.id])) continue
    diffs.push({
      id: `decision:${decision.id}`,
      category: 'pieza',
      title: decision.prompt,
      detail: 'La opción elegida no funciona para este problema.',
      noteUrl: decision.noteUrl,
    })
  }

  for (const rule of mission.rules.filter((r) => !r.check(design, decisions))) {
    diffs.push({
      id: `regla:${rule.id}`,
      category: 'pieza',
      title: rule.label,
      detail: 'Tu diseño no cumple esta regla, y por eso pierdes fiabilidad.',
      noteUrl: rule.noteUrl,
    })
  }

  return diffs
}
