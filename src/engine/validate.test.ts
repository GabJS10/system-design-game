import { describe, expect, it } from 'vitest'
import type { Design, DesignNode } from './types'
import { requestReach, validateDesign } from './validate'

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

  it('rechaza un almacenamiento al que no llega ninguna petición', () => {
    const design: Design = {
      nodes: [node('client', 'client'), node('dns', 'dns'), node('worker', 'worker'), node('db', 'sql')],
      edges: [
        { from: 'client', to: 'dns' },
        { from: 'worker', to: 'db' },
      ],
    }
    const error = validateDesign(design).find((e) => e.code === 'unreachable-storage')
    expect(error?.message).toMatch(/usuarios/)
    expect(error?.nodeIds).toEqual(['db'])
  })

  it.each([
    ['otro almacenamiento', 'objectStore', ['client>store', 'store>db']],
    ['una cola y su worker', 'queue', ['client>store', 'store>worker', 'worker>db']],
  ])('no cruza %s para llegar al almacenamiento', (_, kind, pairs) => {
    const design: Design = {
      nodes: [node('client', 'client'), node('store', kind as DesignNode['kind']), node('worker', 'worker'), node('db', 'sql')],
      edges: pairs.map((p) => ({ from: p.split('>')[0], to: p.split('>')[1] })),
    }
    const reached = requestReach(design)
    expect(reached.has('db')).toBe(false)
    expect(reached.has('store')).toBe(true)
  })

  it('una cola no comunica una petición con el almacenamiento', () => {
    const design: Design = {
      nodes: [node('client', 'client'), node('queue', 'queue'), node('worker', 'worker'), node('db', 'sql')],
      edges: [
        { from: 'client', to: 'queue' },
        { from: 'queue', to: 'worker' },
        { from: 'worker', to: 'db' },
      ],
    }
    expect(codes(design)).toContain('unreachable-storage')
  })

  it('rechaza una arista con un extremo inexistente', () => {
    const design: Design = { ...valid, edges: [...valid.edges, { from: 'api', to: 'nada' }] }
    const error = validateDesign(design).find((e) => e.code === 'dangling-edge')
    expect(error?.nodeIds).toEqual(['api'])
  })

  it('rechaza más de un nodo de usuarios', () => {
    const design: Design = {
      nodes: [...valid.nodes, node('otro', 'client')],
      edges: [...valid.edges, { from: 'otro', to: 'api' }],
    }
    const error = validateDesign(design).find((e) => e.code === 'many-clients')
    expect(error?.nodeIds).toEqual(['client', 'otro'])
  })

  it('devuelve mensajes para el jugador', () => {
    const [error] = validateDesign({ nodes: [], edges: [] })
    expect(error.message).toMatch(/usuarios|cliente/i)
  })
})
