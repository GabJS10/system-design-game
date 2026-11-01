import { useState } from 'react'
import { isStuck, starCap, type HintLevel, type HintSet, type HintUse, type StuckSignals } from '../../engine/hints'

const LEVELS: HintLevel[] = [1, 2, 3]
const NAMES: Record<HintLevel, string> = { 1: 'Orientar', 2: 'Señalar', 3: 'Encaminar' }
const COST: Record<HintLevel, string> = {
  1: 'Gratis.',
  2: 'Abrirlo limita este intento a 2 estrellas como máximo.',
  3: 'Abrirlo limita este intento a 1 estrella como máximo.',
}

type Props = {
  hintSet: HintSet | null
  signals: StuckSignals
  free: boolean
  onUse: (u: HintUse) => void
  /** Pistas ya usadas en el intento: restauran lo abierto al recargar y fijan el tope de estrellas. */
  used?: HintUse[]
}

export default function HintPanel({ hintSet, signals, free, onUse, used = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<HintUse[]>([])
  const [confirming, setConfirming] = useState<HintLevel | null>(null)
  const all = [...used, ...local]
  const opened = (level: HintLevel) => hintSet !== null && all.some((u) => u.key === hintSet.key && u.level === level)

  const reveal = (level: HintLevel) => {
    if (!hintSet || opened(level)) return
    const use = { key: hintSet.key, level }
    setLocal((l) => [...l, use])
    setConfirming(null)
    onUse(use)
  }
  const ask = (level: HintLevel) => (free || level === 1 ? reveal(level) : setConfirming(level))

  return (
    <aside className="hints" aria-label="Pistas">
      <h2>Ayuda</h2>
      {isStuck(signals) && !open && (
        <p className="hint-notice" role="status">Parece que te has atascado. Si quieres, puedes pedir una pista.</p>
      )}
      {!free && <p className="hint-cap">Tope actual: {starCap(all)} de 3 estrellas</p>}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}>Pedir pista</button>
      ) : !hintSet ? (
        <p>No hay una pista escrita para esta situación.</p>
      ) : (
        <ol className="hint-levels">
          {LEVELS.map((level) => (
            <li key={level}>
              <h3>Nivel {level}: {NAMES[level]}</h3>
              {opened(level) ? (
                <p className="hint-text">{hintSet.texts[level - 1]}</p>
              ) : confirming === level ? (
                <div role="alertdialog" aria-label={`Confirmar nivel ${level}`}>
                  <p>{COST[level]} ¿Quieres abrirlo?</p>
                  <button type="button" onClick={() => reveal(level)}>Sí, abrir nivel {level}</button>{' '}
                  <button type="button" onClick={() => setConfirming(null)}>No</button>
                </div>
              ) : (
                <>
                  {!free && <p className="hint-cost">{COST[level]}</p>}
                  <button type="button" onClick={() => ask(level)}>Abrir nivel {level}</button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
