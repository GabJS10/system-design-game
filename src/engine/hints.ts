import type { StarResult } from './score'
import type { Design, SimResult } from './types'

export type HintLevel = 1 | 2 | 3
export type FailureKey = string // `${fase}:${escenario|'*'}:${tipoDePieza|regla|'*'}`
export type HintSet = { key: FailureKey; texts: [string, string, string]; lessonId?: string }
export type StuckSignals = { activeMsSinceUsefulChange: number; sameFailureRuns: number; wrongAnswers: number }
export type HintUse = { key: FailureKey; level: HintLevel }
export type ActivityEvent = { type: 'visible' | 'hidden' | 'change'; at: number }

const STUCK_MS = 180_000
const STUCK_COUNT = 3

/** Milisegundos con la pestaña visible desde el último 'change'. Los eventos van en orden cronológico. */
export function activeTimer(events: ActivityEvent[], now: number): number {
  if (events.length === 0) return 0
  const lastChange = events.findLastIndex((e) => e.type === 'change')
  const start = Math.max(lastChange, 0)
  let visibleSince: number | null = events[start].at
  let total = 0
  for (const { type, at } of events.slice(start + 1)) {
    if (type === 'hidden' && visibleSince !== null) {
      total += at - visibleSince
      visibleSince = null
    } else if (type !== 'hidden' && visibleSince === null) {
      visibleSince = at
    }
  }
  return visibleSince === null ? total : total + now - visibleSince
}

export function isStuck(s: StuckSignals): boolean {
  return s.activeMsSinceUsefulChange >= STUCK_MS || s.sameFailureRuns >= STUCK_COUNT || s.wrongAnswers >= STUCK_COUNT
}

/** Una regla incumplida manda sobre el rendimiento, el rendimiento sobre la caída y esta sobre el coste. */
export function diagnose(design: Design, stars: StarResult, results: SimResult[]): FailureKey {
  const [rule] = stars.failedRules
  if (rule) return `simulacion:*:${rule}`

  const [scenarioId] = stars.failingScenarioIds
  if (scenarioId) {
    const result = results.find((r) => r.scenarioId === scenarioId)
    const kind = design.nodes.find((n) => n.id === result?.bottleneckId)?.kind
    const metrics = result?.bottleneckId ? result.nodes[result.bottleneckId] : undefined
    if (!kind || !metrics) return `simulacion:${scenarioId}:*`
    return `simulacion:${scenarioId}:${kind}${metrics.writeRps > metrics.readRps ? '-escrituras' : ''}`
  }

  const down = design.nodes.find((n) => stars.failingDownIds.includes(n.id))
  if (down) return `simulacion:caida:${down.kind}`
  // Sin causa concreta (por ejemplo un diseño inválido), no se acusa al coste.
  if (!stars.performance || !stars.reliability) return 'simulacion:*:*'
  return stars.cost ? 'ok:*:*' : 'simulacion:*:coste'
}

/** Clave exacta primero y luego comodines, del más al menos específico. */
export function selectHint(hints: HintSet[], key: FailureKey): HintSet | null {
  const [phase, scenario, type] = key.split(':')
  const candidates = [key, `${phase}:${scenario}:*`, `${phase}:*:${type}`, `${phase}:*:*`]
  for (const candidate of candidates) {
    const found = hints.find((h) => h.key === candidate)
    if (found) return found
  }
  return null
}

export function starCap(uses: HintUse[]): 3 | 2 | 1 {
  const worst = Math.max(1, ...uses.map((u) => u.level))
  return worst === 3 ? 1 : worst === 2 ? 2 : 3
}
