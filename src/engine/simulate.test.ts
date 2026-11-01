import { describe, expect, it } from 'vitest'
import { PIECES } from './components'
import { designCost, simulate } from './simulate'
import type { Design, DesignNode, PieceKind, Scenario } from './types'

const node = (id: string, kind: PieceKind = id as PieceKind, instances = 1): DesignNode => ({ id, kind, instances })

const edges = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [from, to] = pair.split('>')
    return { from, to }
  })

const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  id: 's',
  name: 'Prueba',
  readRps: 100,
  writeRps: 0,
  hotKeyShare: 0,
  ...overrides,
})

const nodeLatency = (kind: PieceKind, utilization: number) =>
  PIECES[kind].latencyMs / (1 - Math.min(utilization, 0.95))

const basic: Design = {
  nodes: [node('client'), node('api'), node('sql')],
  edges: edges('client>api', 'api>sql'),
}

describe('reparto de la carga', () => {
  it('lleva las lecturas de client a sql', () => {
    expect(simulate(basic, scenario()).nodes.sql.readRps).toBe(100)
  })

  it('reparte a partes iguales entre nodos del mismo tipo', () => {
    const design: Design = {
      nodes: [node('client'), node('a', 'web'), node('b', 'web'), node('sql')],
      edges: edges('client>a', 'client>b', 'a>sql', 'b>sql'),
    }
    const { nodes } = simulate(design, scenario())
    expect(nodes.a.readRps).toBe(50)
    expect(nodes.b.readRps).toBe(50)
    expect(nodes.sql.readRps).toBe(100)
  })

  it('envía toda la carga a cada grupo de datos', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('sql'), node('nosql'), node('objectStore')],
      edges: edges('client>api', 'api>sql', 'api>nosql', 'api>objectStore'),
    }
    const { nodes } = simulate(design, scenario())
    expect(nodes.sql.readRps).toBe(100)
    expect(nodes.nosql.readRps).toBe(100)
    expect(nodes.objectStore.readRps).toBe(100)
  })

  it('envía lecturas a las réplicas y escrituras a sql', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('sql'), node('r1', 'replica'), node('r2', 'replica')],
      edges: edges('client>api', 'api>sql', 'api>r1', 'api>r2'),
    }
    const { nodes } = simulate(design, scenario({ writeRps: 10 }))
    expect(nodes.sql).toMatchObject({ readRps: 0, writeRps: 10 })
    expect(nodes.r1.readRps).toBe(50)
    expect(nodes.r2.readRps).toBe(50)
  })

  it('copia las escrituras a cada réplica conectada a sql', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('sql'), node('r1', 'replica'), node('r2', 'replica')],
      edges: edges('client>api', 'api>sql', 'sql>r1', 'sql>r2'),
    }
    const { nodes } = simulate(design, scenario({ writeRps: 10 }))
    expect(nodes.sql.readRps).toBe(100)
    expect(nodes.r1).toMatchObject({ readRps: 0, writeRps: 10 })
    expect(nodes.r2).toMatchObject({ readRps: 0, writeRps: 10 })
  })

  it('no reenvía carga más allá de un nodo de datos', () => {
    const design: Design = {
      nodes: [...basic.nodes, node('warehouse')],
      edges: [...basic.edges, ...edges('sql>warehouse')],
    }
    expect(simulate(design, scenario({ writeRps: 10 })).nodes.warehouse.readRps).toBe(0)
  })
})

describe('caché y CDN', () => {
  const sibling: Design = {
    nodes: [node('client'), node('api'), node('cache'), node('sql'), node('queue')],
    edges: edges('client>api', 'api>cache', 'api>sql', 'api>queue'),
  }
  const chain: Design = {
    nodes: [node('client'), node('api'), node('cache'), node('sql')],
    edges: edges('client>api', 'api>cache', 'cache>sql'),
  }

  it('deja llegar solo los fallos de lectura a los demás destinos de datos', () => {
    expect(simulate(sibling, scenario()).nodes.sql.readRps).toBeCloseTo(20)
  })

  it('no reduce las lecturas de destinos que no son de datos', () => {
    expect(simulate(sibling, scenario()).nodes.queue.readRps).toBe(100)
  })

  it('absorbe también si la caché va en cadena', () => {
    expect(simulate(chain, scenario()).nodes.sql.readRps).toBeCloseTo(20)
  })

  it('usa la clave caliente como tasa de acierto cuando supera 0,8', () => {
    expect(simulate(sibling, scenario({ hotKeyShare: 0.9 })).nodes.sql.readRps).toBeCloseTo(10)
  })

  it('no absorbe escrituras', () => {
    expect(simulate(sibling, scenario({ writeRps: 10 })).nodes.sql.writeRps).toBe(10)
  })

  it('reduce con un CDN las lecturas de todo lo que hay detrás', () => {
    const design: Design = {
      nodes: [node('client'), node('cdn'), node('api'), node('sql')],
      edges: edges('client>cdn', 'cdn>api', 'api>sql'),
    }
    const { nodes } = simulate(design, scenario())
    expect(nodes.api.readRps).toBeCloseTo(20)
    expect(nodes.sql.readRps).toBeCloseTo(20)
  })
})

describe('trabajo en segundo plano', () => {
  const design: Design = {
    nodes: [...basic.nodes, node('queue'), node('worker'), node('batch')],
    edges: [...basic.edges, ...edges('api>queue', 'queue>worker', 'worker>sql', 'api>batch')],
  }

  it('no suma latencia a la petición', () => {
    const withoutBackground = simulate(basic, scenario({ readRps: 10 }))
    const result = simulate(design, scenario({ readRps: 10 }))
    expect(result.p99Ms).toBeCloseTo(withoutBackground.p99Ms)
  })

  it('suma su coste', () => {
    const result = simulate(design, scenario())
    expect(result.monthlyCost).toBe(designCost(basic) + PIECES.queue.monthlyCost + PIECES.worker.monthlyCost + PIECES.batch.monthlyCost)
  })

  it('una cola envía la media de escrituras, no el pico, y ninguna lectura', () => {
    const { nodes } = simulate(design, scenario({ writeRps: 30, meanWriteRps: 10 }))
    expect(nodes.queue.writeRps).toBe(30)
    expect(nodes.worker).toMatchObject({ readRps: 0, writeRps: 10 })
  })

  it('una cola sin media declarada envía todas las escrituras', () => {
    expect(simulate(design, scenario({ writeRps: 30 })).nodes.worker.writeRps).toBe(30)
  })

  it('una cola sin escrituras no produce valores inválidos', () => {
    expect(simulate(design, scenario({ meanWriteRps: 0 })).nodes.worker.writeRps).toBe(0)
  })

  it('un proceso por lotes saturado no provoca errores en las peticiones', () => {
    const readRps = PIECES.batch.capacityRps * 3
    const big: Design = {
      ...design,
      nodes: design.nodes.map((n) => (n.kind === 'batch' ? n : { ...n, instances: 100 })),
    }
    const result = simulate(big, scenario({ readRps }))
    expect(result.nodes.batch.saturated).toBe(true)
    expect(result.errorRate).toBe(0)
  })

  it('una cola saturada sí rechaza peticiones', () => {
    const big: Design = {
      nodes: [node('client'), node('api', 'api', 100), node('queue'), node('sql', 'sql', 100)],
      edges: edges('client>api', 'api>queue', 'api>sql'),
    }
    const result = simulate(big, scenario({ readRps: 0, writeRps: PIECES.queue.capacityRps * 2 }))
    expect(result.errorRate).toBeCloseTo(0.5)
  })
})

describe('carga, capacidad y latencia', () => {
  it('añade una escritura por lectura con visitCounter', () => {
    const design: Design = {
      ...basic,
      nodes: basic.nodes.map((n) => (n.kind === 'sql' ? { ...n, visitCounter: true } : n)),
    }
    expect(simulate(design, scenario()).nodes.sql.writeRps).toBe(100)
  })

  it('pondera las lecturas con la clave caliente solo en nodos de datos', () => {
    const { nodes } = simulate(basic, scenario({ hotKeyShare: 0.5 }))
    expect(nodes.sql.utilization).toBeCloseTo(150 / PIECES.sql.capacityRps)
    expect(nodes.api.utilization).toBeCloseTo(100 / PIECES.api.capacityRps)
  })

  it('multiplica la capacidad por las instancias', () => {
    const design: Design = { ...basic, nodes: [node('client'), node('api', 'api', 4), node('sql')] }
    expect(simulate(design, scenario()).nodes.api.utilization).toBeCloseTo(100 / (PIECES.api.capacityRps * 4))
  })

  it('hace crecer la latencia con la saturación', () => {
    const utilization = 0.5
    const readRps = PIECES.api.capacityRps * utilization
    const design: Design = { ...basic, nodes: [node('client'), node('api'), node('sql', 'sql', 100)] }
    expect(simulate(design, scenario({ readRps })).nodes.api.latencyMs).toBeCloseTo(nodeLatency('api', utilization))
  })

  it('limita la latencia al superar 0,95 de utilización', () => {
    const readRps = PIECES.api.capacityRps * 3
    const design: Design = { ...basic, nodes: [node('client'), node('api'), node('sql', 'sql', 100)] }
    const { nodes } = simulate(design, scenario({ readRps }))
    expect(nodes.api.latencyMs).toBeCloseTo(PIECES.api.latencyMs / 0.05)
    expect(nodes.api.saturated).toBe(true)
  })

  it('da una tasa de errores de 0,5 con utilización 2', () => {
    const readRps = PIECES.api.capacityRps * 2
    const design: Design = { ...basic, nodes: [node('client'), node('api'), node('sql', 'sql', 100)] }
    expect(simulate(design, scenario({ readRps })).errorRate).toBeCloseTo(0.5)
  })

  it('no da errores sin saturación', () => {
    expect(simulate(basic, scenario({ readRps: 1 })).errorRate).toBe(0)
  })

  it('duplicar instancias con poca carga duplica la capacidad, no la velocidad', () => {
    const doubled: Design = { ...basic, nodes: [node('client'), node('api', 'api', 2), node('sql')] }
    const one = simulate(basic, scenario({ readRps: 1 })).nodes.api
    const two = simulate(doubled, scenario({ readRps: 1 })).nodes.api
    expect(two.utilization).toBeCloseTo(one.utilization / 2)
    expect(two.latencyMs).toBeGreaterThan(one.latencyMs * 0.9)
  })
})

describe('camino de la petición', () => {
  it('suma las latencias del camino en p99Ms', () => {
    const { nodes, p99Ms } = simulate(basic, scenario())
    expect(p99Ms).toBeCloseTo(nodes.client.latencyMs + nodes.api.latencyMs + nodes.sql.latencyMs)
  })

  it('toma el camino más lento', () => {
    const design: Design = {
      nodes: [...basic.nodes, node('objectStore')],
      edges: [...basic.edges, ...edges('api>objectStore')],
    }
    const { nodes, p99Ms } = simulate(design, scenario({ readRps: 1 }))
    expect(p99Ms).toBeCloseTo(nodes.api.latencyMs + Math.max(nodes.sql.latencyMs, nodes.objectStore.latencyMs))
  })

  it('ignora nodos sin carga', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('sql'), node('replica'), node('objectStore')],
      edges: edges('client>api', 'api>sql', 'api>replica', 'api>objectStore'),
    }
    const { nodes, p99Ms } = simulate(design, scenario())
    expect(nodes.sql.readRps + nodes.sql.writeRps).toBe(0)
    expect(p99Ms).toBeCloseTo(nodes.api.latencyMs + Math.max(nodes.replica.latencyMs, nodes.objectStore.latencyMs))
  })

  it('no cuenta la copia a réplicas en la petición', () => {
    const design: Design = {
      nodes: [...basic.nodes, node('replica')],
      edges: [...basic.edges, ...edges('sql>replica')],
    }
    const { nodes, p99Ms } = simulate(design, scenario({ writeRps: 10 }))
    expect(p99Ms).toBeCloseTo(nodes.api.latencyMs + nodes.sql.latencyMs)
  })

  it('incluye el fallo de caché en p99Ms y lo pondera en meanMs', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('cache'), node('sql')],
      edges: edges('client>api', 'api>cache', 'api>sql'),
    }
    const { nodes, p99Ms, meanMs } = simulate(design, scenario())
    expect(p99Ms).toBeCloseTo(nodes.api.latencyMs + nodes.cache.latencyMs + nodes.sql.latencyMs)
    expect(meanMs).toBeCloseTo(nodes.api.latencyMs + nodes.cache.latencyMs + 0.2 * nodes.sql.latencyMs)
  })

  it('pondera también la caché en cadena', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('cache'), node('sql')],
      edges: edges('client>api', 'api>cache', 'cache>sql'),
    }
    const { nodes, p99Ms, meanMs } = simulate(design, scenario())
    expect(p99Ms).toBeCloseTo(nodes.api.latencyMs + nodes.cache.latencyMs + nodes.sql.latencyMs)
    expect(meanMs).toBeCloseTo(nodes.api.latencyMs + nodes.cache.latencyMs + 0.2 * nodes.sql.latencyMs)
  })
})

describe('caídas', () => {
  const twoApis: Design = { ...basic, nodes: [node('client'), node('api', 'api', 2), node('sql')] }

  it('quita una instancia si hay varias', () => {
    const result = simulate(twoApis, scenario({ down: 'api' }))
    expect(result.nodes.api.utilization).toBeCloseTo(100 / PIECES.api.capacityRps)
    expect(result.errorRate).toBe(0)
  })

  it('pasa la carga al otro nodo del grupo', () => {
    const design: Design = {
      nodes: [node('client'), node('a', 'web'), node('b', 'web'), node('sql')],
      edges: edges('client>a', 'client>b', 'a>sql', 'b>sql'),
    }
    const result = simulate(design, scenario({ down: 'a' }))
    expect(result.nodes.b.readRps).toBe(100)
    expect(result.errorRate).toBe(0)
  })

  it('sigue hasta el destino si cae una caché en paralelo', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('cache'), node('sql')],
      edges: edges('client>api', 'api>cache', 'api>sql'),
    }
    const result = simulate(design, scenario({ down: 'cache' }))
    expect(result.nodes.sql.readRps).toBe(100)
    expect(result.errorRate).toBe(0)
  })

  it('sigue hasta el destino si cae una caché o un CDN en cadena', () => {
    const design: Design = {
      nodes: [node('client'), node('cdn'), node('api'), node('cache'), node('sql')],
      edges: edges('client>cdn', 'cdn>api', 'api>cache', 'cache>sql'),
    }
    expect(simulate(design, scenario({ down: 'cache' })).nodes.sql.readRps).toBeCloseTo(20)
    expect(simulate(design, scenario({ down: 'cdn' })).nodes.api.readRps).toBe(100)
  })

  it('una réplica conectada asume las escrituras si cae sql', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('sql'), node('replica')],
      edges: edges('client>api', 'api>sql', 'sql>replica'),
    }
    const result = simulate(design, scenario({ writeRps: 10, down: 'sql' }))
    expect(result.nodes.replica).toMatchObject({ readRps: 100, writeRps: 10 })
    expect(result.errorRate).toBe(0)
  })

  it('da errorRate 1 si no queda destino posible', () => {
    expect(simulate(basic, scenario({ down: 'api' })).errorRate).toBe(1)
    expect(simulate(basic, scenario({ down: 'sql' })).errorRate).toBe(1)
  })

  it('da errorRate 1 si cae la única cola de escrituras', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('queue'), node('sql')],
      edges: edges('client>api', 'api>queue', 'api>sql'),
    }
    expect(simulate(design, scenario({ down: 'queue' })).errorRate).toBe(1)
  })

  it.each(['worker', 'batch', 'warehouse'] as const)('la caída de %s no afecta a las peticiones', (kind) => {
    const design: Design = {
      nodes: [...basic.nodes, node(kind)],
      edges: [...basic.edges, ...edges(`api>${kind}`)],
    }
    expect(simulate(design, scenario({ down: kind })).errorRate).toBe(0)
  })

  it('la caída de una réplica devuelve las lecturas a sql', () => {
    const design: Design = {
      nodes: [node('client'), node('api'), node('sql'), node('replica')],
      edges: edges('client>api', 'api>sql', 'api>replica'),
    }
    const result = simulate(design, scenario({ down: 'replica' }))
    expect(result.nodes.sql.readRps).toBe(100)
    expect(result.errorRate).toBe(0)
  })

  it('no da errores si cae una réplica solo enlazada desde sql', () => {
    const design: Design = {
      nodes: [...basic.nodes, node('replica')],
      edges: [...basic.edges, ...edges('sql>replica')],
    }
    expect(simulate(design, scenario({ down: 'replica' })).errorRate).toBe(0)
  })

  it('sigue pagando y mostrando la pieza caída', () => {
    const result = simulate(basic, scenario({ down: 'api' }))
    expect(result.monthlyCost).toBe(designCost(basic))
    expect(result.nodes.api).toEqual({ readRps: 0, writeRps: 0, utilization: 0, saturated: false, latencyMs: 0 })
  })

  it('ignora caídas de client o de un nodo inexistente', () => {
    const normal = simulate(basic, scenario())
    expect(simulate(basic, scenario({ down: 'client' }))).toEqual(normal)
    expect(simulate(basic, scenario({ down: 'nada' }))).toEqual(normal)
  })
})

describe('resultado', () => {
  it('es determinista', () => {
    expect(simulate(basic, scenario())).toEqual(simulate(basic, scenario()))
  })

  it('no modifica el diseño recibido', () => {
    const copy = structuredClone(basic)
    simulate(basic, scenario({ down: 'api' }))
    expect(basic).toEqual(copy)
  })

  it('identifica el cuello de botella', () => {
    const design: Design = { ...basic, nodes: [node('client'), node('api'), node('sql', 'sql', 100)] }
    expect(simulate(design, scenario({ readRps: 1 })).bottleneckId).toBe('api')
  })

  it('no señala cuello de botella sin carga', () => {
    expect(simulate(basic, scenario({ readRps: 0 })).bottleneckId).toBeNull()
  })

  it('lanza el primer error si el diseño es inválido', () => {
    const invalid: Design = { nodes: [node('api')], edges: [] }
    expect(() => simulate(invalid, scenario())).toThrow('Falta el nodo de usuarios')
  })

  it('calcula el coste mensual por instancia', () => {
    const design: Design = { ...basic, nodes: [node('client'), node('api', 'api', 3), node('sql')] }
    expect(designCost(design)).toBe(PIECES.api.monthlyCost * 3 + PIECES.sql.monthlyCost)
  })
})
