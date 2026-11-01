import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { MAP_NODES, type MapNode } from '../../content'
import { dueReviews, exportSave, importSave, type Save } from '../../save'
import { navigate, useGame } from '../store'

const MAX_STARS = 3
const COLS = 6
const X_STEP = 210
const Y_STEP = 135

type NodeData = { node: MapNode; status: string; stars: number | null; due: boolean }

function MapNodeView({ data }: NodeProps<Node<NodeData>>) {
  const { node, status, stars, due } = data
  const kind = node.type === 'leccion' ? 'Lección' : 'Misión'
  const open = () => navigate(`/${node.type}/${node.id}`)
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <button
        type="button"
        className={`node nodrag nopan node-${node.type}`}
        data-available={node.available}
        data-node-id={node.id}
        aria-disabled={!node.available}
        onClick={node.available ? open : undefined}
      >
        <span className="node-kind">{kind}</span>
        <span className="node-title">{node.title}</span>
        <span className="node-status">
          {stars !== null && <span aria-hidden="true">{'★'.repeat(stars)}{'☆'.repeat(MAX_STARS - stars)} </span>}
          {status}
        </span>
        {due && <span className="node-due">Toca repetir</span>}
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  )
}

const nodeTypes = { game: MapNodeView }

function bestStars(save: Save, missionId: string): number | null {
  const results = save.attempts.filter((a) => a.missionId === missionId && a.result).map((a) => a.result!.stars)
  return results.length ? Math.min(MAX_STARS, Math.max(...results)) : null
}

function describe(n: MapNode, save: Save): { status: string; stars: number | null } {
  if (!n.available) return { status: 'Próximamente', stars: null }
  if (n.type === 'leccion') return { status: save.completedLessons.includes(n.id) ? 'Completada' : 'Disponible', stars: null }
  const stars = bestStars(save, n.id)
  return { status: stars === null ? 'Disponible' : `${stars} de ${MAX_STARS} estrellas`, stars }
}

export default function MapScreen() {
  const { save, update, warning } = useGame()
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const { nodes, edges } = useMemo(() => {
    const due = new Set(dueReviews(save, new Date()))
    let lessons = 0
    let missions = 0
    const nodes: Node<NodeData>[] = MAP_NODES.map((n) => {
      const i = n.type === 'leccion' ? lessons++ : missions++
      const position = n.type === 'leccion'
        ? { x: (i % COLS) * X_STEP, y: Math.floor(i / COLS) * Y_STEP }
        : { x: ((i % 4) + 1) * X_STEP, y: 3 * Y_STEP + 90 + Math.floor(i / 4) * Y_STEP }
      return { id: n.id, type: 'game', position, draggable: false, selectable: false, focusable: false, data: { node: n, ...describe(n, save), due: due.has(n.id) } }
    })
    const edges: Edge[] = MAP_NODES.flatMap((n) => n.links.map((l) => ({ id: `${l}-${n.id}`, source: l, target: n.id, selectable: false, focusable: false })))
    return { nodes, edges }
  }, [save])

  const onExport = () => {
    const url = URL.createObjectURL(new Blob([exportSave(save)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'progreso-diseno-de-sistemas.json' })
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const result = importSave(await file.text())
    if ('error' in result) return setNotice(result.error)
    if (!window.confirm('Importar sustituirá tu progreso actual por el del archivo. ¿Continuar?')) return
    update(() => result.save)
    setNotice('Progreso importado.')
  }

  return (
    <main className="map-page">
      <header className="map-header">
        <h1>Juego de diseño de sistemas</h1>
        <div className="actions">
          <button type="button" onClick={onExport}>Exportar progreso</button>
          <button type="button" onClick={() => fileInput.current?.click()}>Importar progreso</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport} aria-label="Archivo de progreso" />
        </div>
      </header>
      {warning && <p className="banner banner-warning" role="alert">{warning}</p>}
      {notice && <p className="banner" role="status">{notice}</p>}
      <div className="map" aria-label="Mapa de lecciones y misiones">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.4}
          proOptions={{ hideAttribution: true }}
        />
      </div>
    </main>
  )
}
