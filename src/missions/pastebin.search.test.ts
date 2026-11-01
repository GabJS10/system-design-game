import { describe, expect, it } from 'vitest'
import { runOrder, type Variant } from '../engine/mission'
import { scoreDesign } from '../engine/score'
import { designCost, simulate } from '../engine/simulate'
import type { Design, DesignNode, PieceKind, Scenario } from '../engine/types'
import { validateDesign } from '../engine/validate'
import { pastebin } from './pastebin'
import { VALID_DECISIONS } from './pastebin.fixtures'

// Sin DNS: solo suma coste y latencia, así que no puede rescatar ni abaratar ningún diseño.
type Choice = {
  cdn: boolean
  lb: boolean
  server: 'web' | 'api' | 'web+api'
  instances: number
  cache: 'no' | 'paralelo' | 'cadena'
  metadata: 'sql' | 'sql×2' | 'sql+replica' | 'sql+replica-lecturas' | 'nosql×2' | 'nosql×3'
  content: 'objectStore' | 'nosql×2'
  logs: 'directo' | 'cola' | 'archivos'
  cleaner: 'worker' | 'batch'
}

const OPTIONS: { [K in keyof Choice]: Choice[K][] } = {
  cdn: [false, true],
  lb: [false, true],
  server: ['web', 'api', 'web+api'],
  instances: [1, 2, 3, 4, 6],
  cache: ['no', 'paralelo', 'cadena'],
  metadata: ['sql', 'sql×2', 'sql+replica', 'sql+replica-lecturas', 'nosql×2', 'nosql×3'],
  content: ['objectStore', 'nosql×2'],
  logs: ['directo', 'cola', 'archivos'],
  cleaner: ['worker', 'batch'],
}

function* choices(): Generator<Choice> {
  const keys = Object.keys(OPTIONS) as (keyof Choice)[]
  const walk = function* (i: number, partial: Partial<Choice>): Generator<Choice> {
    if (i === keys.length) return void (yield partial as Choice)
    for (const value of OPTIONS[keys[i]]) yield* walk(i + 1, { ...partial, [keys[i]]: value })
  }
  yield* walk(0, {})
}

/** Cablea siempre igual: entrada → servidores → (caché) → datos, y lo que trabaja después a un lado. */
function build(c: Choice): Design {
  const nodes: DesignNode[] = [{ id: 'client', kind: 'client', instances: 1 }]
  const edges: Design['edges'] = []
  const add = (id: string, kind: PieceKind, instances = 1) => nodes.push({ id, kind, instances })
  const link = (from: string, to: string) => edges.push({ from, to })

  let tail = 'client'
  const chain = (id: string, kind: PieceKind, instances = 1) => {
    add(id, kind, instances)
    link(tail, id)
    tail = id
  }
  if (c.cdn) chain('cdn', 'cdn')
  if (c.lb) chain('lb', 'lb')
  if (c.server !== 'api') chain('web', 'web', c.instances)
  if (c.server !== 'web') chain('api', 'api', c.instances)
  const server = tail
  if (c.cache === 'paralelo') {
    add('cache', 'cache')
    link(server, 'cache')
  }
  if (c.cache === 'cadena') chain('cache', 'cache')

  const metadata = c.metadata.startsWith('nosql') ? 'nosql' : 'sql'
  if (metadata === 'nosql') add('nosql', 'nosql', Number(c.metadata.at(-1)))
  else add('sql', 'sql', c.metadata === 'sql×2' ? 2 : 1)
  link(tail, metadata)
  if (c.metadata === 'sql+replica' || c.metadata === 'sql+replica-lecturas') {
    add('replica', 'replica')
    link('sql', 'replica')
    if (c.metadata === 'sql+replica-lecturas') link(tail, 'replica')
  }

  const content = c.content === 'objectStore' ? 'objectStore' : 'contenido'
  if (c.content === 'objectStore') add(content, 'objectStore')
  else add(content, 'nosql', 2)
  link(tail, content)

  add('batch', 'batch')
  if (c.logs === 'directo') link(server, 'batch')
  if (c.logs === 'archivos') link(content, 'batch')
  if (c.logs === 'cola') {
    add('queue', 'queue')
    link(server, 'queue')
    link('queue', 'batch')
  }
  if (c.cleaner === 'worker') add('worker', 'worker')
  link(c.cleaner, metadata)
  return { nodes, edges }
}

const describeDesign = (c: Choice) => JSON.stringify(c)

type Found = { choice: Choice; cost: number; absorbs: boolean }

const CANDIDATES = [...choices()].map((choice) => {
  const design = build(choice)
  return { choice, design, cost: designCost(design) }
})

const filterOrder = ({ id, down }: Scenario) => (id === 'viral' ? 0 : down ? 1 : 2)

// Poda por velocidad: sin presupuesto, o con un escenario fallido, no hay tres estrellas posibles.
function threeStars(variant: Variant): Found[] {
  const survives = (design: Design) =>
    runOrder(variant, design)
      .sort((a, b) => filterOrder(a) - filterOrder(b))
      .every((scenario) => {
        const { p99Ms, errorRate } = simulate(design, scenario)
        return p99Ms <= pastebin.latencyTargetMs && errorRate <= pastebin.maxErrorRate
      })
  return CANDIDATES.filter(({ design, cost }) => cost <= variant.budget && validateDesign(design).length === 0 && survives(design))
    .filter(({ design }) => scoreDesign(pastebin, variant, design, VALID_DECISIONS).earned === 3)
    .map(({ choice, cost }) => ({ choice, cost, absorbs: choice.cdn || choice.cache !== 'no' }))
}

const SEARCH = pastebin.variants.map((variant) => ({ variant, found: threeStars(variant) }))

describe('búsqueda sobre diseños bien cableados', () => {
  it('el catálogo de la búsqueda contiene la referencia de cada variante', () => {
    for (const { variant, found } of SEARCH) {
      expect(found.some((f) => f.cost === designCost(variant.reference)), variant.id).toBe(true)
    }
  })

  it.each(SEARCH.map((s) => [s.variant.id, s] as const))('en %s nadie gana sin caché ni CDN', (_, { found }) => {
    expect(found.filter((f) => !f.absorbs).map((f) => describeDesign(f.choice))).toEqual([])
  })

  it.each(SEARCH.map((s) => [s.variant.id, s] as const))('en %s solo un lote que además limpia baja de la referencia', (_, { variant, found }) => {
    const cheaper = found.filter((f) => f.cost < designCost(variant.reference))
    // Alternativa válida: un mismo proceso por lotes hace estadísticas y limpieza, y ahorra el worker.
    expect(cheaper.filter((f) => f.choice.cleaner !== 'batch').map((f) => describeDesign(f.choice))).toEqual([])
  })

  it('admite varias formas de ganar: no hay una solución única', () => {
    for (const { variant, found } of SEARCH) expect(found.length, variant.id).toBeGreaterThan(10)
  })

  it('ningún diseño memorizado consigue 3 estrellas en las tres variantes', () => {
    const [first, ...rest] = SEARCH.map(({ found }) => new Set(found.map((f) => describeDesign(f.choice))))
    expect([...first].filter((d) => rest.every((set) => set.has(d)))).toEqual([])
  })
})
