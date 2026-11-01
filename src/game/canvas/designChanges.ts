import type { Design, DesignNode, PieceKind } from '../../engine/types'

const MAX_INSTANCES = 100
const COUNTER_KINDS: PieceKind[] = ['sql', 'nosql']

const withNode = (design: Design, id: string, change: (n: DesignNode) => DesignNode): Design => ({
  ...design,
  nodes: design.nodes.map((n) => (n.id === id ? change(n) : n)),
})

/** Id nuevo de un tipo: sigue al mayor número usado, así borrar y añadir nunca repite un id. */
export function nextNodeId(design: Design, kind: PieceKind): string {
  const used = design.nodes.map((n) => Number(n.id.match(new RegExp(`^${kind}-(\\d+)$`))?.[1] ?? 0))
  return `${kind}-${Math.max(0, ...used) + 1}`
}

export function addNode(design: Design, kind: PieceKind, x: number, y: number): Design {
  if (kind === 'client') return design // solo hay un client, el de inicio
  return { ...design, nodes: [...design.nodes, { id: nextNodeId(design, kind), kind, instances: 1, x, y }] }
}

export function removeNode(design: Design, id: string): Design {
  if (design.nodes.find((n) => n.id === id)?.kind === 'client') return design
  return {
    nodes: design.nodes.filter((n) => n.id !== id),
    edges: design.edges.filter((e) => e.from !== id && e.to !== id),
  }
}

export function addEdge(design: Design, from: string, to: string): Design {
  const ids = new Set(design.nodes.map((n) => n.id))
  const toClient = design.nodes.find((n) => n.id === to)?.kind === 'client'
  const duplicate = design.edges.some((e) => e.from === from && e.to === to)
  if (from === to || toClient || duplicate || !ids.has(from) || !ids.has(to)) return design
  return { ...design, edges: [...design.edges, { from, to }] }
}

export function removeEdge(design: Design, from: string, to: string): Design {
  return { ...design, edges: design.edges.filter((e) => e.from !== from || e.to !== to) }
}

export function setInstances(design: Design, id: string, instances: number): Design {
  if (!Number.isInteger(instances) || instances < 1 || instances > MAX_INSTANCES) return design
  return withNode(design, id, (n) => ({ ...n, instances }))
}

export function setVisitCounter(design: Design, id: string, on: boolean): Design {
  if (!COUNTER_KINDS.includes(design.nodes.find((n) => n.id === id)?.kind as PieceKind)) return design
  return withNode(design, id, (n) => ({ ...n, visitCounter: on }))
}

export function moveNode(design: Design, id: string, x: number, y: number): Design {
  return withNode(design, id, (n) => ({ ...n, x, y }))
}

/** Lo que importa a la simulación y a la evaluación: todo menos `x` e `y`. */
export function isFunctionalChange(a: Design, b: Design): boolean {
  const nodes = (d: Design) => d.nodes
    .map((n) => `${n.id}|${n.kind}|${n.instances}|${n.visitCounter ? 1 : 0}`).sort()
  const edges = (d: Design) => d.edges.map((e) => `${e.from}>${e.to}`).sort()
  return JSON.stringify([nodes(a), edges(a)]) !== JSON.stringify([nodes(b), edges(b)])
}

/** Diseño de partida: el único client, que no se puede borrar. */
export const emptyDesign = (): Design => ({ nodes: [{ id: 'client', kind: 'client', instances: 1, x: 0, y: 0 }], edges: [] })
