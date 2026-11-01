import { useMemo, useState } from 'react'
import {
  Background,
  MarkerType,
  ReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react'
import { PIECES } from '../../engine/components'
import type { Design, PieceKind, SimResult } from '../../engine/types'
import { validateDesign } from '../../engine/validate'
import { addEdge, addNode, moveNode, nextNodeId, removeEdge, removeNode, setInstances, setVisitCounter } from './designChanges'
import Palette from './Palette'
import PieceNode, { percent, type PieceFlowNode } from './PieceNode'

type Props = {
  design: Design
  onChange: (design: Design) => void
  result: SimResult | null
  locked: boolean
  allowedKinds?: PieceKind[]
}

const nodeTypes = { piece: PieceNode }
const COLS = 4
const X_STEP = 230
const Y_STEP = 130
const MIN_INSTANCES = 1
const MAX_INSTANCES = 100
const COUNTER_KINDS: PieceKind[] = ['sql', 'nosql']

const slot = (i: number) => ({ x: (i % COLS) * X_STEP, y: Math.floor(i / COLS) * Y_STEP })
const hasLoad = (m?: { readRps: number; writeRps: number }) => m !== undefined && m.readRps + m.writeRps > 0

export default function DesignCanvas({ design, onChange, result, locked, allowedKinds }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [target, setTarget] = useState('')
  const [draft, setDraft] = useState<string | null>(null)

  const selected = design.nodes.find((n) => n.id === selectedId) ?? null
  const errors = useMemo(() => validateDesign(design), [design])
  const name = (id: string) => {
    const n = design.nodes.find((x) => x.id === id)
    return n ? `${PIECES[n.kind].label} (${n.id})` : id
  }

  const flowNodes = useMemo<PieceFlowNode[]>(() => design.nodes.map((node, i) => {
    const metrics = result?.nodes[node.id] ?? null
    const spec = PIECES[node.kind]
    const usage = metrics && node.kind !== 'client' ? `, uso ${percent(metrics.utilization)}${metrics.saturated ? ', saturada' : ''}` : ''
    return {
      id: node.id,
      type: 'piece',
      position: { x: node.x ?? slot(i).x, y: node.y ?? slot(i).y },
      selected: node.id === selectedId,
      deletable: node.kind !== 'client' && !locked,
      draggable: !locked,
      ariaLabel: `${spec.label}, ${node.id}${usage}`,
      data: { node, metrics, connectable: !locked },
    }
  }), [design.nodes, result, selectedId, locked])

  const flowEdges = useMemo<Edge[]>(() => design.edges.map((e) => ({
    id: `${e.from}>${e.to}`,
    source: e.from,
    target: e.to,
    animated: hasLoad(result?.nodes[e.from]) && hasLoad(result?.nodes[e.to]),
    focusable: false,
    markerEnd: { type: MarkerType.ArrowClosed },
  })), [design.edges, result])

  const commit = (next: Design, message?: string) => {
    if (next === design) return
    onChange(next)
    if (message) setAnnouncement(message)
  }

  const onAdd = (kind: PieceKind) => {
    const id = nextNodeId(design, kind)
    const { x, y } = slot(design.nodes.length)
    commit(addNode(design, kind, x, y), `Añadida la pieza ${PIECES[kind].label} (${id}).`)
    setSelectedId(id)
    setTarget('')
    setDraft(null)
  }

  const select = (id: string | null) => {
    setSelectedId(id)
    setTarget('')
    setDraft(null)
  }

  const onNodesChange = (changes: NodeChange<PieceFlowNode>[]) => {
    let next = design
    for (const c of changes) {
      if (c.type === 'select' && c.selected) select(c.id)
      else if (locked) continue
      else if (c.type === 'position' && c.position) next = moveNode(next, c.id, c.position.x, c.position.y)
      else if (c.type === 'remove') next = removeNode(next, c.id)
    }
    commit(next)
  }

  const onConnect = (c: Connection) => commit(addEdge(design, c.source, c.target), `Conectadas ${name(c.source)} y ${name(c.target)}.`)

  const deleteSelected = () => {
    if (!selected) return
    commit(removeNode(design, selected.id), `Borrada la pieza ${name(selected.id)}.`)
    select(null)
  }

  const candidates = selected
    ? design.nodes.filter((n) => n.kind !== 'client' && n.id !== selected.id && !design.edges.some((e) => e.from === selected.id && e.to === n.id))
    : []
  const links = selected ? design.edges.filter((e) => e.from === selected.id || e.to === selected.id) : []
  const instancesText = draft ?? String(selected?.instances ?? '')
  const instancesInvalid = draft !== null && !(Number.isInteger(Number(draft)) && draft.trim() !== '' && Number(draft) >= MIN_INSTANCES && Number(draft) <= MAX_INSTANCES)

  return (
    <div className="canvas-layout">
      <Palette kinds={allowedKinds} disabled={locked} onAdd={onAdd} />
      <div className="canvas" aria-label="Lienzo de diseño">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          isValidConnection={(c) => addEdge(design, c.source, c.target) !== design}
          onPaneClick={() => select(null)}
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          edgesFocusable={false}
          deleteKeyCode={locked ? null : ['Backspace', 'Delete']}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.4}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
        </ReactFlow>
      </div>
      <aside className="side" aria-label="Panel de diseño">
        {locked && <p className="side-note">Diseño bloqueado: ya no se puede editar.</p>}
        <section aria-labelledby="pieces-title">
          <h2 id="pieces-title">Piezas del diseño</h2>
          <ul className="piece-list">
            {design.nodes.map((n) => (
              <li key={n.id}>
                <button type="button" aria-pressed={n.id === selectedId} onClick={() => select(n.id)}>{name(n.id)}</button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="selected-title">
          <h2 id="selected-title">Pieza seleccionada</h2>
          {!selected && <p>Elige una pieza del lienzo o de la lista para configurarla.</p>}
          {selected && (
            <fieldset disabled={locked} className="selected">
              <legend>{name(selected.id)}</legend>
              <p>{PIECES[selected.kind].description}</p>
              {selected.kind !== 'client' && (
                <label>
                  Instancias (de {MIN_INSTANCES} a {MAX_INSTANCES})
                  <input
                    type="number"
                    min={MIN_INSTANCES}
                    max={MAX_INSTANCES}
                    step={1}
                    value={instancesText}
                    aria-invalid={instancesInvalid}
                    aria-describedby={instancesInvalid ? 'instances-error' : undefined}
                    onBlur={() => setDraft(null)}
                    onChange={(e) => {
                      setDraft(e.target.value)
                      commit(setInstances(design, selected.id, Number(e.target.value === '' ? Number.NaN : e.target.value)))
                    }}
                  />
                </label>
              )}
              {instancesInvalid && <p id="instances-error" role="alert" className="error">Las instancias deben ser un entero entre {MIN_INSTANCES} y {MAX_INSTANCES}.</p>}
              {COUNTER_KINDS.includes(selected.kind) && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.visitCounter === true}
                    onChange={(e) => commit(setVisitCounter(design, selected.id, e.target.checked))}
                  />
                  Contador de visitas
                </label>
              )}
              <div className="connect">
                <label>
                  Conectar con
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Elige una pieza</option>
                    {candidates.map((n) => <option key={n.id} value={n.id}>{name(n.id)}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!target}
                  onClick={() => {
                    commit(addEdge(design, selected.id, target), `Conectadas ${name(selected.id)} y ${name(target)}.`)
                    setTarget('')
                  }}
                >
                  Conectar
                </button>
              </div>
              {links.length > 0 && (
                <ul className="links" aria-label="Conexiones de la pieza">
                  {links.map((e) => (
                    <li key={`${e.from}>${e.to}`}>
                      <span>{name(e.from)} → {name(e.to)}</span>
                      <button
                        type="button"
                        aria-label={`Quitar la conexión de ${name(e.from)} a ${name(e.to)}`}
                        onClick={() => commit(removeEdge(design, e.from, e.to), `Quitada la conexión de ${name(e.from)} a ${name(e.to)}.`)}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected.kind !== 'client' && <button type="button" className="danger" onClick={deleteSelected}>Borrar pieza</button>}
            </fieldset>
          )}
        </section>
        <section aria-labelledby="errors-title">
          <h2 id="errors-title">Problemas del diseño</h2>
          {errors.length === 0 ? (
            <p>Sin problemas de estructura.</p>
          ) : (
            <ul className="errors">
              {errors.map((e) => (
                <li key={e.code}>
                  {e.message}
                  {e.nodeIds.length > 0 && <span className="errors-nodes"> Afecta a: {e.nodeIds.map(name).join(', ')}.</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      </aside>
    </div>
  )
}
