import type { PieceKind, PieceSpec } from './types'

// Valores ficticios pero plausibles; la misión de Pastebin los calibra con sus pruebas.
const piece = (
  kind: PieceKind,
  label: string,
  capacityRps: number,
  latencyMs: number,
  monthlyCost: number,
  managed: boolean,
  description: string,
): PieceSpec => ({ kind, label, capacityRps, latencyMs, monthlyCost, managed, description })

export const PIECES: Record<PieceKind, PieceSpec> = {
  client: piece('client', 'Usuarios', Number.POSITIVE_INFINITY, 0, 0, true, 'Origen de todas las peticiones.'),
  dns: piece('dns', 'DNS', 1_000_000, 1, 50, true, 'Traduce nombres de dominio a direcciones.'),
  cdn: piece('cdn', 'CDN', 500_000, 5, 300, true, 'Sirve contenido desde cerca del usuario.'),
  lb: piece('lb', 'Balanceador', 100_000, 1, 100, true, 'Reparte peticiones entre servidores.'),
  web: piece('web', 'Servidor web', 2_000, 2, 100, false, 'Recibe peticiones y escribe los logs de acceso.'),
  api: piece('api', 'API', 1_000, 10, 150, false, 'Ejecuta la lógica de la aplicación.'),
  cache: piece('cache', 'Caché en memoria', 50_000, 1, 200, false, 'Guarda datos calientes en RAM.'),
  sql: piece('sql', 'Base SQL', 1_200, 10, 500, false, 'Base relacional; atiende escrituras y lecturas.'),
  replica: piece('replica', 'Réplica de lectura', 1_200, 10, 400, false, 'Copia de la base SQL para repartir lecturas.'),
  nosql: piece('nosql', 'Base NoSQL', 1_500, 8, 450, false, 'Almacén distribuido consultado por clave.'),
  objectStore: piece('objectStore', 'Almacenamiento de objetos', 5_000, 20, 150, true, 'Guarda archivos y contenido grande.'),
  queue: piece('queue', 'Cola', 20_000, 2, 100, false, 'Separa el trabajo de la petición que lo origina.'),
  worker: piece('worker', 'Worker', 200, 50, 100, false, 'Procesa trabajo en segundo plano.'),
  batch: piece('batch', 'Proceso por lotes', 20_000, 1_000, 250, false, 'Procesa datos acumulados, como los logs.'),
  warehouse: piece('warehouse', 'Almacén de datos', 100, 500, 400, false, 'Guarda datos para análisis.'),
}

export const PALETTE: PieceKind[] = [
  'dns',
  'cdn',
  'lb',
  'web',
  'api',
  'cache',
  'sql',
  'replica',
  'nosql',
  'objectStore',
  'queue',
  'worker',
  'batch',
  'warehouse',
]
