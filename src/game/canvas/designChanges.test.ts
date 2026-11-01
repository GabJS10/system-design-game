import { describe, expect, it } from 'vitest'
import type { Design, DesignNode } from '../../engine/types'
import { addEdge, addNode, isFunctionalChange, nextNodeId, removeNode, setInstances, setVisitCounter } from './designChanges'

const n = (id: string, kind: DesignNode['kind'] = 'api', over: Partial<DesignNode> = {}): DesignNode => ({ id, kind, instances: 1, ...over })
const base: Design = { nodes: [n('client', 'client'), n('api-1'), n('sql-1', 'sql')], edges: [{ from: 'client', to: 'api-1' }, { from: 'api-1', to: 'sql-1' }] }

describe('isFunctionalChange', () => {
  it('ignora x e y', () => {
    const moved = { ...base, nodes: base.nodes.map((x) => ({ ...x, x: 5, y: 9 })) }
    expect(isFunctionalChange(base, moved)).toBe(false)
  })
  it('detecta instancias, contador, piezas y aristas', () => {
    expect(isFunctionalChange(base, setInstances(base, 'api-1', 3))).toBe(true)
    expect(isFunctionalChange(base, setVisitCounter(base, 'sql-1', true))).toBe(true)
    expect(isFunctionalChange(base, addNode(base, 'cache', 0, 0))).toBe(true)
    expect(isFunctionalChange(base, removeNode(base, 'sql-1'))).toBe(true)
    expect(isFunctionalChange(base, { ...base, edges: base.edges.slice(1) })).toBe(true)
  })
  it('un cambio de x no oculta uno funcional', () => {
    const both = { ...setInstances(base, 'api-1', 2), nodes: setInstances(base, 'api-1', 2).nodes.map((x) => ({ ...x, x: 1 })) }
    expect(isFunctionalChange(base, both)).toBe(true)
  })
  it('el orden de los nodos y aristas no importa', () => {
    expect(isFunctionalChange(base, { nodes: [...base.nodes].reverse(), edges: [...base.edges].reverse() })).toBe(false)
  })
  it('visitCounter false equivale a ausente', () => {
    expect(isFunctionalChange(base, setVisitCounter(base, 'sql-1', false))).toBe(false)
  })
})

describe('nextNodeId', () => {
  it('no repite ids tras borrar y añadir', () => {
    let d = addNode(base, 'api', 0, 0) // api-2
    d = addNode(d, 'api', 0, 0) // api-3
    d = removeNode(d, 'api-2')
    d = addNode(d, 'api', 0, 0)
    const ids = d.nodes.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('salta ids ya usados aunque no sean consecutivos', () => {
    expect(nextNodeId({ nodes: [n('api-7', 'api')], edges: [] }, 'api')).toBe('api-8')
  })
  it('primer id de un tipo', () => {
    expect(nextNodeId({ nodes: [], edges: [] }, 'lb')).toBe('lb-1')
  })
})

describe('addEdge', () => {
  it('crea la arista', () => {
    expect(addEdge(base, 'client', 'sql-1').edges).toContainEqual({ from: 'client', to: 'sql-1' })
  })
  it.each([
    ['hacia client', 'api-1', 'client'],
    ['duplicada', 'client', 'api-1'],
    ['a sí misma', 'api-1', 'api-1'],
    ['con extremo inexistente', 'api-1', 'zzz'],
  ])('no crea una arista %s', (_t, from, to) => {
    expect(addEdge(base, from, to)).toBe(base)
  })
})

describe('removeNode', () => {
  it('quita la pieza y sus aristas', () => {
    const d = removeNode(base, 'api-1')
    expect(d.nodes.map((x) => x.id)).toEqual(['client', 'sql-1'])
    expect(d.edges).toEqual([])
  })
  it('nunca borra client', () => {
    expect(removeNode(base, 'client')).toBe(base)
  })
})

describe('addNode', () => {
  it('no crea un segundo client', () => {
    expect(addNode(base, 'client', 0, 0)).toBe(base)
  })
  it('guarda la posición', () => {
    expect(addNode(base, 'cache', 10, 20).nodes.at(-1)).toMatchObject({ kind: 'cache', instances: 1, x: 10, y: 20 })
  })
})

describe('setInstances', () => {
  it.each([[0], [101], [2.5], [Number.NaN]])('rechaza %s', (v) => {
    expect(setInstances(base, 'api-1', v)).toBe(base)
  })
  it.each([[1], [100]])('acepta %s', (v) => {
    expect(setInstances(base, 'api-1', v).nodes[1].instances).toBe(v)
  })
})

describe('setVisitCounter', () => {
  it('solo en sql y nosql', () => {
    expect(setVisitCounter(base, 'api-1', true)).toBe(base)
    expect(setVisitCounter(base, 'sql-1', true).nodes[2].visitCounter).toBe(true)
  })
})
