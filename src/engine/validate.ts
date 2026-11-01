import type { Design, DesignEdge, DesignError, PieceKind } from './types'

const STORAGE: PieceKind[] = ['sql', 'nosql', 'objectStore']
const MAX_INSTANCES = 100

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

  if (!nodes.some((n) => n.kind === 'client')) {
    errors.push({ code: 'no-client', message: 'Falta el nodo de usuarios: sin él no llega tráfico.', nodeIds: [] })
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

  if (!nodes.some((n) => STORAGE.includes(n.kind))) {
    errors.push({ code: 'no-storage', message: 'Falta un lugar donde guardar los datos.', nodeIds: [] })
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
