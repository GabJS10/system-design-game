import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { loadSave, writeSave, type Save } from '../save'

type Game = { save: Save; update: (fn: (s: Save) => Save) => void; warning: string | null }

const GameContext = createContext<Game | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => loadSave(localStorage))
  const [save, setSave] = useState(initial.save)
  const current = useRef(initial.save)

  const update = useCallback((fn: (s: Save) => Save) => {
    current.current = fn(current.current)
    setSave(current.current)
    writeSave(localStorage, current.current)
  }, [])

  return <GameContext value={{ save, update, warning: initial.warning }}>{children}</GameContext>
}

export function useGame(): Game {
  const game = useContext(GameContext)
  if (!game) throw new Error('useGame necesita un GameProvider')
  return game
}

// Rutas por hash: #/, #/mision/:id, #/leccion/:id
export function navigate(route: string): void {
  location.hash = route.startsWith('#') ? route : `#${route}`
}

export function useRoute(): string {
  const read = () => location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return route
}
