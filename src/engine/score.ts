import type { EstimateVerdict } from './estimate'
import { PIECES } from './components'
import { runOrder, scenariosFor, type Mission, type Role, type Variant } from './mission'
import { designCost, simulate } from './simulate'
import type { Design, DesignNode, PieceKind, Scenario } from './types'
import { DATA, requestReach, validateDesign } from './validate'

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
  stage: 'diseno' | 'final' = 'final',
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

  const failing = runOrder(variant, design).filter((s) => !meetsTargets(s))
  const failingScenarioIds = failing.filter((s) => !s.down).map((s) => s.id)
  const failingDownIds = failing.flatMap((s) => s.down ?? [])
  const failedRules = mission.rules
    .filter((r) => stage === 'final' || r.phase === 'diseno')
    .filter((r) => !r.check(design, decisions))
    .map((r) => r.id)

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

// Datos y trabajo de fondo cumplen su función con estar conectados; el resto debe cambiar el tráfico.
const PASSIVE: PieceKind[] = [...DATA, 'worker', 'batch', 'warehouse']

/** Una pieza de una sola copia que, al faltar, cambia la carga de las demás o los errores. */
function changesTraffic(design: Design, node: DesignNode, scenario: Scenario): boolean {
  const single = { ...design, nodes: design.nodes.map((n) => (n === node ? { ...n, instances: 1 } : n)) }
  const before = simulate(single, scenario)
  const after = simulate(single, { ...scenario, down: node.id })
  return (
    before.errorRate !== after.errorRate ||
    Object.entries(before.nodes).some(
      ([id, m]) => id !== node.id && (m.readRps !== after.nodes[id].readRps || m.writeRps !== after.nodes[id].writeRps),
    )
  )
}

function coveringNodes(role: Role, variant: Variant, design: Design): DesignNode[] {
  if (validateDesign(design).length > 0) return []
  const live = requestReach(design)
  const [medio] = scenariosFor(variant)
  return design.nodes.filter(
    (n) =>
      role.acceptedKinds.includes(n.kind) &&
      (live.has(n.id) || design.edges.some((e) => (e.from === n.id && live.has(e.to)) || (e.to === n.id && live.has(e.from)))) &&
      (role.covers ? role.covers(design, n) : true) &&
      (PASSIVE.includes(n.kind) || changesTraffic(design, n, medio)),
  )
}

/** Clasifica las diferencias por funciones, reglas, decisiones y hechos del intento; nunca compara nodos ni aristas. */
export function compareDesign(
  mission: Mission,
  variant: Variant,
  design: Design,
  decisions: Record<string, string>,
  facts: AttemptFacts,
  stars: StarResult,
): Difference[] {
  const diffs: Difference[] = []

  for (const item of mission.scope) {
    if (Boolean(facts.scopeChoices[item.id]) === item.inScope) continue
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
    if (!verdict || verdict === 'bien') continue
    diffs.push({
      id: `estimacion:${field}`,
      category: 'estimacion',
      title: `Estimación de ${ESTIMATE_LABELS[field]}`,
      detail: `Tu estimación quedó ${verdict}; el valor de esta variante es ${variant[field]}.`,
    })
  }

  for (const role of mission.roles) {
    const covering = coveringNodes(role, variant, design)
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

  // Las reglas de decisión ya salen arriba, una diferencia por decisión.
  for (const rule of mission.rules.filter((r) => r.phase === 'diseno' && !r.check(design, decisions))) {
    diffs.push({
      id: `regla:${rule.id}`,
      category: 'pieza',
      title: rule.label,
      detail: 'Tu diseño no cumple esta regla, y por eso pierdes fiabilidad.',
      noteUrl: rule.noteUrl,
    })
  }

  for (const id of stars.failingScenarioIds) {
    diffs.push({
      id: `escenario:${id}`,
      category: 'pieza',
      title: scenariosFor(variant).find((s) => s.id === id)?.name ?? id,
      detail: 'Tu diseño no cumple los objetivos de latencia y errores en este escenario.',
      noteUrl: mission.failureNoteUrl,
    })
  }

  const downKinds = design.nodes.filter((n) => stars.failingDownIds.includes(n.id)).map((n) => n.kind)
  for (const kind of new Set(downKinds)) {
    diffs.push({
      id: `caida:${kind}`,
      category: 'pieza',
      title: `Caída de ${PIECES[kind].label}`,
      detail: 'El servicio no sobrevive a la caída de esta pieza.',
      noteUrl: mission.failureNoteUrl,
    })
  }

  return diffs
}
