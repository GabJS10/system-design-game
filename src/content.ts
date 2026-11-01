export type MapNode = {
  id: string
  type: 'leccion' | 'mision'
  title: string
  available: boolean
  links: string[] // ids de las lecciones relacionadas (solo en misiones, según la nota 18)
}

// Títulos de la tabla "Las lecciones" del diseño; los ids sin lección real usan `tema-N`.
const LESSONS: [id: string, title: string][] = [
  ['tema-1', 'Escalabilidad'],
  ['tema-2', 'Rendimiento'],
  ['latency', 'Latencia y throughput'],
  ['cap', 'CAP'],
  ['tema-5', 'Consistencia'],
  ['tema-6', 'Disponibilidad'],
  ['tema-7', 'DNS'],
  ['tema-8', 'CDN'],
  ['tema-9', 'Balanceadores'],
  ['tema-10', 'Proxy inverso'],
  ['tema-11', 'Capa de aplicación'],
  ['tema-12', 'Bases de datos'],
  ['cache', 'Caché'],
  ['tema-14', 'Asincronismo'],
  ['tema-15', 'Comunicación'],
  ['tema-16', 'Seguridad'],
  ['tema-17', 'Apéndice'],
]

// Enlaces tomados de las notas de cada ejercicio en la nota 18. La lectura de AWS no lista notas.
const MISSIONS_DATA: [id: string, title: string, links: string[]][] = [
  ['pastebin', 'Pastebin', ['tema-8', 'tema-12', 'cache', 'tema-17']],
  ['twitter', 'Twitter', ['tema-12', 'cache', 'tema-14']],
  ['rastreador', 'Rastreador web', ['tema-7', 'tema-12', 'tema-14']],
  ['mint', 'Mint.com', ['tema-12', 'tema-14', 'tema-16']],
  ['red-social', 'Red social', ['tema-11', 'tema-12']],
  ['clave-valor', 'Almacén clave-valor', ['tema-12', 'cache']],
  ['ranking-amazon', 'Ranking de ventas de Amazon', ['tema-12', 'tema-14']],
  ['aws', 'Escalar en AWS', []],
]

const AVAILABLE = new Set(['latency', 'cache', 'cap', 'pastebin'])

export const MAP_NODES: MapNode[] = [
  ...LESSONS.map(([id, title]): MapNode => ({ id, type: 'leccion', title, available: AVAILABLE.has(id), links: [] })),
  ...MISSIONS_DATA.map(([id, title, links]): MapNode => ({ id, type: 'mision', title, available: AVAILABLE.has(id), links })),
]
