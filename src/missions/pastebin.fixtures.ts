import type { Design, DesignEdge, DesignNode } from '../engine/types'

export const VALID_DECISIONS: Record<string, string> = { generacion: 'md5', longitud: '7', contenido: 'objetos' }

/** Quita un nodo y conecta sus predecesores con sus sucesores, para no dejar el grafo roto. */
export function removeNode(design: Design, id: string): Design {
  const preds = design.edges.filter((e) => e.to === id).map((e) => e.from)
  const succs = design.edges.filter((e) => e.from === id).map((e) => e.to)
  return {
    nodes: design.nodes.filter((n) => n.id !== id),
    edges: [
      ...design.edges.filter((e) => e.from !== id && e.to !== id),
      ...preds.flatMap((from) => succs.map((to) => ({ from, to }))),
    ],
  }
}

export function withNosql(design: Design): Design {
  const rename = (id: string) => (id === 'sql' ? 'nosql' : id)
  const nosql: DesignNode = { id: 'nosql', kind: 'nosql', instances: 2 }
  return {
    nodes: [...design.nodes.filter((n) => n.kind !== 'sql' && n.kind !== 'replica'), nosql],
    edges: design.edges
      .filter((e) => e.to !== 'replica')
      .map((e): DesignEdge => ({ from: rename(e.from), to: rename(e.to) })),
  }
}

export function withoutPopularReads(design: Design): Design {
  return design.nodes
    .filter((n) => n.kind === 'cache' || n.kind === 'cdn')
    .reduce((current, n) => removeNode(current, n.id), design)
}

export function oversized(design: Design): Design {
  const extras = ['replica2', 'replica3']
  return {
    nodes: [
      ...design.nodes.map((n) => (n.kind === 'sql' ? { ...n, instances: 6 } : n)),
      ...extras.map((id): DesignNode => ({ id, kind: 'replica', instances: 1 })),
    ],
    edges: [...design.edges, ...extras.map((to) => ({ from: 'sql', to }))],
  }
}

export function withVisitCounter(design: Design): Design {
  return { ...design, nodes: design.nodes.map((n) => (n.kind === 'sql' ? { ...n, visitCounter: true } : n)) }
}

export const SINGLE_MACHINE: Design = {
  nodes: [
    { id: 'client', kind: 'client', instances: 1 },
    { id: 'web', kind: 'web', instances: 1 },
    { id: 'sql', kind: 'sql', instances: 1 },
    { id: 'objectStore', kind: 'objectStore', instances: 1 },
    { id: 'batch', kind: 'batch', instances: 1 },
    { id: 'worker', kind: 'worker', instances: 1 },
  ],
  edges: [
    { from: 'client', to: 'web' },
    { from: 'web', to: 'sql' },
    { from: 'web', to: 'objectStore' },
    { from: 'web', to: 'batch' },
    { from: 'worker', to: 'sql' },
  ],
}
