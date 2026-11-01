import { PALETTE, PIECES } from '../../engine/components'
import type { PieceKind } from '../../engine/types'

type Props = { kinds?: PieceKind[]; disabled: boolean; onAdd: (kind: PieceKind) => void }

/** Siempre en el orden de PALETTE; `kinds` solo recorta qué piezas se ofrecen. */
export default function Palette({ kinds, disabled, onAdd }: Props) {
  const shown = PALETTE.filter((k) => !kinds || kinds.includes(k))
  return (
    <section className="palette" aria-labelledby="palette-title">
      <h2 id="palette-title">Piezas</h2>
      <ul>
        {shown.map((kind) => (
          <li key={kind}>
            <button type="button" disabled={disabled} onClick={() => onAdd(kind)} aria-describedby={`palette-${kind}`}>
              <span className="palette-name">Añadir {PIECES[kind].label}</span>
              <span className="palette-desc" id={`palette-${kind}`}>{PIECES[kind].description}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
