import type { Design, DesignEdge, DesignError, PieceKind } from './types'

const STORAGE: PieceKind[] = ['sql', 'nosql', 'objectStore']
export const DATA: PieceKind[] = ['sql', 'replica', 'nosql', 'objectStore']
export const OFF_REQUEST: PieceKind[] = ['queue', 'worker', 'batch', 'warehouse']
const MAX_INSTANCES = 100

/** Piezas que toca una petición: el camino se detiene en los datos y en lo que trabaja después. */
export function requestReach({ nodes, edges }: Design): Set<string> {
  const stops = new Set(nodes.filter((n) => DATA.includes(n.kind) || OFF_REQUEST.includes(n.kind)).map((n) => n.id))
  const reached = new Set(nodes.filter((n) => n.kind === 'client').map((n) => n.id))
  for (const id of reached) {
    if (stops.has(id)) continue
    for (const edge of edges) if (edge.from === id) reached.add(edge.to)
  }
  return reached
}

// Quita repetidamente lo que no tiene entradas o salidas: solo sobreviven los ciclos.
function nodesInCycles(ids: string[], edges: DesignEdge[]): string[] {
  const remaining = new Set(ids)
  let changed = true
  while (changed) {
    changed = false
    const alive = edges.filter((e) => remaining.has(e.from) && remaining.has(e.to))
    for (const id of remaining) {
      if (!alive.some((e) => e.to === id) || !alive.some((e) => e.from === id)) {
        remaining.delete(id)
        changed = true
      }
    }
  }
  return [...remaining]
}

export function validateDesign(design: Design): DesignError[] {
  const { nodes, edges } = design
  const errors: DesignError[] = []

  const clients = nodes.filter((n) => n.kind === 'client')
  if (clients.length === 0) {
    errors.push({ code: 'no-client', message: 'Falta el nodo de usuarios: sin él no llega tráfico.', nodeIds: [] })
  }
  if (clients.length > 1) {
    errors.push({ code: 'many-clients', message: 'Solo puede haber un nodo de usuarios.', nodeIds: clients.map((n) => n.id) })
  }

  const ids = new Set(nodes.map((n) => n.id))
  const dangling = edges.filter((e) => !ids.has(e.from) || !ids.has(e.to))
  if (dangling.length > 0) {
    errors.push({
      code: 'dangling-edge',
      message: 'Hay conexiones que apuntan a una pieza que no existe.',
      nodeIds: [...new Set(dangling.flatMap((e) => [e.from, e.to]).filter((id) => ids.has(id)))],
    })
  }

  const cycle = nodesInCycles(nodes.map((n) => n.id), edges)
  if (cycle.length > 0) {
    errors.push({ code: 'cycle', message: 'Hay un ciclo: las peticiones darían vueltas sin terminar.', nodeIds: cycle })
  }

  const orphans = nodes
    .filter((n) => !edges.some((e) => e.from === n.id || e.to === n.id))
    .map((n) => n.id)
  if (orphans.length > 0) {
    errors.push({ code: 'orphan', message: 'Hay piezas sin conectar.', nodeIds: orphans })
  }

  const storage = nodes.filter((n) => STORAGE.includes(n.kind))
  const reached = requestReach(design)
  if (storage.length === 0) {
    errors.push({ code: 'no-storage', message: 'Falta un lugar donde guardar los datos.', nodeIds: [] })
  } else if (clients.length > 0 && !storage.some((n) => reached.has(n.id))) {
    errors.push({
      code: 'unreachable-storage',
      message: 'Las peticiones de los usuarios no llegan a ningún almacenamiento.',
      nodeIds: storage.map((n) => n.id),
    })
  }

  const badInstances = nodes
    .filter((n) => !Number.isInteger(n.instances) || n.instances < 1 || n.instances > MAX_INSTANCES)
    .map((n) => n.id)
  if (badInstances.length > 0) {
    errors.push({
      code: 'bad-instances',
      message: `Cada pieza necesita entre 1 y ${MAX_INSTANCES} instancias, en números enteros.`,
      nodeIds: badInstances,
    })
  }

  return errors
}
