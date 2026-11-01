import { describe, expect, it } from 'vitest'
import {
  activeTimer,
  diagnose,
  isStuck,
  selectHint,
  starCap,
  type ActivityEvent,
  type HintSet,
  type HintUse,
} from './hints'
import type { StarResult } from './score'
import type { Design, SimResult } from './types'

const MIN = 60_000

describe('isStuck', () => {
  const calm = { activeMsSinceUsefulChange: 0, sameFailureRuns: 0, wrongAnswers: 0 }

  it('no avisa por debajo de cada umbral', () => {
    expect(isStuck(calm)).toBe(false)
    expect(isStuck({ ...calm, activeMsSinceUsefulChange: 3 * MIN - 1 })).toBe(false)
    expect(isStuck({ ...calm, sameFailureRuns: 2 })).toBe(false)
    expect(isStuck({ ...calm, wrongAnswers: 2 })).toBe(false)
  })

  it('avisa en el valor de cada umbral', () => {
    expect(isStuck({ ...calm, activeMsSinceUsefulChange: 3 * MIN })).toBe(true)
    expect(isStuck({ ...calm, sameFailureRuns: 3 })).toBe(true)
    expect(isStuck({ ...calm, wrongAnswers: 3 })).toBe(true)
  })
})

describe('activeTimer', () => {
  const at = (type: ActivityEvent['type'], t: number): ActivityEvent => ({ type, at: t })

  it('suma desde el último cambio', () => {
    expect(activeTimer([at('change', 0), at('change', 50_000)], 80_000)).toBe(30_000)
  })

  it('una pestaña oculta durante 10 minutos no suma ese tiempo', () => {
    const events = [at('change', 0), at('hidden', MIN), at('visible', 11 * MIN)]
    expect(activeTimer(events, 12 * MIN)).toBe(2 * MIN)
  })

  it('no suma mientras sigue oculta', () => {
    expect(activeTimer([at('change', 0), at('hidden', MIN)], 30 * MIN)).toBe(MIN)
  })

  it('ignora el tiempo anterior al último cambio', () => {
    const events = [at('change', 0), at('hidden', MIN), at('visible', 5 * MIN), at('change', 6 * MIN)]
    expect(activeTimer(events, 7 * MIN)).toBe(MIN)
  })

  it('sin eventos no hay tiempo activo', () => {
    expect(activeTimer([], 5 * MIN)).toBe(0)
  })
})

describe('selectHint', () => {
  const set = (key: string): HintSet => ({ key, texts: ['a', 'b', 'c'] })
  const hints = [set('simulacion:*:*'), set('simulacion:*:sql'), set('simulacion:viral:*'), set('simulacion:viral:sql')]

  it('prefiere la clave exacta', () => {
    expect(selectHint(hints, 'simulacion:viral:sql')?.key).toBe('simulacion:viral:sql')
  })

  it('cae a comodines de más a menos específico', () => {
    expect(selectHint(hints, 'simulacion:viral:web')?.key).toBe('simulacion:viral:*')
    expect(selectHint(hints, 'simulacion:pico:sql')?.key).toBe('simulacion:*:sql')
    expect(selectHint(hints, 'simulacion:pico:web')?.key).toBe('simulacion:*:*')
  })

  it('no mezcla fases y devuelve null si nada encaja', () => {
    expect(selectHint(hints, 'informe:*:*')).toBeNull()
    expect(selectHint([], 'simulacion:*:*')).toBeNull()
  })
})

describe('starCap', () => {
  const use = (level: HintUse['level']): HintUse => ({ key: 'k', level })

  it('sin pistas o con nivel 1 no limita', () => {
    expect(starCap([])).toBe(3)
    expect(starCap([use(1), use(1)])).toBe(3)
  })

  it('el nivel 2 limita a 2 y el 3 a 1', () => {
    expect(starCap([use(2)])).toBe(2)
    expect(starCap([use(3)])).toBe(1)
  })

  it('gana el peor, sea cual sea el orden', () => {
    expect(starCap([use(3), use(2), use(1)])).toBe(1)
    expect(starCap([use(1), use(2), use(3)])).toBe(1)
  })
})

describe('diagnose', () => {
  const design: Design = {
    nodes: [
      { id: 'client', kind: 'client', instances: 1 },
      { id: 'web', kind: 'web', instances: 1 },
      { id: 'db', kind: 'sql', instances: 1 },
    ],
    edges: [
      { from: 'client', to: 'web' },
      { from: 'web', to: 'db' },
    ],
  }
  const stars = (overrides: Partial<StarResult> = {}): StarResult => ({
    performance: true,
    reliability: true,
    cost: true,
    earned: 3,
    failedRules: [],
    failingScenarioIds: [],
    failingDownIds: [],
    ...overrides,
  })
  const result = (scenarioId: string, bottleneckId: string, readRps: number, writeRps: number): SimResult => ({
    scenarioId,
    nodes: { [bottleneckId]: { readRps, writeRps, utilization: 2, saturated: true, latencyMs: 1 } },
    p99Ms: 1,
    meanMs: 1,
    errorRate: 0,
    monthlyCost: 0,
    bottleneckId,
  })

  it('un diseño sin fallos no produce pista', () => {
    expect(diagnose(design, stars(), [])).toBe('ok:*:*')
  })

  it('la pieza que satura define el tipo y el escenario el primero que falla', () => {
    const failing = stars({ performance: false, earned: 2, failingScenarioIds: ['pico', 'viral'] })
    const results = [result('pico', 'db', 100, 5), result('viral', 'web', 900, 5)]
    expect(diagnose(design, failing, results)).toBe('simulacion:pico:sql')
  })

  it('distingue la saturación por escrituras', () => {
    const failing = stars({ performance: false, failingScenarioIds: ['pico'] })
    expect(diagnose(design, failing, [result('pico', 'db', 5, 100)])).toBe('simulacion:pico:sql-escrituras')
  })

  it('una regla incumplida pesa más que el rendimiento', () => {
    const failing = stars({ performance: false, reliability: false, failedRules: ['caducidad'], failingScenarioIds: ['pico'] })
    expect(diagnose(design, failing, [result('pico', 'db', 100, 5)])).toBe('simulacion:*:caducidad')
  })

  it('la caída de un punto único usa el tipo de la pieza', () => {
    expect(diagnose(design, stars({ reliability: false, failingDownIds: ['db'] }), [])).toBe('simulacion:caida:sql')
  })

  it('el coste excedido tiene su clave', () => {
    expect(diagnose(design, stars({ cost: false }), [])).toBe('simulacion:*:coste')
  })

  it('un diseño inválido no se confunde con coste excedido', () => {
    expect(diagnose(design, stars({ performance: false, reliability: false, cost: false, earned: 0 }), [])).toBe(
      'simulacion:*:*',
    )
  })
})
