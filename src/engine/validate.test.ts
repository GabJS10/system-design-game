import { describe, expect, it } from 'vitest'
import type { Design, DesignNode } from './types'
import { validateDesign } from './validate'

const node = (id: string, kind: DesignNode['kind'], instances = 1): DesignNode => ({ id, kind, instances })

const valid: Design = {
  nodes: [node('client', 'client'), node('api', 'api'), node('db', 'sql')],
  edges: [
    { from: 'client', to: 'api' },
    { from: 'api', to: 'db' },
  ],
}

const codes = (design: Design) => validateDesign(design).map((e) => e.code)

describe('validateDesign', () => {
  it('acepta un diseño válido', () => {
    expect(validateDesign(valid)).toEqual([])
  })

  it('rechaza un diseño sin cliente', () => {
    const design: Design = {
      nodes: [node('api', 'api'), node('db', 'sql')],
      edges: [{ from: 'api', to: 'db' }],
    }
    expect(codes(design)).toContain('no-client')
  })

  it('rechaza un ciclo e identifica sus piezas', () => {
    const design: Design = {
      nodes: [...valid.nodes, node('a', 'web'), node('b', 'web')],
      edges: [
        ...valid.edges,
        { from: 'api', to: 'a' },
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    }
    const error = validateDesign(design).find((e) => e.code === 'cycle')
    expect(error?.nodeIds.sort()).toEqual(['a', 'b'])
  })

  it('rechaza una pieza sin conexiones e identifica cuál', () => {
    const design: Design = { ...valid, nodes: [...valid.nodes, node('suelta', 'cache')] }
    const error = validateDesign(design).find((e) => e.code === 'orphan')
    expect(error?.nodeIds).toEqual(['suelta'])
  })

  it('rechaza un diseño sin almacenamiento', () => {
    const design: Design = {
      nodes: [node('client', 'client'), node('api', 'api')],
      edges: [{ from: 'client', to: 'api' }],
    }
    expect(codes(design)).toContain('no-storage')
  })

  it.each(['sql', 'nosql', 'objectStore'] as const)('acepta %s como almacenamiento', (kind) => {
    const design: Design = {
      nodes: [node('client', 'client'), node('store', kind)],
      edges: [{ from: 'client', to: 'store' }],
    }
    expect(codes(design)).not.toContain('no-storage')
  })

  it.each([0, -1, 1.5, 101, Number.NaN])('rechaza %s instancias', (instances) => {
    const design: Design = {
      ...valid,
      nodes: valid.nodes.map((n) => (n.id === 'api' ? { ...n, instances } : n)),
    }
    const error = validateDesign(design).find((e) => e.code === 'bad-instances')
    expect(error?.nodeIds).toEqual(['api'])
  })

  it('acepta 100 instancias', () => {
    const design: Design = {
      ...valid,
      nodes: valid.nodes.map((n) => (n.id === 'api' ? { ...n, instances: 100 } : n)),
    }
    expect(validateDesign(design)).toEqual([])
  })

  it('devuelve mensajes para el jugador', () => {
    const [error] = validateDesign({ nodes: [], edges: [] })
    expect(error.message).toMatch(/usuarios|cliente/i)
  })
})
