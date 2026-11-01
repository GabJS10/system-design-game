import { describe, expect, it } from 'vitest'
import { PIECES } from './components'
import { answerFor, scenariosFor, type Mission, type Variant } from './mission'
import { scoreDesign } from './score'
import { designCost } from './simulate'
import type { Design, DesignNode, PieceKind } from './types'

const node = (id: string, kind: PieceKind = id as PieceKind, instances = 1): DesignNode => ({ id, kind, instances })

const edges = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [from, to] = pair.split('>')
    return { from, to }
  })

const redundant: Design = {
  nodes: [node('client'), node('lb'), node('api', 'api', 2), node('sql'), node('replica')],
  edges: edges('client>lb', 'lb>api', 'api>sql', 'sql>replica'),
}

const fragile: Design = {
  nodes: [node('client'), node('api'), node('sql'), node('objectStore')],
  edges: edges('client>api', 'api>sql', 'api>objectStore'),
}

const variant = (overrides: Partial<Variant> = {}): Variant => ({
  id: 'v',
  monthlyWrites: 0,
  monthlyReads: 0,
  writeRps: 1,
  readRps: 1,
  storageGbPerMonth: 1,
  budget: Number.POSITIVE_INFINITY,
  reference: redundant,
  ...overrides,
})

const mission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'm',
  title: 'Prueba',
  questions: [],
  scope: [],
  roles: [],
  rules: [],
  decisions: [],
  variants: [],
  latencyTargetMs: 200,
  maxErrorRate: 0.001,
  relatedLessons: [],
  growthNote: '',
  hints: [],
  ...overrides,
})

describe('scenariosFor', () => {
  it('genera medio, pico por 3 y viral con lecturas por 25', () => {
    expect(scenariosFor(variant({ readRps: 40, writeRps: 4 }))).toEqual([
      expect.objectContaining({ id: 'medio', readRps: 40, writeRps: 4, hotKeyShare: 0, meanWriteRps: 4 }),
      expect.objectContaining({ id: 'pico', readRps: 120, writeRps: 12, hotKeyShare: 0, meanWriteRps: 4 }),
      expect.objectContaining({ id: 'viral', readRps: 1000, writeRps: 4, hotKeyShare: 0.9, meanWriteRps: 4 }),
    ])
  })
})

describe('scoreDesign', () => {
  it('da las 3 estrellas a un diseño que lo cumple todo', () => {
    expect(scoreDesign(mission(), variant(), redundant, {})).toEqual({
      performance: true,
      reliability: true,
      cost: true,
      earned: 3,
      failedRules: [],
      failingScenarioIds: [],
      failingDownIds: [],
    })
  })

  it('pierde rendimiento solo en el escenario que no cumple', () => {
    const result = scoreDesign(mission(), variant({ readRps: PIECES.sql.capacityRps / 10 }), redundant, {})
    expect(result.performance).toBe(false)
    expect(result.failingScenarioIds).toEqual(['viral'])
  })

  it('pierde rendimiento por latencia aunque no haya errores', () => {
    const result = scoreDesign(mission({ latencyTargetMs: 1 }), variant(), redundant, {})
    expect(result.performance).toBe(false)
    expect(result.failingScenarioIds).toEqual(['medio', 'pico', 'viral'])
  })

  it('pierde rendimiento por errores aunque la latencia sirva', () => {
    const readRps = PIECES.sql.capacityRps * 2
    const result = scoreDesign(mission({ latencyTargetMs: 100_000 }), variant({ readRps }), redundant, {})
    expect(result.failingScenarioIds).toContain('medio')
  })

  it('el presupuesto es un límite inclusivo', () => {
    const budget = designCost(redundant)
    expect(scoreDesign(mission(), variant({ budget }), redundant, {}).cost).toBe(true)
    expect(scoreDesign(mission(), variant({ budget: budget - 1 }), redundant, {}).cost).toBe(false)
  })

  it('prueba la caída de cada pieza propia, no de client ni de las gestionadas', () => {
    const result = scoreDesign(mission(), variant(), fragile, {})
    expect(result.reliability).toBe(false)
    expect(result.performance).toBe(true)
    expect(result.failingDownIds).toEqual(['api', 'sql'])
    expect(result.earned).toBe(2)
  })

  it('las reglas reciben las decisiones y su fallo quita la fiabilidad', () => {
    const rule = (id: string, ok: boolean) => ({
      id,
      label: id,
      noteUrl: '',
      check: (_: Design, decisions: Record<string, string>) => (decisions.a === 'si') === ok,
    })
    const result = scoreDesign(mission({ rules: [rule('r1', true), rule('r2', false)] }), variant(), redundant, { a: 'si' })
    expect(result.failedRules).toEqual(['r2'])
    expect(result.failingDownIds).toEqual([])
    expect(result.reliability).toBe(false)
  })

  it('un diseño inválido no gana estrellas ni lanza', () => {
    const invalid: Design = { nodes: [node('api')], edges: [] }
    expect(scoreDesign(mission(), variant(), invalid, {})).toEqual({
      performance: false,
      reliability: false,
      cost: false,
      earned: 0,
      failedRules: [],
      failingScenarioIds: [],
      failingDownIds: [],
    })
  })
})

describe('answerFor', () => {
  it('rellena la respuesta con los números de la variante', () => {
    const question = { id: 'q', text: '', useful: true, answer: '{escrituras} y {lecturas}: {proporcion} a 1.' }
    const numbers = { monthlyWrites: 100e6, monthlyReads: 1000e6 }
    expect(answerFor(question, variant(numbers))).toBe('100 millones y 1000 millones: 10 a 1.')
  })
})
