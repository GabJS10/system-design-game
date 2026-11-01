import { PIECES } from './components'
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
