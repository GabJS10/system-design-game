import type { Mission } from '../engine/mission'
import type { Design, DesignNode, PieceKind } from '../engine/types'

const EXERCISE_URL = 'https://app.notion.com/p/402b43c51c9381559d63d940e507850b'
const CACHE_URL = 'https://app.notion.com/p/3fab43c51c938127b062d55184fdb76f'

const METADATA_KINDS: PieceKind[] = ['sql', 'nosql']
const CONTENT_KINDS: PieceKind[] = ['objectStore', 'nosql']

function reachableFromClient({ nodes, edges }: Design): Set<string> {
  const reached = new Set(nodes.filter((n) => n.kind === 'client').map((n) => n.id))
  for (const id of reached) {
    for (const edge of edges) if (edge.from === id) reached.add(edge.to)
  }
  return reached
}

const kindOf = (design: Design, id: string) => design.nodes.find((n) => n.id === id)?.kind

function separatesMetadataAndContent(design: Design): boolean {
  const reached = reachableFromClient(design)
  const live = design.nodes.filter((n) => reached.has(n.id))
  const metadata = live.filter((n) => METADATA_KINDS.includes(n.kind))
  const content = live.filter((n) => CONTENT_KINDS.includes(n.kind))
  return metadata.some((m) => content.some((c) => c.id !== m.id))
}

function balancesServers(design: Design): boolean {
  const hasBalancer = (node: DesignNode) =>
    design.edges.some((e) => e.to === node.id && kindOf(design, e.from) === 'lb')
  return (['web', 'api'] as const).every((kind) => {
    const servers = design.nodes.filter((n) => n.kind === kind)
    const several = servers.length > 1 || servers.some((n) => n.instances > 1)
    return !several || servers.every(hasBalancer)
  })
}

const connects = (design: Design, from: PieceKind[], to: PieceKind[]) =>
  design.edges.some(
    (e) => from.includes(kindOf(design, e.from) as PieceKind) && to.includes(kindOf(design, e.to) as PieceKind),
  )

function reference(webInstances: number, withCdn: boolean): Design {
  const single = (id: string, kind: PieceKind): DesignNode => ({ id, kind, instances: 1 })
  const entry = withCdn
    ? [
        { from: 'client', to: 'cdn' },
        { from: 'cdn', to: 'lb' },
      ]
    : [{ from: 'client', to: 'lb' }]
  return {
    nodes: [
      single('client', 'client'),
      ...(withCdn ? [single('cdn', 'cdn')] : []),
      single('lb', 'lb'),
      { id: 'web', kind: 'web', instances: webInstances },
      single('cache', 'cache'),
      single('sql', 'sql'),
      single('replica', 'replica'),
      single('objectStore', 'objectStore'),
      single('batch', 'batch'),
      single('worker', 'worker'),
    ],
    edges: [
      ...entry,
      { from: 'lb', to: 'web' },
      { from: 'web', to: 'cache' },
      { from: 'web', to: 'sql' },
      { from: 'web', to: 'objectStore' },
      { from: 'web', to: 'batch' },
      { from: 'sql', to: 'replica' },
      { from: 'worker', to: 'sql' },
    ],
  }
}

export const pastebin: Mission = {
  id: 'pastebin',
  title: 'Diseña Pastebin',
  questions: [
    {
      id: 'usuarios',
      text: '¿Quién usa el servicio y para qué?',
      answer: 'Unos 10 millones de usuarios anónimos pegan texto, reciben un enlace y lo comparten.',
      useful: true,
    },
    {
      id: 'contenido',
      text: '¿Qué se guarda y cuánto ocupa?',
      answer: 'Solo texto. Cada paste ocupa alrededor de 1,27 KB entre contenido y metadatos.',
      useful: true,
    },
    {
      id: 'caducidad',
      text: '¿Los pastes caducan?',
      answer: 'Por defecto no. El usuario puede poner una caducidad, y el servicio debe borrar los caducados.',
      useful: true,
    },
    {
      id: 'estadisticas',
      text: '¿Hacen falta estadísticas? ¿En tiempo real?',
      answer: 'Queremos visitas mensuales por página. No necesitan ser en tiempo real.',
      useful: true,
    },
    {
      id: 'cuentas',
      text: '¿Los usuarios tienen cuenta?',
      answer: 'No. Son anónimos, sin registro ni edición posterior.',
      useful: true,
    },
    {
      id: 'volumen',
      text: '¿Cuánto volumen hay al mes?',
      answer: '{escrituras} de pastes nuevos y {lecturas} de lecturas al mes. El tráfico no es uniforme.',
      useful: true,
    },
    {
      id: 'proporcion',
      text: '¿Qué proporción hay entre lecturas y escrituras?',
      answer: 'Unas {proporcion} lecturas por cada escritura.',
      useful: true,
    },
    {
      id: 'disponibilidad',
      text: '¿Qué disponibilidad se espera?',
      answer: 'Alta: seguir un enlace debe ser rápido y el servicio debe seguir en pie si falla una pieza.',
      useful: true,
    },
    {
      id: 'color',
      text: '¿De qué color será la interfaz?',
      answer: 'Eso no cambia la arquitectura. Lo verá el equipo de diseño.',
      useful: false,
    },
    {
      id: 'lenguaje',
      text: '¿En qué lenguaje se escribe el backend?',
      answer: 'Da igual a este nivel. Elige el equipo.',
      useful: false,
    },
    {
      id: 'nube',
      text: '¿Qué proveedor de nube usamos?',
      answer: 'Aún no está decidido, y no afecta al diseño de alto nivel.',
      useful: false,
    },
    {
      id: 'logotipo',
      text: '¿Cómo será el logotipo?',
      answer: 'Lo decide marketing. No afecta al sistema.',
      useful: false,
    },
  ],
  scope: [
    { id: 'pegar', label: 'Pegar texto y recibir un enlace', inScope: true },
    { id: 'leer', label: 'Leer un paste desde su enlace', inScope: true },
    { id: 'caducidad', label: 'Caducidad opcional', inScope: true },
    { id: 'estadisticas', label: 'Estadísticas mensuales de visitas', inScope: true },
    { id: 'borrar', label: 'Borrar los pastes caducados', inScope: true },
    { id: 'disponibilidad', label: 'Alta disponibilidad', inScope: true },
    { id: 'cuentas', label: 'Cuentas de usuario', inScope: false },
    { id: 'edicion', label: 'Editar un paste ya creado', inScope: false },
    { id: 'visibilidad', label: 'Elegir la visibilidad', inScope: false },
    { id: 'personalizado', label: 'Elegir un enlace personalizado', inScope: false },
  ],
  roles: [
    { id: 'metadatos', label: 'Metadatos', referenceKinds: ['sql'], acceptedKinds: METADATA_KINDS, noteUrl: EXERCISE_URL },
    {
      id: 'contenido',
      label: 'Contenido',
      referenceKinds: ['objectStore'],
      acceptedKinds: CONTENT_KINDS,
      noteUrl: EXERCISE_URL,
    },
    {
      id: 'populares',
      label: 'Lecturas populares',
      referenceKinds: ['cache'],
      acceptedKinds: ['cache', 'cdn'],
      noteUrl: CACHE_URL,
    },
    { id: 'reparto', label: 'Reparto de tráfico', referenceKinds: ['lb'], acceptedKinds: ['lb'], noteUrl: EXERCISE_URL },
    { id: 'estadisticas', label: 'Estadísticas', referenceKinds: ['batch'], acceptedKinds: ['batch'], noteUrl: EXERCISE_URL },
    { id: 'limpieza', label: 'Limpieza de caducados', referenceKinds: ['worker'], acceptedKinds: ['worker'], noteUrl: EXERCISE_URL },
  ],
  rules: [
    {
      id: 'separar',
      label: 'Metadatos y contenido en almacenes distintos',
      noteUrl: EXERCISE_URL,
      check: separatesMetadataAndContent,
    },
    {
      id: 'enlaces',
      label: 'Hay un método para generar los enlaces',
      noteUrl: EXERCISE_URL,
      check: (_, decisions) => Boolean(decisions.generacion),
    },
    {
      id: 'estadisticas',
      label: 'Estadísticas por lotes a partir de los logs de los servidores, sin contar visitas en la base',
      noteUrl: EXERCISE_URL,
      check: (design) => connects(design, ['web', 'api'], ['batch']) && !design.nodes.some((n) => n.visitCounter),
    },
    {
      id: 'caducidad',
      label: 'Un proceso borra los caducados del almacén de metadatos',
      noteUrl: EXERCISE_URL,
      check: (design) => connects(design, ['worker'], METADATA_KINDS),
    },
    {
      id: 'balanceo',
      label: 'Varios servidores necesitan un balanceador delante',
      noteUrl: EXERCISE_URL,
      check: balancesServers,
    },
  ],
  decisions: [
    {
      id: 'generacion',
      prompt: '¿Cómo generas el enlace corto?',
      options: [
        { id: 'md5', label: 'Hash MD5 codificado en Base62' },
        { id: 'contador', label: 'Contador global codificado en Base62' },
        { id: 'base64', label: 'Base64 sin escapar' },
      ],
      validOptionIds: ['md5', 'contador'],
      noteUrl: EXERCISE_URL,
    },
    {
      id: 'longitud',
      prompt: '¿Cuántos caracteres tiene el enlace? Debe alcanzar para 360 millones de enlaces en 3 años.',
      options: [
        { id: '4', label: '4 caracteres' },
        { id: '6', label: '6 caracteres' },
        { id: '7', label: '7 caracteres' },
        { id: '20', label: '20 caracteres' },
      ],
      validOptionIds: ['6', '7'],
      noteUrl: EXERCISE_URL,
    },
    {
      id: 'contenido',
      prompt: '¿Dónde guardas el contenido de cada paste?',
      options: [
        { id: 'objetos', label: 'En un almacenamiento de objetos gestionado' },
        { id: 'documentos', label: 'En una base de documentos NoSQL' },
        { id: 'tabla', label: 'En la misma tabla que los metadatos' },
        { id: 'archivos', label: 'En servidores de archivos propios' },
      ],
      validOptionIds: ['objetos', 'documentos'],
      noteUrl: EXERCISE_URL,
    },
  ],
  variants: [
    {
      id: 'base',
      monthlyWrites: 10_000_000,
      monthlyReads: 100_000_000,
      writeRps: 4,
      readRps: 40,
      storageGbPerMonth: 12.7,
      budget: 2500,
      reference: reference(2, false),
    },
    {
      id: 'lecturas',
      monthlyWrites: 10_000_000,
      monthlyReads: 1_000_000_000,
      writeRps: 4,
      readRps: 400,
      storageGbPerMonth: 12.7,
      budget: 2800,
      reference: reference(2, true),
    },
    {
      id: 'escrituras',
      monthlyWrites: 100_000_000,
      monthlyReads: 500_000_000,
      writeRps: 40,
      readRps: 200,
      storageGbPerMonth: 127,
      budget: 2600,
      reference: reference(3, false),
    },
  ],
  latencyTargetMs: 200,
  maxErrorRate: 0.001,
  relatedLessons: ['latency', 'cache'],
  growthNote:
    'Para seguir creciendo, mide, encuentra el cuello de botella y resuélvelo. Añade DNS y CDN delante, varios servidores web como proxy inverso tras los balanceadores y una capa de aplicación con APIs de lectura y de escritura. Las lecturas son lo primero que se escala: caché en memoria para los pastes populares y réplicas de lectura para los fallos de caché. Las escrituras las aguanta un maestro SQL con failover; si no bastara, recurre a federación, sharding, desnormalización o NoSQL. El contenido sigue en el almacenamiento de objetos, y las estadísticas pasan de los logs a un trabajo MapReduce que llena un almacén de datos.',
}
