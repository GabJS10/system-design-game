import { MAP_NODES } from '../content'

export type Route = { screen: 'mapa' } | { screen: 'mision' | 'leccion'; id: string }

// Solo se abre un nodo disponible cuyo tipo coincide con la ruta; cualquier otra cosa vuelve al mapa.
// Sin decodeURIComponent: los ids son slugs y un hash mal formado nunca lanza.
export function parseRoute(route: string): Route {
  const parts = route.split('/')
  const [, kind, id] = parts
  if (parts.length !== 3 || parts[0] !== '' || (kind !== 'mision' && kind !== 'leccion')) return { screen: 'mapa' }
  const node = MAP_NODES.find((n) => n.id === id)
  return node?.available && node.type === kind ? { screen: kind, id: node.id } : { screen: 'mapa' }
}
