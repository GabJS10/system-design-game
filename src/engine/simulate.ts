import { PIECES } from './components'
import type { Design, DesignEdge, DesignNode, NodeMetrics, PieceKind, Scenario, SimResult } from './types'
import { DATA, OFF_REQUEST, validateDesign } from './validate'

// Encolar ocurre durante la petición; el resto trabaja después y no puede hacerla fallar.
const NEVER_BLOCKS: PieceKind[] = ['worker', 'batch', 'warehouse']
const ABSORBERS: PieceKind[] = ['cache', 'cdn']
const SERVERS: PieceKind[] = ['web', 'api']
const MIN_HIT_RATE = 0.8
const MAX_LATENCY_UTILIZATION = 0.95
// Una clave vive en un solo nodo: sus lecturas pesan el doble y no se reparten.
const HOT_READ_WEIGHT = 2
const DOWN_METRICS: NodeMetrics = { readRps: 0, writeRps: 0, utilization: 0, saturated: false, latencyMs: 0 }

type Graph = { nodes: DesignNode[]; edges: DesignEdge[]; stranded: string[] }
type Load = { reads: number; writes: number; hotReads: number }

export const groupOf = (kind: PieceKind): string => (kind === 'sql' || kind === 'replica' ? 'relational' : kind)

/** Delante de un servidor debe haber quien sepa sacar del reparto una copia caída. */
export function isBalanced(design: Design, id: string): boolean {
  const target = design.nodes.find((n) => n.id === id)
  const fronts = design.edges
    .filter((e) => e.to === id)
    .map((e) => design.nodes.find((n) => n.id === e.from)?.kind)
  return fronts.length > 0 && fronts.every((kind) => kind === 'lb' || (kind === 'web' && target?.kind === 'api'))
}

function applyDown(design: Design, down: string | undefined): Graph {
  const target = design.nodes.find((n) => n.id === down)
  if (!target || target.kind === 'client') return { ...design, stranded: [] }
  if (target.instances > 1) {
    const nodes = design.nodes.map((n) => (n === target ? { ...n, instances: n.instances - 1 } : n))
    return { nodes, edges: design.edges, stranded: [] }
  }

  const kindOf = (id: string) => design.nodes.find((n) => n.id === id)?.kind ?? 'client'
  const nodes = design.nodes.filter((n) => n !== target)
  const edges = design.edges.filter((e) => e.from !== target.id && e.to !== target.id)
  const preds = design.edges.filter((e) => e.to === target.id).map((e) => e.from)
  const succs = design.edges.filter((e) => e.from === target.id).map((e) => e.to)

  const heirs =
    target.kind === 'sql' ? [...succs, ...preds].filter((id) => kindOf(id) === 'replica')
    : ABSORBERS.includes(target.kind) ? succs
    : []
  const rewired = preds.flatMap((from) => heirs.filter((to) => to !== from).map((to) => ({ from, to })))
  // Una pieza de paso sin salida no sostenía ninguna petición.
  const deadEnd = succs.length === 0 && !DATA.includes(target.kind) && target.kind !== 'queue'
  if (heirs.length > 0 || deadEnd || ABSORBERS.includes(target.kind) || NEVER_BLOCKS.includes(target.kind)) {
    return { nodes, edges: [...edges, ...rewired], stranded: [] }
  }

  const stranded = preds.filter(
    (id) =>
      !DATA.includes(kindOf(id)) &&
      !edges.some((e) => e.from === id && groupOf(kindOf(e.to)) === groupOf(target.kind)),
  )
  return { nodes, edges, stranded }
}

function topologicalOrder({ nodes, edges }: Graph): string[] {
  const pending = new Map(nodes.map((n) => [n.id, edges.filter((e) => e.to === n.id).length]))
  const order = nodes.filter((n) => pending.get(n.id) === 0).map((n) => n.id)
  for (const id of order) {
    for (const edge of edges.filter((e) => e.from === id)) {
      const left = (pending.get(edge.to) ?? 0) - 1
      pending.set(edge.to, left)
      if (left === 0) order.push(edge.to)
    }
  }
  return order
}

function downstream({ edges }: Graph, starts: string[]): Set<string> {
  const reached = new Set(starts)
  for (const id of reached) for (const edge of edges) if (edge.from === id) reached.add(edge.to)
  return reached
}

const uniqueTargets = ({ edges }: Graph, id: string) => [...new Set(edges.filter((e) => e.from === id).map((e) => e.to))]

/** Lo que ya llega a través de una de estas piezas no se envía además directamente. */
function carriedBy(graph: Graph, targets: string[], kinds: PieceKind[]): Set<string> {
  const kindOf = (id: string) => graph.nodes.find((n) => n.id === id)?.kind as PieceKind
  return downstream(graph, targets.filter((t) => kinds.includes(kindOf(t))).flatMap((t) => uniqueTargets(graph, t)))
}

/** Parte de las lecturas que queda servida: por una pieza de datos o por un acierto de caché o CDN. */
function servedReads(graph: Graph, hitRate: number): number {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const memo = new Map<string, number>()
  const served = (id: string): number => {
    const known = memo.get(id)
    if (known !== undefined) return known
    const { kind } = byId.get(id) as DesignNode
    const members = new Map<string, string[]>()
    for (const t of uniqueTargets(graph, id)) {
      const group = groupOf((byId.get(t) as DesignNode).kind)
      members.set(group, [...(members.get(group) ?? []), t])
    }
    // Cada grupo recibe la petición entera; dentro de un grupo se reparte a partes iguales.
    const onward = Math.max(0, ...[...members.values()].map((ids) => ids.reduce((sum, t) => sum + served(t), 0) / ids.length))
    const share = DATA.includes(kind) ? 1
      : OFF_REQUEST.includes(kind) ? 0
      : ABSORBERS.includes(kind) ? hitRate + (1 - hitRate) * onward
      : onward
    memo.set(id, share)
    return share
  }
  return Math.min(...graph.nodes.filter((n) => n.kind === 'client').map((n) => served(n.id)))
}

function propagate(graph: Graph, scenario: Scenario, hitRate: number): Map<string, Load> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const loads = new Map(graph.nodes.map((n): [string, Load] => [n.id, { reads: 0, writes: 0, hotReads: 0 }]))
  const load = (id: string) => loads.get(id) as Load
  const kindOf = (id: string) => (byId.get(id) as DesignNode).kind
  const queueShare = scenario.writeRps > 0 ? (scenario.meanWriteRps ?? scenario.writeRps) / scenario.writeRps : 1

  for (const client of graph.nodes.filter((n) => n.kind === 'client')) {
    loads.set(client.id, { reads: scenario.readRps, writes: scenario.writeRps, hotReads: 0 })
  }

  for (const id of topologicalOrder(graph)) {
    const node = byId.get(id) as DesignNode
    const own = load(id)
    if (node.visitCounter) own.writes += own.reads
    const targets = uniqueTargets(graph, id)

    if (DATA.includes(node.kind)) {
      if (node.kind === 'sql') {
        for (const replica of targets.filter((t) => kindOf(t) === 'replica')) load(replica).writes += own.writes
      }
      continue
    }

    const outReads = node.kind === 'queue' ? 0 : ABSORBERS.includes(node.kind) ? own.reads * (1 - hitRate) : own.reads
    const outWrites = node.kind === 'queue' ? own.writes * queueShare : own.writes
    const hasCache = targets.some((t) => kindOf(t) === 'cache')
    const readsCarried = carriedBy(graph, targets, ABSORBERS)
    const writesCarried = carriedBy(graph, targets, [...ABSORBERS, 'queue'])

    for (const group of new Set(targets.map((t) => groupOf(kindOf(t))))) {
      const members = targets.filter((t) => groupOf(kindOf(t)) === group)
      const replicas = members.filter((t) => kindOf(t) === 'replica')
      const primaries = members.filter((t) => kindOf(t) !== 'replica')
      const readers = (replicas.length > 0 ? replicas : primaries).filter((t) => !readsCarried.has(t))
      const writers = (primaries.length > 0 ? primaries : replicas).filter((t) => !writesCarried.has(t))
      const isData = DATA.includes(kindOf(members[0]))
      const reads = hasCache && isData ? outReads * (1 - hitRate) : outReads
      for (const t of readers) {
        load(t).reads += reads / readers.length
        if (isData) load(t).hotReads += reads * scenario.hotKeyShare
      }
      for (const t of writers) load(t).writes += outWrites / writers.length
    }
  }
  return loads
}

function nodeMetrics(node: DesignNode, { reads, writes, hotReads }: Load, hotKeyShare: number): NodeMetrics {
  const spec = PIECES[node.kind]
  const spreadReads = DATA.includes(node.kind) ? reads * (1 - hotKeyShare) : reads
  const utilization =
    (hotReads * HOT_READ_WEIGHT) / spec.capacityRps + (spreadReads + writes) / (spec.capacityRps * node.instances)
  return {
    readRps: reads,
    writeRps: writes,
    utilization,
    saturated: utilization >= 1,
    latencyMs: spec.latencyMs / (1 - Math.min(utilization, MAX_LATENCY_UTILIZATION)),
  }
}

export function designCost(design: Design): number {
  return design.nodes.reduce((total, n) => total + PIECES[n.kind].monthlyCost * n.instances, 0)
}

export function simulate(design: Design, scenario: Scenario): SimResult {
  const [invalid] = validateDesign(design)
  if (invalid) throw new Error(invalid.message, { cause: invalid })

  const graph = applyDown(design, scenario.down)
  const hitRate = Math.max(MIN_HIT_RATE, scenario.hotKeyShare)
  const loads = propagate(graph, scenario, hitRate)
  const lostReads = scenario.readRps > 0 ? 1 - servedReads(graph, hitRate) : 0
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const live = new Map(
    graph.nodes.map((n) => [n.id, nodeMetrics(n, loads.get(n.id) as Load, scenario.hotKeyShare)]),
  )

  const requestTargets = (id: string, kind: PieceKind) => {
    if (DATA.includes(kind)) return []
    const targets = uniqueTargets(graph, id)
    const carried = carriedBy(graph, targets, ABSORBERS)
    return targets.flatMap((to) => {
      const target = byId.get(to) as DesignNode
      const { readRps, writeRps } = live.get(to) as NodeMetrics
      return !carried.has(to) && !OFF_REQUEST.includes(target.kind) && readRps + writeRps > 0 ? [target] : []
    })
  }

  // `miss` es la parte de las peticiones que sigue tras una caché o un CDN: 1 para el peor caso.
  const pathMsFor = (miss: number) => {
    const memo = new Map<string, number>()
    const pathMs = (node: DesignNode): number => {
      const known = memo.get(node.id)
      if (known !== undefined) return known
      const targets = requestTargets(node.id, node.kind)
      const caches = targets.filter((t) => t.kind === 'cache')
      const others = targets.filter((t) => t.kind !== 'cache')
      const passing = ABSORBERS.includes(node.kind) || caches.length > 0 ? miss : 1
      const total =
        (live.get(node.id) as NodeMetrics).latencyMs +
        caches.reduce((sum, t) => sum + pathMs(t), 0) +
        passing * Math.max(0, ...others.map(pathMs))
      memo.set(node.id, total)
      return total
    }
    return pathMs
  }

  const clients = graph.nodes.filter((n) => n.kind === 'client')
  const target = design.nodes.find((n) => n.id === scenario.down)
  const requests = scenario.readRps + scenario.writeRps
  let lostRequests = 0
  if (target && SERVERS.includes(target.kind) && !isBalanced(design, target.id) && requests > 0) {
    const before = propagate({ ...design, stranded: [] }, scenario, hitRate).get(target.id) as Load
    lostRequests = (before.reads + before.writes) / target.instances / requests
  }
  const stranded = graph.stranded.some((id) => {
    const load = loads.get(id)
    return load && load.reads + load.writes > 0
  })
  const errors = graph.nodes
    .filter((n) => !NEVER_BLOCKS.includes(n.kind))
    .map((n) => (live.get(n.id) as NodeMetrics).utilization)
    .map((utilization) => (utilization >= 1 ? 1 - 1 / utilization : 0))

  let bottleneckId: string | null = null
  let highest = 0
  for (const [id, { utilization }] of live) {
    if (!NEVER_BLOCKS.includes((byId.get(id) as DesignNode).kind) && utilization > highest) {
      highest = utilization
      bottleneckId = id
    }
  }

  return {
    scenarioId: scenario.id,
    nodes: Object.fromEntries(design.nodes.map((n) => [n.id, live.get(n.id) ?? DOWN_METRICS])),
    p99Ms: Math.max(...clients.map(pathMsFor(1))),
    meanMs: Math.max(...clients.map(pathMsFor(1 - hitRate))),
    errorRate: stranded ? 1 : Math.min(1, Math.max(...errors, lostReads, lostRequests)),
    monthlyCost: designCost(design),
    bottleneckId,
  }
}
