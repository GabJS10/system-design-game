export type PieceKind =
  | 'client'
  | 'dns'
  | 'cdn'
  | 'lb'
  | 'web'
  | 'api'
  | 'cache'
  | 'sql'
  | 'replica'
  | 'nosql'
  | 'objectStore'
  | 'queue'
  | 'worker'
  | 'batch'
  | 'warehouse'

export type PieceSpec = {
  kind: PieceKind
  label: string
  capacityRps: number
  latencyMs: number
  monthlyCost: number
  managed: boolean
  description: string
}

// `x` e `y` solo son posición en el lienzo: la simulación y la evaluación los ignoran.
export type DesignNode = { id: string; kind: PieceKind; instances: number; visitCounter?: boolean; x?: number; y?: number }
export type DesignEdge = { from: string; to: string }
export type Design = { nodes: DesignNode[]; edges: DesignEdge[] }

export type DesignError = {
  code:
    | 'no-client'
    | 'many-clients'
    | 'dangling-edge'
    | 'cycle'
    | 'orphan'
    | 'no-storage'
    | 'unreachable-storage'
    | 'bad-instances'
  message: string
  nodeIds: string[]
}

export type Scenario = {
  id: string
  name: string
  readRps: number
  writeRps: number
  hotKeyShare: number
  meanWriteRps?: number
  down?: string
}

export type NodeMetrics = {
  readRps: number
  writeRps: number
  utilization: number
  saturated: boolean
  latencyMs: number
}

export type SimResult = {
  scenarioId: string
  nodes: Record<string, NodeMetrics>
  p99Ms: number
  meanMs: number
  errorRate: number
  monthlyCost: number
  bottleneckId: string | null
}
