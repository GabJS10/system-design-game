import { describe, expect, it } from 'vitest'
import { pastebin } from '../missions/pastebin'
import { SINGLE_MACHINE, VALID_DECISIONS, oversized, removeNode, withNosql, withVisitCounter, withoutPopularReads } from '../missions/pastebin.fixtures'
import { compareDesign, scoreDesign, type AttemptFacts } from './score'
import { designCost } from './simulate'
import type { Design } from './types'

const variant = pastebin.variants[0]
const reference = variant.reference

const perfectFacts: AttemptFacts = {
  askedQuestionIds: pastebin.questions.filter((q) => q.useful).map((q) => q.id),
  scopeChoices: Object.fromEntries(pastebin.scope.map((s) => [s.id, s.inScope])),
  estimates: { readRps: 'bien', writeRps: 'bien', storageGbPerMonth: 'bien' },
}

const compare = (design = reference, decisions = VALID_DECISIONS, facts = perfectFacts, chosen = variant) =>
  compareDesign(pastebin, chosen, design, decisions, facts, scoreDesign(pastebin, chosen, design, decisions))

describe('compareDesign', () => {
  it('la referencia con sus decisiones y hechos perfectos no tiene diferencias', () => {
    expect(compare()).toEqual([])
  })

  it('una alternativa válida (nosql) da un valido y ninguna pieza', () => {
    const diffs = compare(withNosql(reference))
    expect(diffs.filter((d) => d.category === 'valido').map((d) => d.id)).toEqual(['rol:metadatos', 'rol:redundancia'])
    expect(diffs.filter((d) => d.category === 'pieza')).toHaveLength(0)
  })

  it('sin caché ni CDN da pieza con nota', () => {
    const diffs = compare(withoutPopularReads(reference))
    const missing = diffs.filter((d) => d.category === 'pieza')
    expect(missing.map((d) => d.id)).toEqual(['rol:populares', 'escenario:viral'])
    for (const diff of missing) expect(diff.noteUrl).toBeTruthy()
  })

  it('una decisión no válida da pieza con la nota de la decisión', () => {
    const diffs = compare(reference, { ...VALID_DECISIONS, longitud: '4' })
    expect(diffs).toEqual([expect.objectContaining({ id: 'decision:longitud', category: 'pieza', noteUrl: expect.any(String) })])
  })

  it('una estimación lejos o cerca da estimacion', () => {
    const facts = { ...perfectFacts, estimates: { ...perfectFacts.estimates, readRps: 'lejos' as const, writeRps: 'cerca' as const } }
    expect(compare(reference, VALID_DECISIONS, facts).map((d) => [d.id, d.category])).toEqual([
      ['estimacion:readRps', 'estimacion'],
      ['estimacion:writeRps', 'estimacion'],
    ])
  })

  it('no preguntar por estadísticas da requisito; las preguntas inútiles no cuentan', () => {
    const facts = { ...perfectFacts, askedQuestionIds: perfectFacts.askedQuestionIds.filter((id) => id !== 'estadisticas') }
    expect(compare(reference, VALID_DECISIONS, facts)).toEqual([expect.objectContaining({ id: 'pregunta:estadisticas', category: 'requisito' })])
  })

  it('un alcance mal marcado da requisito', () => {
    const facts = { ...perfectFacts, scopeChoices: { ...perfectFacts.scopeChoices, cuentas: true, borrar: false } }
    expect(compare(reference, VALID_DECISIONS, facts).map((d) => [d.id, d.category])).toEqual([
      ['alcance:borrar', 'requisito'],
      ['alcance:cuentas', 'requisito'],
    ])
  })

  it('no depende de los identificadores de nodo', () => {
    const renamed = removeNode(reference, 'cache')
    expect(compare(renamed).map((d) => d.id)).toEqual(['rol:populares', 'escenario:viral'])
  })

  it('una regla funcional fallida da pieza con la nota de la regla', () => {
    expect(compare(withVisitCounter(reference))).toEqual([
      expect.objectContaining({ id: 'regla:estadisticas', category: 'pieza', noteUrl: expect.any(String) }),
    ])
  })

  describe('cuando se pierden estrellas', () => {
    it('sin réplica explica la caída y la falta de redundancia', () => {
      const diffs = compare(removeNode(reference, 'replica'))
      expect(diffs.map((d) => [d.id, d.category])).toEqual([
        ['rol:redundancia', 'pieza'],
        ['caida:sql', 'pieza'],
      ])
      for (const diff of diffs) expect(diff.noteUrl).toBeTruthy()
    })

    it('lecturas sin CDN explica el escenario fallido', () => {
      const lecturas = pastebin.variants[1]
      const diffs = compare(removeNode(lecturas.reference, 'cdn'), VALID_DECISIONS, perfectFacts, lecturas)
      expect(diffs.map((d) => d.id)).toEqual(['escenario:viral', 'caida:cache'])
      expect(diffs[0]).toMatchObject({ category: 'pieza', title: 'Paste viral' })
    })

    it('perder solo el coste explica el presupuesto superado', () => {
      const design = oversized(reference)
      const stars = scoreDesign(pastebin, variant, design, VALID_DECISIONS)
      expect(stars).toMatchObject({ performance: true, reliability: true, cost: false })
      const diffs = compare(design).filter((d) => d.id === 'coste')
      expect(diffs).toEqual([
        expect.objectContaining({ category: 'pieza', noteUrl: expect.any(String), detail: expect.stringContaining(String(variant.budget)) }),
      ])
      expect(diffs[0].detail).toContain(String(designCost(design)))
    })

    it('dentro del presupuesto no hay diferencia de coste', () => {
      expect(compare().map((d) => d.id)).not.toContain('coste')
    })

    it('agrupa por tipo las caídas de varias piezas', () => {
      const two: Design = {
        nodes: [...SINGLE_MACHINE.nodes, { id: 'sql2', kind: 'sql', instances: 1 }],
        edges: [...SINGLE_MACHINE.edges, { from: 'web', to: 'sql2' }, { from: 'sql', to: 'sql2' }],
      }
      const stars = { ...scoreDesign(pastebin, variant, two, VALID_DECISIONS), failingDownIds: ['sql', 'sql2', 'web'] }
      const ids = compareDesign(pastebin, variant, two, VALID_DECISIONS, perfectFacts, stars).map((d) => d.id)
      expect(ids.filter((id) => id.startsWith('caida:'))).toEqual(['caida:web', 'caida:sql'])
    })
  })

  describe('la función debe tener efecto', () => {
    const noCache = removeNode(reference, 'cache')
    const byId = (design: Design) => compare(design).find((d) => d.id === 'rol:populares')

    it('un CDN en paralelo no cubre las lecturas populares', () => {
      const parallel: Design = {
        nodes: [...noCache.nodes, { id: 'cdn', kind: 'cdn', instances: 1 }],
        edges: [...noCache.edges, { from: 'client', to: 'cdn' }],
      }
      expect(byId(parallel)).toMatchObject({ category: 'pieza' })
    })

    it('un CDN delante sí las cubre, como alternativa válida', () => {
      const front: Design = {
        nodes: [...noCache.nodes, { id: 'cdn', kind: 'cdn', instances: 1 }],
        edges: [...noCache.edges.filter((e) => e.to !== 'lb'), { from: 'client', to: 'cdn' }, { from: 'cdn', to: 'lb' }],
      }
      expect(byId(front)).toMatchObject({ category: 'valido' })
    })

    it('una caché con varias instancias sigue teniendo efecto', () => {
      const big = { ...reference, nodes: reference.nodes.map((n) => (n.kind === 'cache' ? { ...n, instances: 3 } : n)) }
      expect(byId(big)).toBeUndefined()
    })

    it('un balanceador sin salida no cubre el reparto', () => {
      const edges = reference.edges.filter((e) => e.from !== 'lb' && e.to !== 'lb')
      const design = { ...reference, edges: [...edges, { from: 'client', to: 'lb' }, { from: 'client', to: 'web' }] }
      expect(compare(design).find((d) => d.id === 'rol:reparto')).toMatchObject({ category: 'pieza' })
    })

    it('una pieza desconectada de las peticiones no cubre su función', () => {
      const island: Design = {
        nodes: [...noCache.nodes, { id: 'cache', kind: 'cache', instances: 1 }, { id: 'sql2', kind: 'sql', instances: 1 }],
        edges: [...noCache.edges, { from: 'cache', to: 'sql2' }],
      }
      expect(byId(island)).toMatchObject({ category: 'pieza' })
    })

    it('limpiar con el lote cubre la limpieza como alternativa válida', () => {
      const design = removeNode({ ...reference, edges: [...reference.edges, { from: 'batch', to: 'sql' }] }, 'worker')
      expect(compare(design).find((d) => d.id === 'rol:limpieza')).toMatchObject({ category: 'valido' })
    })

    it('el lote que no toca los metadatos no cubre la limpieza', () => {
      expect(compare(removeNode(reference, 'worker')).find((d) => d.id === 'rol:limpieza')).toMatchObject({ category: 'pieza' })
    })

    it('un ciclo no lanza, omite las reglas y conserva lo demás', () => {
      const cycle: Design = {
        nodes: [
          { id: 'client', kind: 'client', instances: 1 },
          { id: 'a', kind: 'web', instances: 1 },
          { id: 'b', kind: 'web', instances: 1 },
          { id: 'sql', kind: 'sql', instances: 1 },
        ],
        edges: [
          { from: 'client', to: 'a' },
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' },
          { from: 'b', to: 'sql' },
        ],
      }
      const stars = scoreDesign(pastebin, variant, cycle, VALID_DECISIONS)
      const facts = { ...perfectFacts, askedQuestionIds: [] }
      const ids = compareDesign(pastebin, variant, cycle, { ...VALID_DECISIONS, longitud: '4' }, facts, stars).map((d) => d.id)
      expect(ids.filter((id) => id.startsWith('regla:'))).toEqual([])
      expect(ids).toEqual(expect.arrayContaining(['pregunta:volumen', 'rol:reparto', 'decision:longitud']))
    })

    it('un diseño inválido no lanza y no cubre nada', () => {
      const invalid: Design = { nodes: [{ id: 'web', kind: 'web', instances: 1 }], edges: [] }
      const stars = scoreDesign(pastebin, variant, invalid, VALID_DECISIONS)
      const ids = compareDesign(pastebin, variant, invalid, VALID_DECISIONS, perfectFacts, stars).map((d) => d.id)
      expect(ids).toContain('rol:reparto')
    })
  })

  describe('textos', () => {
    it('un elemento de alcance sin marcar que estaba fuera no genera "lo marcaste"', () => {
      const { cuentas: _, ...scopeChoices } = perfectFacts.scopeChoices
      expect(compare(reference, VALID_DECISIONS, { ...perfectFacts, scopeChoices })).toEqual([])
    })

    it('un elemento sin marcar que estaba dentro dice que no lo marcaste', () => {
      const { pegar: _, ...scopeChoices } = perfectFacts.scopeChoices
      expect(compare(reference, VALID_DECISIONS, { ...perfectFacts, scopeChoices })).toEqual([
        expect.objectContaining({ id: 'alcance:pegar', detail: 'Estaba dentro del alcance y no lo marcaste.' }),
      ])
    })

    it('una estimación ausente no genera texto', () => {
      const facts = { ...perfectFacts, estimates: { readRps: 'bien', writeRps: 'bien' } } as unknown as AttemptFacts
      expect(compare(reference, VALID_DECISIONS, facts)).toEqual([])
    })
  })

  it('los id son estables entre ejecuciones', () => {
    const design = withoutPopularReads(reference)
    expect(compare(design)).toEqual(compare(design))
  })
})
