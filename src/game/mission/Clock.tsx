import { useEffect, useState } from 'react'

const LIMIT_MS = 45 * 60_000

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Pasados los 45 minutos sigue contando: cambia de color y de texto, sin bloquear nada. */
export default function Clock({ startedAt }: { startedAt: string }) {
  const now = useNow(1000)
  const elapsed = Math.max(0, now - Date.parse(startedAt))
  const over = elapsed > LIMIT_MS
  return (
    <p className={`clock${over ? ' clock-over' : ''}`} role="timer">
      Tiempo: <strong>{mmss(elapsed)}</strong> de 45:00{over && ' (te pasaste del tiempo recomendado; puedes seguir)'}
    </p>
  )
}
