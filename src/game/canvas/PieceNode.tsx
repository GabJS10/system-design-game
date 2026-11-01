import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { PIECES } from '../../engine/components'
import type { DesignNode, NodeMetrics } from '../../engine/types'

export type PieceData = { node: DesignNode; metrics: NodeMetrics | null; connectable: boolean }
export type PieceFlowNode = Node<PieceData, 'piece'>

export const percent = (utilization: number) => `${Math.round(utilization * 100)} %`

export default function PieceNode({ data, selected }: NodeProps<PieceFlowNode>) {
  const { node, metrics, connectable } = data
  const spec = PIECES[node.kind]
  const saturated = metrics?.saturated === true
  return (
    <div className="piece" data-saturated={saturated} data-selected={selected} data-kind={node.kind}>
      {node.kind !== 'client' && <Handle type="target" position={Position.Left} isConnectable={connectable} />}
      <span className="piece-name">{spec.label}</span>
      <span className="piece-id">{node.id}</span>
      {node.kind !== 'client' && <span className="piece-info">{node.instances} {node.instances === 1 ? 'instancia' : 'instancias'}{node.visitCounter ? ' · con contador' : ''}</span>}
      {metrics && node.kind !== 'client' && (
        <span className="piece-load">
          Uso {percent(metrics.utilization)}
          {saturated && <strong> · Saturada</strong>}
        </span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={connectable} />
    </div>
  )
}
