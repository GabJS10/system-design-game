import { describe, expect, it } from 'vitest'
import { scenariosFor } from '../engine/mission'
import { scoreDesign } from '../engine/score'
import { simulate } from '../engine/simulate'
import type { Design, DesignNode } from '../engine/types'
import { MISSIONS } from './index'
import { pastebin } from './pastebin'
import {
  oversized,
  removeNode,
  SINGLE_MACHINE,
  VALID_DECISIONS,
  withNosql,
  withoutPopularReads,
  withVisitCounter,
} from './pastebin.fixtures'

const scenario = (variant: (typeof pastebin.variants)[number], id: string) => {
  const found = scenariosFor(variant).find((s) => s.id === id)
  if (!found) throw new Error(`Falta el escenario ${id}`)
  return found
}

const NOTE_URLS = [
  'https://app.notion.com/p/402b43c51c9381559d63d940e507850b',
  'https://app.notion.com/p/3fab43c51c938127b062d55184fdb76f',
]

describe.each(pastebin.variants)('calibración de la variante $id', (variant) => {
  const score = (design: Design, decisions = VALID_DECISIONS) => scoreDesign(pastebin, variant, design, decisions)
  const { reference } = variant

  it('la referencia consigue 3 estrellas', () => {
    expect(score(reference)).toMatchObject({ earned: 3, failedRules: [], failingDownIds: [], failingScenarioIds: [] })
  })

  it('la referencia no satura ninguna pieza, ni siquiera en segundo plano', () => {
    for (const s of scenariosFor(variant)) {
      expect(Object.values(simulate(reference, s).nodes).filter((n) => n.saturated)).toEqual([])
    }
  })

  it('NoSQL de 3 instancias en lugar de SQL y réplica es igual de válido', () => {
    expect(score(withNosql(reference))).toMatchObject({ earned: 3, failedRules: [] })
  })

  it.each(reference.nodes.filter((n) => n.kind !== 'client').map((n) => n.id))(
    'eliminar %s pierde al menos una estrella',
    (id) => {
      expect(score(removeNode(reference, id)).earned).toBeLessThan(3)
    },
  )

  it('una sola máquina pierde fiabilidad porque no sobrevive a sus caídas', () => {
    const result = score(SINGLE_MACHINE)
    expect(result.reliability).toBe(false)
    expect(result.failedRules).toEqual([])
    expect(result.failingDownIds).toEqual(expect.arrayContaining(['web', 'sql']))
    for (const down of ['web', 'sql']) {
      expect(simulate(SINGLE_MACHINE, { ...scenario(variant, 'pico'), down }).errorRate).toBe(1)
    }
  })

  it('sin caché ni CDN el paste viral satura la base', () => {
    const design = withoutPopularReads(reference)
    const result = score(design)
    expect(result.performance).toBe(false)
    expect(result.failingScenarioIds).toContain('viral')
    expect(result.failingScenarioIds).not.toContain('medio')
    expect(simulate(design, scenario(variant, 'viral')).nodes.sql.saturated).toBe(true)
    expect(simulate(reference, scenario(variant, 'viral')).nodes.sql.saturated).toBe(false)
  })

  it('el sobredimensionado funciona, pero solo pierde coste', () => {
    expect(score(oversized(reference))).toMatchObject({ performance: true, reliability: true, cost: false, earned: 2 })
  })

  it('el contador de visitas falla estadísticas y añade escrituras reales', () => {
    const design = withVisitCounter(reference)
    const result = score(design)
    expect(result.failedRules).toEqual(['estadisticas'])
    expect(result.reliability).toBe(false)
    for (const s of scenariosFor(variant)) {
      const before = simulate(reference, s).nodes
      const after = simulate(design, s).nodes
      expect(before.sql.readRps).toBeGreaterThan(0)
      expect(after.sql.writeRps).toBeCloseTo(before.sql.writeRps + before.sql.readRps)
      expect(after.replica.writeRps).toBeGreaterThan(before.replica.writeRps)
    }
  })
})

describe('reglas de Pastebin', () => {
  const [{ reference }] = pastebin.variants
  const failed = (design: Design, decisions = VALID_DECISIONS) =>
    pastebin.rules.filter((r) => !r.check(design, decisions)).map((r) => r.id)

  const node = (id: string, kind: DesignNode['kind'], instances = 1): DesignNode => ({ id, kind, instances })
  const edges = (...pairs: string[]) =>
    pairs.map((pair) => {
      const [from, to] = pair.split('>')
      return { from, to }
    })
  const swapEdge = (design: Design, drop: string, add: string[]): Design => ({
    ...design,
    edges: [...design.edges.filter((e) => `${e.from}>${e.to}` !== drop), ...edges(...add)],
  })

  it('un solo NoSQL no separa metadatos y contenido', () => {
    expect(failed(removeNode(withNosql(reference), 'objectStore'))).toEqual(['separar'])
  })

  it('dos NoSQL del mismo grupo no separan: el simulador los trata como shards', () => {
    const design = removeNode(withNosql(reference), 'objectStore')
    const second = node('contenido', 'nosql', 3)
    expect(failed({ nodes: [...design.nodes, second], edges: [...design.edges, { from: 'web', to: 'contenido' }] })).toEqual(['separar'])
  })

  it('el contenido en NoSQL vale con los metadatos en SQL', () => {
    const contenido = node('contenido', 'nosql', 3)
    const design = removeNode(reference, 'objectStore')
    expect(failed({ nodes: [...design.nodes, contenido], edges: [...design.edges, { from: 'web', to: 'contenido' }] })).toEqual([])
  })

  it('un almacén enlazado solo desde otro almacén no cuenta', () => {
    const design = swapEdge(reference, 'web>sql', ['objectStore>sql'])
    expect(failed(design)).toContain('separar')
    expect(failed(design)).toContain('caducidad')
  })

  it('la cola no lleva las lecturas a los metadatos', () => {
    const design: Design = {
      nodes: [...reference.nodes, node('queue', 'queue')],
      edges: [...swapEdge(reference, 'web>sql', ['web>queue', 'queue>worker']).edges],
    }
    expect(failed(design)).toContain('separar')
  })

  it('una lectura debe llegar a metadatos y contenido, no solo el conjunto del tráfico', () => {
    const design: Design = {
      nodes: [node('client', 'client'), node('a', 'web'), node('b', 'web'), node('sql', 'sql'), node('objectStore', 'objectStore'), node('batch', 'batch'), node('worker', 'worker')],
      edges: edges('client>a', 'client>b', 'a>sql', 'b>objectStore', 'a>batch', 'worker>sql'),
    }
    expect(failed(design)).toEqual(['separar'])
  })

  it('las reglas no se cumplen con islas desconectadas', () => {
    const island: Design = {
      nodes: [node('client', 'client'), node('web', 'web'), node('sql', 'sql'), node('objectStore', 'objectStore'),
        node('web2', 'web'), node('batch', 'batch'), node('sql2', 'sql'), node('worker', 'worker')],
      edges: edges('client>web', 'web>sql', 'web>objectStore', 'web2>batch', 'worker>sql2'),
    }
    expect(failed(island)).toEqual(['estadisticas', 'caducidad'])
  })

  it('un almacén inalcanzable desde client no cuenta para separar', () => {
    const edges = reference.edges.filter((e) => e.to !== 'objectStore')
    expect(failed({ ...reference, edges: [...edges, { from: 'worker', to: 'objectStore' }] })).toEqual(['separar'])
  })

  it('enlaces exige contestar la generación', () => {
    expect(failed(reference, {})).toEqual(['enlaces', 'decisiones'])
  })

  it.each([
    ['generacion', 'base64'],
    ['longitud', '4'],
    ['contenido', 'tabla'],
  ])('una opción que no funciona en %s falla la regla de decisiones', (id, option) => {
    expect(failed(reference, { ...VALID_DECISIONS, [id]: option })).toEqual(['decisiones'])
    const stars = scoreDesign(pastebin, pastebin.variants[0], reference, { ...VALID_DECISIONS, [id]: option })
    expect(stars).toMatchObject({ reliability: false, earned: 2 })
  })

  it('las reglas que dependen de decisiones son de esa fase', () => {
    expect(pastebin.rules.filter((r) => r.phase === 'decisiones').map((r) => r.id)).toEqual(['enlaces', 'decisiones'])
  })

  it('estadisticas exige el lote detrás de los servidores', () => {
    const edges = reference.edges.map((e) => (e.to === 'batch' ? { from: 'sql', to: 'batch' } : e))
    expect(failed({ ...reference, edges })).toEqual(['estadisticas'])
  })

  it.each([
    ['con una cola', ['web>queue', 'queue>batch']],
    ['desde el almacén de objetos', ['objectStore>batch']],
  ])('estadisticas acepta los logs %s', (_, add) => {
    const queued = swapEdge(reference, 'web>batch', add)
    const design = { ...queued, nodes: [...queued.nodes, node('queue', 'queue')] }
    expect(failed(design)).toEqual([])
  })

  it('caducidad acepta un lote sobre los metadatos', () => {
    const design = removeNode(swapEdge(reference, 'worker>sql', ['batch>sql']), 'worker')
    expect(failed(design)).toEqual([])
  })

  it('varias instancias de API tras varios servidores web no pierden fiabilidad', () => {
    const design = swapEdge(reference, 'web>sql', ['web>api', 'api>sql'])
    const withApi = { ...design, nodes: [...design.nodes, node('api', 'api', 2)] }
    expect(failed(withApi)).toEqual([])
    expect(scoreDesign(pastebin, pastebin.variants[0], withApi, VALID_DECISIONS).failingDownIds).toEqual([])
  })

  const rename = (id: string) => (id === 'web' ? 'api' : id)
  const logsFromApi: Design = {
    nodes: reference.nodes.map((n) => (n.kind === 'web' ? { ...n, id: 'api', kind: 'api' } : n)),
    edges: reference.edges.map((e) => ({ from: rename(e.from), to: rename(e.to) })),
  }

  it('estadisticas acepta los logs desde api y no pierde fiabilidad', () => {
    expect(failed(logsFromApi)).toEqual([])
    expect(scoreDesign(pastebin, pastebin.variants[0], logsFromApi, VALID_DECISIONS).reliability).toBe(true)
  })

  it('estadisticas sigue rechazando el contador con los logs desde api', () => {
    expect(failed(withVisitCounter(logsFromApi))).toEqual(['estadisticas'])
  })

  it('caducidad exige el worker conectado a los metadatos', () => {
    const edges = reference.edges.map((e) => (e.from === 'worker' ? { from: 'worker', to: 'objectStore' } : e))
    expect(failed({ ...reference, edges })).toEqual(['caducidad'])
  })

  it('el reparto es comportamiento, no una regla', () => {
    expect(pastebin.rules.map((r) => r.id)).not.toContain('balanceo')
    expect(failed(removeNode(reference, 'lb'))).toEqual([])
    const stars = scoreDesign(pastebin, pastebin.variants[0], removeNode(reference, 'lb'), VALID_DECISIONS)
    expect(stars.failingDownIds).toEqual(['web'])
  })

  it('una sola instancia de web no necesita lb para las reglas', () => {
    expect(failed(SINGLE_MACHINE)).toEqual([])
  })
})

describe('decisiones durante el diseño', () => {
  const [variant] = pastebin.variants
  it('sin decisiones, la referencia conserva sus 3 estrellas provisionales', () => {
    expect(scoreDesign(pastebin, variant, variant.reference, {}, 'diseno')).toMatchObject({ earned: 3, failedRules: [] })
  })

  it('al final, sin decisiones, pierde fiabilidad', () => {
    expect(scoreDesign(pastebin, variant, variant.reference, {}).reliability).toBe(false)
  })
})

describe('contenido de Pastebin', () => {
  it('está en el catálogo de misiones', () => {
    expect(MISSIONS).toContain(pastebin)
  })

  it('tiene los objetivos acordados', () => {
    expect(pastebin).toMatchObject({ latencyTargetMs: 200, maxErrorRate: 0.001 })
  })

  it('tiene las tres variantes con sus números', () => {
    expect(pastebin.variants).toEqual([
      expect.objectContaining({ id: 'base', monthlyWrites: 10e6, monthlyReads: 100e6, writeRps: 4, readRps: 40, storageGbPerMonth: 12.7 }),
      expect.objectContaining({ id: 'lecturas', monthlyWrites: 10e6, monthlyReads: 1000e6, writeRps: 4, readRps: 400, storageGbPerMonth: 12.7 }),
      expect.objectContaining({ id: 'escrituras', monthlyWrites: 100e6, monthlyReads: 500e6, writeRps: 40, readRps: 200, storageGbPerMonth: 127 }),
    ])
  })

  it('mezcla preguntas útiles e irrelevantes, todas con respuesta', () => {
    expect(pastebin.questions.filter((q) => q.useful)).toHaveLength(8)
    expect(pastebin.questions.filter((q) => !q.useful).length).toBeGreaterThanOrEqual(4)
    expect(new Set(pastebin.questions.map((q) => q.id)).size).toBe(pastebin.questions.length)
    expect(pastebin.questions.every((q) => q.answer.length > 0)).toBe(true)
  })

  it('separa lo que entra y lo que queda fuera del alcance', () => {
    expect(pastebin.scope.filter((s) => s.inScope)).toHaveLength(6)
    expect(pastebin.scope.filter((s) => !s.inScope)).toHaveLength(4)
  })

  it('define cada función con sus alternativas', () => {
    const accepted = Object.fromEntries(pastebin.roles.map((r) => [r.id, r.acceptedKinds]))
    expect(accepted).toEqual({
      metadatos: ['sql', 'nosql'],
      contenido: ['objectStore', 'nosql'],
      populares: ['cache', 'cdn'],
      reparto: ['lb'],
      estadisticas: ['batch'],
      limpieza: ['worker'],
    })
    for (const role of pastebin.roles) expect(role.acceptedKinds).toEqual(expect.arrayContaining(role.referenceKinds))
  })

  it('las opciones válidas de cada decisión existen y hay alguna inválida', () => {
    for (const decision of pastebin.decisions) {
      const ids = decision.options.map((o) => o.id)
      expect(ids).toEqual(expect.arrayContaining(decision.validOptionIds))
      expect(ids.length).toBeGreaterThan(decision.validOptionIds.length)
    }
  })

  it('las decisiones de prueba son válidas', () => {
    for (const decision of pastebin.decisions) expect(decision.validOptionIds).toContain(VALID_DECISIONS[decision.id])
  })

  it('solo enlaza a las notas acordadas', () => {
    const urls = [...pastebin.roles, ...pastebin.rules, ...pastebin.decisions].map((item) => item.noteUrl)
    expect(new Set(urls)).toEqual(new Set(NOTE_URLS))
  })
})
