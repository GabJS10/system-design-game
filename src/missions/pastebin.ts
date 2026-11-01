import type { Decision, Mission } from '../engine/mission'
import { groupOf } from '../engine/simulate'
import type { Design, DesignNode, PieceKind } from '../engine/types'
import { DATA, OFF_REQUEST, requestReach } from '../engine/validate'

const EXERCISE_URL = 'https://app.notion.com/p/402b43c51c9381559d63d940e507850b'
const CACHE_URL = 'https://app.notion.com/p/3fab43c51c938127b062d55184fdb76f'

const METADATA_KINDS: PieceKind[] = ['sql', 'nosql']
const CONTENT_KINDS: PieceKind[] = ['objectStore', 'nosql']
const DATABASES: PieceKind[] = ['sql', 'replica', 'nosql']
const LOG_SOURCES: PieceKind[] = ['web', 'api']
const CLEANERS: PieceKind[] = ['worker', 'batch']

const kindOf = (design: Design, id: string) => design.nodes.find((n) => n.id === id)?.kind

/** Almacenes que toca cualquier lectura: cada grupo de destinos la recibe, pero solo un miembro de cada grupo. */
function storesOfEveryRead(design: Design): Set<PieceKind> {
  const memo = new Map<string, Set<PieceKind>>()
  const stores = (id: string): Set<PieceKind> => {
    const kind = kindOf(design, id) as PieceKind
    if (DATA.includes(kind)) return new Set([kind === 'replica' ? 'sql' : kind])
    if (OFF_REQUEST.includes(kind)) return new Set()
    const known = memo.get(id)
    if (known) return known
    const groups = new Map<string, Set<PieceKind>>()
    for (const { to } of design.edges.filter((e) => e.from === id)) {
      const group = groupOf(kindOf(design, to) as PieceKind)
      const reached = stores(to)
      const common = groups.get(group)
      groups.set(group, common ? new Set([...common].filter((k) => reached.has(k))) : reached)
    }
    const found = new Set([...groups.values()].flatMap((set) => [...set]))
    memo.set(id, found)
    return found
  }
  const client = design.nodes.find((n) => n.kind === 'client')
  return client ? stores(client.id) : new Set()
}

function separatesMetadataAndContent(design: Design): boolean {
  const stores = storesOfEveryRead(design)
  // Dos NoSQL del mismo grupo son shards de un solo almacén, no dos almacenes.
  return stores.has('objectStore') ? METADATA_KINDS.some((k) => stores.has(k)) : stores.has('sql') && stores.has('nosql')
}

/** Los logs salen de un servidor y pueden pasar por una cola o por archivos; leer la base no son logs. */
function logsReachBatch(design: Design): boolean {
  const live = requestReach(design)
  const seen = new Set(design.nodes.filter((n) => LOG_SOURCES.includes(n.kind) && live.has(n.id)).map((n) => n.id))
  for (const id of seen) {
    if (DATABASES.includes(kindOf(design, id) as PieceKind)) continue
    for (const edge of design.edges) if (edge.from === id) seen.add(edge.to)
  }
  return design.nodes.some((n) => n.kind === 'batch' && seen.has(n.id))
}

function cleansLiveMetadata(design: Design): boolean {
  const live = requestReach(design)
  return design.edges.some(
    (e) =>
      CLEANERS.includes(kindOf(design, e.from) as PieceKind) &&
      METADATA_KINDS.includes(kindOf(design, e.to) as PieceKind) &&
      live.has(e.to),
  )
}

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

const DECISIONS: Decision[] = [
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
]

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
      phase: 'diseno',
      check: separatesMetadataAndContent,
    },
    {
      id: 'enlaces',
      label: 'Hay un método para generar los enlaces',
      noteUrl: EXERCISE_URL,
      phase: 'decisiones',
      check: (_, decisions) => Boolean(decisions.generacion),
    },
    {
      id: 'decisiones',
      label: 'Las decisiones clave funcionan para este problema',
      noteUrl: EXERCISE_URL,
      phase: 'decisiones',
      check: (_, decisions) => DECISIONS.every((d) => d.validOptionIds.includes(decisions[d.id])),
    },
    {
      id: 'estadisticas',
      label: 'Estadísticas por lotes a partir de los logs de los servidores, sin contar visitas en la base',
      noteUrl: EXERCISE_URL,
      phase: 'diseno',
      check: (design) => logsReachBatch(design) && !design.nodes.some((n) => n.visitCounter),
    },
    {
      id: 'caducidad',
      label: 'Un proceso borra los caducados del almacén de metadatos',
      noteUrl: EXERCISE_URL,
      phase: 'diseno',
      check: cleansLiveMetadata,
    },
  ],
  decisions: DECISIONS,
  variants: [
    {
      id: 'base',
      monthlyWrites: 10_000_000,
      monthlyReads: 100_000_000,
      writeRps: 4,
      readRps: 40,
      storageGbPerMonth: 12.7,
      budget: 2090,
      reference: reference(2, false),
    },
    {
      id: 'lecturas',
      monthlyWrites: 10_000_000,
      monthlyReads: 1_000_000_000,
      writeRps: 4,
      readRps: 400,
      storageGbPerMonth: 12.7,
      budget: 2420,
      reference: reference(2, true),
    },
    {
      id: 'escrituras',
      monthlyWrites: 100_000_000,
      monthlyReads: 500_000_000,
      writeRps: 40,
      readRps: 200,
      storageGbPerMonth: 127,
      budget: 2150,
      reference: reference(3, false),
    },
  ],
  latencyTargetMs: 200,
  maxErrorRate: 0.001,
  relatedLessons: ['tema-8', 'tema-12', 'cache', 'tema-17'],
  growthNote:
    'Para seguir creciendo, mide, encuentra el cuello de botella y resuélvelo. Añade DNS y CDN delante, varios servidores web como proxy inverso tras los balanceadores y una capa de aplicación con APIs de lectura y de escritura. Las lecturas son lo primero que se escala: caché en memoria para los pastes populares y réplicas de lectura para los fallos de caché. Las escrituras las aguanta un maestro SQL con failover; si no bastara, recurre a federación, sharding, desnormalización o NoSQL. El contenido sigue en el almacenamiento de objetos, y las estadísticas pasan de los logs a un trabajo MapReduce que llena un almacén de datos.',
  hints: [
    {
      key: 'informe:*:*',
      texts: [
        '¿Qué preguntas te dan información que cambia el diseño y cuáles no?',
        'Fíjate en lo que dicen sobre volumen, caducidad y estadísticas; el color o el lenguaje no cambian la arquitectura.',
        'Antes de dibujar, deja claro qué entra en el alcance y qué queda fuera: lo que no se pregunta no se puede dimensionar.',
      ],
      lessonId: 'latency',
    },
    {
      key: 'estimacion:*:*',
      texts: [
        '¿Cuántas lecturas llegan por cada escritura y cuántas peticiones por segundo son en el caso medio?',
        'Pasa el volumen mensual a peticiones por segundo; el reparto entre lecturas y escrituras es muy desigual.',
        'Divide el volumen entre los segundos de un mes y compara el resultado con lo que aguanta una pieza; el pico multiplica ese tráfico.',
      ],
      lessonId: 'latency',
    },
    {
      key: 'simulacion:*:*',
      texts: [
        '¿Qué escenario falla primero y qué pieza llega antes al límite?',
        'Revisa que el diseño conecte al cliente con un almacenamiento y que no queden piezas sueltas.',
        'Sigue el camino de una petición desde el cliente hasta el dato y comprueba cada salto.',
      ],
      lessonId: 'latency',
    },
    {
      key: 'simulacion:pico:sql',
      texts: [
        '¿Qué pieza llega antes al límite cuando sube el tráfico?',
        'Las lecturas saturan la base de datos; el problema no son las escrituras.',
        'Necesitas evitar que las lecturas repetidas lleguen a la base. Después, comprueba qué pasa si lo que añadas deja de funcionar.',
      ],
      lessonId: 'cache',
    },
    {
      key: 'simulacion:viral:sql',
      texts: [
        '¿Qué le pasa a la base cuando casi todas las peticiones piden el mismo paste?',
        'Un paste viral concentra las lecturas en muy pocos datos y la base se satura repitiendo siempre la misma respuesta.',
        'Necesitas servir las lecturas repetidas sin pasar por la base. Después, revisa qué ocurre si esa ayuda deja de funcionar.',
      ],
      lessonId: 'cache',
    },
    {
      key: 'simulacion:*:web',
      texts: [
        '¿Cuántas peticiones llegan a tus servidores y hace falta que todas lleguen hasta ellos?',
        'Los servidores de aplicación se saturan con lecturas repetidas, aunque la base ya esté protegida.',
        'Necesitas que las lecturas populares no cuesten trabajo a los servidores cada vez que se piden.',
      ],
      lessonId: 'cache',
    },
    {
      key: 'simulacion:*:sql-escrituras',
      texts: [
        '¿Qué parte del tráfico que recibe la base es de escritura y cuál de lectura?',
        'Las escrituras saturan la base; aliviar las lecturas no lo arreglará.',
        'Necesitas repartir las escrituras entre varias máquinas de datos o elegir un almacén pensado para escalar al escribir.',
      ],
      lessonId: 'latency',
    },
    {
      key: 'simulacion:caida:*',
      texts: [
        '¿Qué pasa con el servicio si una pieza deja de responder?',
        'Hay piezas que, si se caen, dejan sin servicio a todos los usuarios.',
        'Necesitas redundancia en lo que hoy tiene una sola copia, y que el tráfico sepa repartirse entre las copias.',
      ],
      lessonId: 'latency',
    },
    {
      key: 'simulacion:caida:sql',
      texts: [
        '¿Qué pasa con los datos si la base deja de responder?',
        'Toda la información de los pastes depende de una sola copia.',
        'Necesitas que los datos existan en más de un sitio, de modo que el servicio siga si falla uno.',
      ],
      lessonId: 'latency',
    },
    {
      key: 'simulacion:caida:web',
      texts: [
        '¿Qué pasa con el servicio si el servidor que atiende las peticiones deja de responder?',
        'Hay un único servidor de aplicación y, sin él, nadie llega a los datos.',
        'Necesitas varias copias del servidor y algo que reparta el tráfico entre ellas.',
      ],
      lessonId: 'latency',
    },
    {
      key: 'simulacion:*:separar',
      texts: [
        '¿Todo lo que guardas se consulta y crece al mismo ritmo?',
        'Metadatos y contenido tienen formas y tamaños distintos, y hoy comparten almacén.',
        'Necesitas un almacén distinto para cada tipo de dato, cada uno adecuado a lo que guarda.',
      ],
    },
    {
      key: 'simulacion:*:enlaces',
      texts: [
        '¿Cómo se convierte un paste en un enlace corto que nadie más tenga?',
        'Falta decidir cómo se genera el identificador del enlace.',
        'Necesitas un método que dé identificadores cortos y únicos; contesta la decisión sobre la generación.',
      ],
    },
    {
      key: 'simulacion:*:estadisticas',
      texts: [
        '¿Hace falta contar cada visita en el mismo momento en que ocurre?',
        'Las estadísticas no son en tiempo real, y contarlas en la base añade una escritura a cada lectura.',
        'Necesitas procesar en diferido los registros de los servidores, sin tocar la base en cada visita.',
      ],
    },
    {
      key: 'simulacion:*:caducidad',
      texts: [
        '¿Quién borra un paste cuando llega su fecha de caducidad?',
        'Nadie recorre los metadatos para eliminar lo caducado.',
        'Necesitas un proceso en segundo plano que revise periódicamente los metadatos y borre lo que caducó.',
      ],
    },
    {
      key: 'simulacion:caida:balanceo',
      texts: [
        '¿Qué observas en el trabajo que recibe cada servidor cuando hay varios iguales?',
        'Tienes varias copias de los servidores, pero nada reparte el tráfico entre ellas.',
        'Necesitas un mecanismo que decida a qué servidor va cada petición.',
      ],
      lessonId: 'latency',
    },
    {
      key: 'simulacion:*:coste',
      texts: [
        '¿Qué piezas de tu diseño están muy por encima de lo que piden los escenarios?',
        'El diseño funciona, pero cuesta más que el presupuesto.',
        'Necesitas quitar capacidad donde sobra, sin perder lo que protege al servicio de los picos y de las caídas.',
      ],
    },
    {
      key: 'decisiones:*:*',
      texts: [
        '¿Qué datos de tu estimación respaldan esta decisión?',
        'Una buena decisión se justifica con el volumen y los requisitos de la misión.',
        'Descarta primero las opciones que no soportan el volumen o que rompen el enlace, y compara las que quedan.',
      ],
    },
    {
      key: 'decisiones:*:generacion',
      texts: [
        '¿Qué necesita un identificador para ser corto y no repetirse?',
        'Hay opciones que dan identificadores demasiado largos o con caracteres que rompen un enlace.',
        'Elige un método que produzca texto corto con letras y dígitos y que sea muy improbable que se repita.',
      ],
    },
    {
      key: 'decisiones:*:longitud',
      texts: [
        '¿Cuántos enlaces distintos caben con cada longitud de texto?',
        'Calcula las combinaciones posibles con letras y dígitos y compáralas con el total de enlaces de tres años.',
        'Elige la longitud más corta cuyo número de combinaciones supere ese total con holgura.',
      ],
    },
    {
      key: 'decisiones:*:contenido',
      texts: [
        '¿Qué tipo de dato es el contenido de un paste y qué almacén está pensado para guardarlo?',
        'Mezclar el contenido con los metadatos o montar servidores propios complica el crecimiento.',
        'Elige un almacén gestionado que escale solo con el tamaño del contenido.',
      ],
    },
  ],
}
