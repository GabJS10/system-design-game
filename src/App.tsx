import { MAP_NODES } from './content'
import { GameProvider, useRoute } from './game/store'
import MapScreen from './game/map/MapScreen'

function UnderConstruction({ id }: { id: string }) {
  const title = MAP_NODES.find((n) => n.id === id)?.title ?? id
  return (
    <main className="page">
      <h1>{title}</h1>
      <p>En construcción.</p>
      <a href="#/">Volver al mapa</a>
    </main>
  )
}

function Router() {
  const route = useRoute()
  const [, kind, id] = route.split('/')
  if ((kind === 'mision' || kind === 'leccion') && id) return <UnderConstruction id={decodeURIComponent(id)} />
  return <MapScreen />
}

export default function App() {
  return (
    <GameProvider>
      <Router />
    </GameProvider>
  )
}
