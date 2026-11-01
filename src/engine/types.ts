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

export type DesignNode = { id: string; kind: PieceKind; instances: number; visitCounter?: boolean }
export type DesignEdge = { from: string; to: string }
export type Design = { nodes: DesignNode[]; edges: DesignEdge[] }

export type DesignError = {
  code: 'no-client' | 'cycle' | 'orphan' | 'no-storage' | 'bad-instances'
  message: string
  nodeIds: string[]
}
