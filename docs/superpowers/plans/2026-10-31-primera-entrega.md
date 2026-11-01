# Primera entrega del juego de diseño de sistemas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar una versión jugable con mapa, simulador, pistas, la misión de Pastebin y las lecciones 3, 13 y 4.

**Architecture:** Aplicación estática de Vite y React. El motor y las pistas son TypeScript puro, sin React, y se prueban con Vitest. Las misiones y lecciones son datos; React solo los presenta. El progreso se guarda en `localStorage`.

**Tech Stack:** Vite, React, TypeScript, `@xyflow/react`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-system-design-game-design.md`

## Global Constraints

- Todo el texto visible está en español; el nombre interno de código puede ir en inglés.
- Pensado para escritorio; sin soporte móvil en esta entrega.
- Sin servidor, cuentas, IA ni llamadas a Notion en tiempo de ejecución. Las notas solo se enlazan.
- El motor es determinista: sin `Math.random` ni `Date.now` en `src/engine/simulate.ts` ni en `src/engine/score.ts`.
- `src/engine/` no importa React.
- Reloj visible de 45 minutos que nunca bloquea.
- Intervalos de repetición: 3, 7 y 21 días.
- Las estrellas y la clasificación nunca comparan el grafo con la referencia pieza por pieza; usan comportamiento, reglas y funciones.
- Las pistas nunca nombran la pieza de la solución ni sus números finales.
- Las explicaciones de una lección aparecen después de que el jugador vea el resultado.
- Solo se publican piezas que el motor simula de verdad.
- Sin dependencias adicionales a las de este plan, salvo necesidad justificada por escrito en el commit.
- Trabajar en la rama `feat/primera-entrega`, no en `master`.
- Los mensajes de commit no llevan ninguna atribución a Claude: sin `Co-Authored-By` ni menciones similares.

## Review Focus

1. **Recargar o cerrar la pestaña a mitad de una misión:** el jugador vuelve a la misma fase con su diseño, respuestas y pistas intactos. Prueba en Task 6 y Task 14.
2. **Escribir estimaciones con formato español o erróneo** (`1.000`, `12,7`, vacío, `0`, `-3`, `abc`): se aceptan los números válidos y lo demás muestra un mensaje sin puntuar. Prueba en Task 3.
3. **Cambiar el diseño después de simular:** los resultados anteriores dejan de contar y no se puede cerrar la misión hasta volver a simular. Prueba en Task 10.
4. **Progreso corrupto, de otra versión o JSON importado inválido:** la aplicación arranca, avisa y no borra lo que había guardado. Prueba en Task 6.
5. **Dejar la pestaña oculta:** ese tiempo no cuenta como bloqueo y no aparece una oferta de ayuda al volver. Prueba en Task 5.

---

### Task 1: Base del proyecto, tipos y catálogo

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`
- Create: `src/engine/types.ts`, `src/engine/components.ts`, `src/engine/validate.ts`
- Test: `src/engine/validate.test.ts`

**Interfaces:**
- Produces, en `types.ts`:

```ts
export type PieceKind = 'client' | 'dns' | 'cdn' | 'lb' | 'web' | 'api' | 'cache' | 'sql'
  | 'replica' | 'nosql' | 'objectStore' | 'queue' | 'worker' | 'batch' | 'warehouse';
export type PieceSpec = { kind: PieceKind; label: string; capacityRps: number; latencyMs: number;
  monthlyCost: number; managed: boolean; description: string };
export type DesignNode = { id: string; kind: PieceKind; instances: number; visitCounter?: boolean };
export type DesignEdge = { from: string; to: string };
export type Design = { nodes: DesignNode[]; edges: DesignEdge[] };
export type DesignError = { code: 'no-client' | 'cycle' | 'orphan' | 'no-storage' | 'bad-instances';
  message: string; nodeIds: string[] };
```

- Produces: `PIECES: Record<PieceKind, PieceSpec>`, `PALETTE: PieceKind[]` (todas salvo `client`) y `validateDesign(design: Design): DesignError[]`.

- [ ] **Step 1: Crear la rama, inicializar el proyecto con Vite (`react-ts`) e instalar `@xyflow/react`, `vitest` y `@playwright/test`.** Añadir los scripts `dev`, `build`, `test`, `e2e`. Incluir `dist`, `node_modules` y resultados de Playwright en `.gitignore`.
- [ ] **Step 2: Escribir las pruebas fallidas `validateDesign`.** Un diseño válido devuelve `[]`. Devuelven su código: sin `client`, ciclo `a→b→a`, nodo sin conexiones, sin ningún `sql`, `nosql` u `objectStore`, e `instances` que sea `0`, negativo, decimal o mayor que `100`.
- [ ] **Step 3: Ejecutar `npx vitest run src/engine/validate.test.ts`.** Esperado: FAIL porque `validateDesign` no existe.
- [ ] **Step 4: Implementar tipos, catálogo y `validateDesign`.** `managed` es `true` en `dns`, `cdn`, `lb` y `objectStore`. Los mensajes de error son texto para el jugador.
- [ ] **Step 5: Ejecutar `npx vitest run src/engine/validate.test.ts` y `npm run build`.** Esperado: PASS y compilación sin errores.
- [ ] **Step 6: Commit** de todo lo anterior junto con el spec y este plan: `feat: base del proyecto y catálogo de piezas`.

### Task 2: Simulador

**Files:**
- Create: `src/engine/simulate.ts`
- Modify: `src/engine/types.ts`
- Test: `src/engine/simulate.test.ts`

**Interfaces:**
- Consumes: `Design`, `PIECES`, `validateDesign`.
- Produces:

```ts
export type Scenario = { id: string; name: string; readRps: number; writeRps: number;
  hotKeyShare: number; down?: string };
export type NodeMetrics = { readRps: number; writeRps: number; utilization: number;
  saturated: boolean; latencyMs: number };
export type SimResult = { scenarioId: string; nodes: Record<string, NodeMetrics>;
  p99Ms: number; meanMs: number; errorRate: number; monthlyCost: number; bottleneckId: string | null };
export function simulate(design: Design, scenario: Scenario): SimResult;
export function designCost(design: Design): number;
```

Reglas de propagación que el test debe fijar. Los recorridos parten de `client`:

- De un nodo, las aristas salientes se agrupan por tipo de dato: relacional (`sql`, `replica`), clave-valor (`nosql`), objetos (`objectStore`) y resto de tipos por su propio `kind`. Cada grupo recibe toda la carga, repartida a partes iguales entre sus nodos.
- Las lecturas de un grupo relacional van a las `replica` si existen; las escrituras siempre a `sql`. Una arista `sql → replica` copia las escrituras a la réplica.
- `cache` y `cdn` absorben lecturas con una tasa `max(0,8, hotKeyShare)`. Si un nodo tiene `cache` entre sus destinos, sus demás destinos de datos reciben solo los fallos de lectura. Un `cdn` reduce las lecturas para todo lo que hay detrás de él.
- `queue`, `worker`, `batch` y `warehouse` están fuera del camino síncrono: consumen coste, pero no suman latencia a la petición. Una `queue` envía a sus destinos la media de escrituras, nunca el pico.
- `visitCounter: true` en `sql` o `nosql` convierte cada lectura en una escritura más sobre ese nodo.
- En nodos de datos, la carga de lectura pesa `1 + hotKeyShare` para modelar la contención en la clave caliente.
- Capacidad del nodo: `capacityRps × instances`. `utilization = cargaPonderada / capacidad`.
- Latencia del nodo: `latencyMs / (1 - min(utilization, 0,95))`. Con `utilization ≥ 1`, el nodo aporta `1 - 1/utilization` a `errorRate` (se toma el máximo entre nodos).
- `p99Ms` es la suma por el camino síncrono más lento, incluido el camino de fallo de caché. `meanMs` pondera aciertos y fallos.
- `down` marca un nodo: si tiene varias instancias pierde una; si tiene una desaparece. Sin `cache` o `cdn`, las peticiones siguen a su destino. Sin `sql`, una `replica` conectada asume sus escrituras. Sin destino posible, `errorRate = 1`.

- [ ] **Step 1: Escribir las pruebas fallidas `simulate`,** una por cada regla, con diseños pequeños. Incluir:
  - Con `client→api→sql`, `readRps: 100`, el nodo `sql` recibe 100 lecturas ponderadas.
  - Con caché delante y `hotKeyShare: 0`, `sql` recibe 20 lecturas.
  - `visitCounter` añade 100 escrituras a `sql`.
  - El mismo diseño y escenario dan resultados `toEqual`.
  - Con `utilization` 2, `errorRate` es `0,5`.
  - Duplicar instancias con carga baja no reduce la latencia a la mitad, pero duplica la capacidad.
- [ ] **Step 2: Ejecutar `npx vitest run src/engine/simulate.test.ts`.** Esperado: FAIL.
- [ ] **Step 3: Implementar `simulate` y `designCost`.** Recorrido topológico del grafo. Llamar a `simulate` con un diseño inválido lanza una excepción con el primer `DesignError`.
- [ ] **Step 4: Ejecutar la prueba.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: simulador determinista de carga`.

### Task 3: Misión de Pastebin y puntuación

**Files:**
- Create: `src/engine/mission.ts`, `src/engine/score.ts`, `src/engine/estimate.ts`, `src/missions/pastebin.ts`, `src/missions/index.ts`
- Test: `src/engine/score.test.ts`, `src/engine/estimate.test.ts`, `src/missions/pastebin.test.ts`

**Interfaces:**
- Consumes: `simulate`, `Scenario`, `validateDesign`.
- Produces:

```ts
export type Question = { id: string; text: string; answer: string; useful: boolean };
export type ScopeItem = { id: string; label: string; inScope: boolean };
export type Role = { id: string; label: string; referenceKinds: PieceKind[];
  acceptedKinds: PieceKind[]; noteUrl: string };
export type Rule = { id: string; label: string; noteUrl: string;
  check: (design: Design, decisions: Record<string, string>) => boolean };
export type Decision = { id: string; prompt: string; options: { id: string; label: string }[];
  validOptionIds: string[]; noteUrl: string };
export type Variant = { id: string; monthlyWrites: number; monthlyReads: number; writeRps: number;
  readRps: number; storageGbPerMonth: number; budget: number; reference: Design };
export type Mission = { id: string; title: string; questions: Question[]; scope: ScopeItem[];
  roles: Role[]; rules: Rule[]; decisions: Decision[]; variants: Variant[];
  latencyTargetMs: number; maxErrorRate: number; relatedLessons: string[]; growthNote: string };

export function scenariosFor(variant: Variant): Scenario[];      // medio, pico ×3, viral lecturas ×25 con hotKeyShare 0,9
export type StarResult = { performance: boolean; reliability: boolean; cost: boolean;
  earned: number; failedRules: string[]; failingScenarioIds: string[]; failingDownIds: string[] };
export function scoreDesign(mission: Mission, variant: Variant, design: Design,
  decisions: Record<string, string>): StarResult;
export type EstimateVerdict = 'bien' | 'cerca' | 'lejos';
export function parseEstimate(text: string): number | null;
export function judgeEstimate(value: number, real: number): EstimateVerdict;
```

Valores exactos:

- `judgeEstimate`: `bien` si `|log10(value/real)| ≤ 0,5`; `cerca` si `≤ 1`; si no, `lejos`.
- `parseEstimate`: un punto seguido de exactamente tres dígitos es separador de miles; la coma es decimal. Vacío, texto, cero y negativos devuelven `null`.
- Fiabilidad: para cada nodo no gestionado y distinto de `client`, se ejecuta el escenario de pico con `down` en ese nodo. Debe cumplir los objetivos, y además pasar todas las reglas.
- Objetivos: `latencyTargetMs: 200`, `maxErrorRate: 0,001`.

Contenido de Pastebin, tomado de la página del ejercicio 1 (`https://app.notion.com/p/402b43c51c9381559d63d940e507850b`):

- Variantes: `base` (10 M escrituras y 100 M lecturas al mes: 4 y 40 por segundo, 12,7 GB/mes), `lecturas` (10 M y 1.000 M: 4 y 400 por segundo, 12,7 GB/mes), `escrituras` (100 M y 500 M: 40 y 200 por segundo, 127 GB/mes).
- Preguntas útiles: usuarios y uso, contenido y tamaño, caducidad, estadísticas y si son en tiempo real, cuentas, volumen mensual, proporción de lecturas y escrituras, disponibilidad. Preguntas irrelevantes: al menos 4 (color de la interfaz, lenguaje del backend, proveedor de nube, logotipo).
- Alcance dentro: pegar y recibir enlace, leer, caducidad opcional, estadísticas mensuales, borrar caducados, alta disponibilidad. Fuera: cuentas, edición, visibilidad, enlace personalizado.
- Funciones (`roles`): metadatos (`sql`, acepta `sql` y `nosql`), contenido (`objectStore`, acepta `objectStore` y `nosql`), lecturas populares (`cache`, acepta `cache` y `cdn`), reparto de tráfico (`lb`), estadísticas (`batch`), limpieza (`worker`).
- Reglas: `separar` (metadatos y contenido en nodos distintos), `enlaces` (decisión de generación contestada), `estadisticas` (`batch` conectado desde `web` y sin `visitCounter`), `caducidad` (`worker` conectado al almacén de metadatos).
- Decisiones: generación de enlaces (válidas: hash MD5 y Base62, contador global con Base62; inválida: Base64 sin escapar), longitud del enlace (válidas: 6 y 7 caracteres, porque superan los 360 millones de enlaces; inválidas: 4 y 20), dónde guardar el contenido.
- `growthNote`: el diseño escalado de la sección 5 de la página, como texto para el final.

- [ ] **Step 1: Escribir las pruebas fallidas de `parseEstimate` y `judgeEstimate`.** Casos: `"1.000"` → 1000, `"12,7"` → 12,7, `"1.27"` → 1,27, `""`, `"abc"`, `"0"`, `"-3"` → `null`; 40 frente a 40 es `bien`, 100 frente a 40 es `bien`, 300 frente a 40 es `cerca`, 4.000 frente a 40 es `lejos`.
- [ ] **Step 2: Escribir las pruebas fallidas de calibración en `pastebin.test.ts`.** Para cada variante:
  - La referencia consigue 3 estrellas.
  - La referencia con un `nosql` de 3 instancias en lugar de `sql` y su réplica consigue 3 estrellas.
  - Eliminar cualquier nodo de la referencia, salvo `client`, pierde al menos una estrella. Esto demuestra que es el diseño más sencillo.
  - Una sola máquina con `sql`, `objectStore`, `batch` y `worker` pierde fiabilidad.
  - La referencia sin `cache` ni `cdn` pierde rendimiento en `viral`.
  - La referencia con 6 shards (`instances: 6`) y réplicas de más pierde coste.
  - La referencia con `visitCounter` falla `estadisticas` y `simulate` muestra más escrituras.
- [ ] **Step 3: Ejecutar `npx vitest run src/engine src/missions`.** Esperado: FAIL.
- [ ] **Step 4: Implementar `estimate.ts`, `mission.ts`, `score.ts` y `pastebin.ts`.** Ajustar capacidades, costes y presupuestos en `components.ts` y `pastebin.ts` hasta cumplir las pruebas. Los valores son ficticios y plausibles; ninguno se fija en la prueba, salvo los escenarios y objetivos.
- [ ] **Step 5: Ejecutar `npx vitest run`.** Esperado: PASS.
- [ ] **Step 6: Commit** `feat: misión de Pastebin y puntuación por estrellas`.

### Task 4: Comparación con la referencia

**Files:**
- Modify: `src/engine/score.ts`
- Test: `src/engine/compare.test.ts`

**Interfaces:**
- Consumes: `Mission`, `Variant`, `EstimateVerdict`.
- Produces:

```ts
export type DifferenceCategory = 'requisito' | 'estimacion' | 'pieza' | 'valido';
export type Difference = { id: string; category: DifferenceCategory; title: string; detail: string; noteUrl?: string };
export type AttemptFacts = { askedQuestionIds: string[]; scopeChoices: Record<string, boolean>;
  estimates: Record<'readRps' | 'writeRps' | 'storageGbPerMonth', EstimateVerdict> };
export function compareDesign(mission: Mission, variant: Variant, design: Design,
  decisions: Record<string, string>, facts: AttemptFacts): Difference[];
```

Clasificación: alcance mal marcado o pregunta útil sin hacer es `requisito`; estimación `cerca` o `lejos` es `estimacion`; función sin ningún `acceptedKinds` en el diseño es `pieza`; función cubierta con un tipo que no está en `referenceKinds` es `valido`; decisión con opción no válida es `pieza` con la nota asociada.

- [ ] **Step 1: Escribir las pruebas fallidas.** La referencia con `nosql` da una diferencia `valido` y ninguna `pieza`. Sin caché ni CDN da `pieza` con `noteUrl`. Una estimación `lejos` da `estimacion`. Sin preguntar por estadísticas da `requisito`.
- [ ] **Step 2: Ejecutar `npx vitest run src/engine/compare.test.ts`.** Esperado: FAIL.
- [ ] **Step 3: Implementar `compareDesign`.** No comparar identificadores de nodos ni aristas: solo funciones, reglas, decisiones y hechos del intento.
- [ ] **Step 4: Ejecutar la prueba.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: clasificación de diferencias`.

### Task 5: Pistas y repetición

**Files:**
- Create: `src/engine/hints.ts`, `src/engine/review.ts`
- Modify: `src/engine/mission.ts`, `src/missions/pastebin.ts`
- Test: `src/engine/hints.test.ts`, `src/engine/review.test.ts`, `src/missions/pastebin.hints.test.ts`

**Interfaces:**
- Consumes: `SimResult`, `StarResult`, `Mission`.
- Produces:

```ts
export type HintLevel = 1 | 2 | 3;
export type FailureKey = string; // `${fase}:${escenario|'*'}:${tipoDePieza|regla|'*'}`
export type HintSet = { key: FailureKey; texts: [string, string, string]; lessonId?: string };
export type StuckSignals = { activeMsSinceUsefulChange: number; sameFailureRuns: number; wrongAnswers: number };
export type HintUse = { key: FailureKey; level: HintLevel };
export type ActivityEvent = { type: 'visible' | 'hidden' | 'change'; at: number };
export function activeTimer(events: ActivityEvent[], now: number): number; // ms activos desde el último 'change'
export function isStuck(s: StuckSignals): boolean;      // ≥ 180000 ms, ≥ 3 simulaciones o ≥ 3 errores
export function diagnose(design: Design, stars: StarResult, results: SimResult[]): FailureKey;
export function selectHint(hints: HintSet[], key: FailureKey): HintSet | null; // exacta, luego comodines
export function starCap(uses: HintUse[]): 3 | 2 | 1;    // nivel 2 → 2, nivel 3 → 1, el peor gana
export function nextReviewDays(completedAttempts: number, uses: HintUse[]): 3 | 7 | 21;
```

`Mission` añade `hints: HintSet[]`. `nextReviewDays`: intervalos 3, 7 y 21 según intentos completados previos (el 21 se mantiene); con pistas de nivel 2 o 3, baja un escalón, sin bajar de 3.

- [ ] **Step 1: Escribir las pruebas fallidas de `hints.ts` y `review.ts`.** Cubrir cada umbral justo por debajo y en su valor, `starCap`, y los intervalos: `nextReviewDays(0, [])` es 3, `(1, [])` es 7, `(2, [])` es 21, `(5, [])` es 21, y `(2, [{ level: 3 }])` es 7. Añadir: con `activeTimer`, una pestaña oculta durante 10 minutos no suma ese tiempo.
- [ ] **Step 2: Escribir las pruebas fallidas en `pastebin.hints.test.ts`.** Cada diseño fallido de Task 3 obtiene una pista específica, no el comodín. Ninguna de las pistas contiene los nombres `caché`, `cache`, `CDN`, `Redis`, `réplica` ni números de los valores finales, comprobado sobre todos los textos.
- [ ] **Step 3: Ejecutar `npx vitest run src/engine/hints.test.ts src/engine/review.test.ts src/missions/pastebin.hints.test.ts`.** Esperado: FAIL.
- [ ] **Step 4: Implementar y escribir las pistas de Pastebin.** Fases `informe`, `estimacion`, `simulacion` y `decisiones`, con al menos pico saturado por lecturas, viral, escrituras, caída de un punto único, cada regla y coste excedido. Niveles según los ejemplos del spec.
- [ ] **Step 5: Ejecutar `npx vitest run`.** Esperado: PASS.
- [ ] **Step 6: Commit** `feat: pistas graduadas y calendario de repetición`.

### Task 6: Progreso guardado

**Files:**
- Create: `src/save.ts`
- Test: `src/save.test.ts`

**Interfaces:**
- Consumes: `Design`, `HintUse`, `AttemptFacts`.
- Produces:

```ts
export type Phase = 'informe' | 'estimacion' | 'diseno' | 'decisiones' | 'comparacion';
export type Attempt = { missionId: string; variantId: string; phase: Phase; startedAt: string;
  facts: AttemptFacts; design: Design; designRevision: number; simulatedRevision: number | null;
  decisions: Record<string, string>; justifications: Record<string, string>; hints: HintUse[];
  disputedDifferenceIds: string[]; result?: { stars: number; finishedAt: string } };
export type Save = { version: 1; attempts: Attempt[]; current: Attempt | null;
  completedLessons: string[]; lessonState: Record<string, unknown> };
export function loadSave(storage: Storage): { save: Save; warning: string | null };
export function writeSave(storage: Storage, save: Save): void;
export function exportSave(save: Save): string;
export function importSave(text: string): { save: Save } | { error: string };
export function dueReviews(save: Save, now: Date): string[];
export function pickVariant(save: Save, mission: Mission): Variant; // la menos usada; empate por orden
```

- [ ] **Step 1: Escribir las pruebas fallidas,** con un `Storage` falso.
  - Guardar y cargar conserva un `current` a mitad de intento.
  - JSON corrupto o `version: 99` en `localStorage`: `loadSave` devuelve un save vacío con aviso y conserva el texto original en la clave `sdw-save-backup`.
  - `importSave` con texto inválido devuelve `error`.
  - Una excepción de `setItem` no rompe la aplicación.
  - `dueReviews` con intervalos 3, 7 y 21 y fechas fijas.
  - `pickVariant` rota entre las tres variantes.
- [ ] **Step 2: Ejecutar `npx vitest run src/save.test.ts`.** Esperado: FAIL.
- [ ] **Step 3: Implementar `save.ts`.** La validación del JSON se hace a mano, sin dependencias, en la frontera de lectura.
- [ ] **Step 4: Ejecutar la prueba.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: progreso local con exportación e importación`.

### Task 7: Aplicación y mapa

**Files:**
- Create: `src/game/store.tsx`, `src/game/map/MapScreen.tsx`, `src/content.ts`, `src/styles.css`
- Modify: `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: `loadSave`, `writeSave`, `exportSave`, `importSave`, `dueReviews`, `Mission`.
- Produces:
  - `useGame(): { save: Save; update: (fn: (s: Save) => Save) => void; warning: string | null }`
  - `navigate(route: string)`; rutas por hash: `#/`, `#/mision/:id`, `#/leccion/:id`.
  - `MAP_NODES: { id: string; type: 'leccion' | 'mision'; title: string; available: boolean; links: string[] }[]`, con los 17 temas y los 8 ejercicios.

Las lecciones y misiones aún sin crear aparecen como "Próximamente"; todo lo disponible está abierto desde el inicio. Enlaces de misiones a lecciones según la nota 18; Pastebin enlaza con 8, 12, 13 y 17. Los nodos de Pastebin y las lecciones 3, 4 y 13 tienen `available: true`.

- [ ] **Step 1: Implementar el contexto de juego, la navegación por hash y `MapScreen` con React Flow en modo solo lectura.** Un nodo completado muestra sus estrellas y uno pendiente de repetición se señala con "Toca repetir".
- [ ] **Step 2: Añadir exportar e importar progreso y mostrar `warning` en un aviso.**
- [ ] **Step 3: Comprobar con `npm run build` y abrir la aplicación con `npm run dev`.** Esperado: compila; el mapa muestra 25 nodos, 4 disponibles.
- [ ] **Step 4: Commit** `feat: mapa de lecciones y misiones`.

### Task 8: Lienzo de diseño

**Files:**
- Create: `src/game/canvas/DesignCanvas.tsx`, `src/game/canvas/PieceNode.tsx`, `src/game/canvas/Palette.tsx`
- Modify: `src/styles.css`, `src/engine/types.ts`

**Interfaces:**
- Consumes: `Design`, `PALETTE`, `PIECES`, `validateDesign`, `SimResult`.
- Produces: `<DesignCanvas design={Design} onChange={(d: Design) => void} result={SimResult | null} locked={boolean} allowedKinds={PieceKind[]} />`. Sin `allowedKinds` muestra toda la paleta.

Se pueden añadir, conectar, borrar y configurar piezas (instancias y `visitCounter`). Solo hay un `client`, creado de inicio y sin borrado. Con `result`, cada pieza muestra su utilización; una saturada se ve en rojo y las aristas animan solo si hay carga. La paleta siempre muestra las 14 piezas en el mismo orden en las misiones.

- [ ] **Step 1: Implementar el lienzo como componente controlado.** Evitar que el arrastre de posiciones cuente como cambio útil: la posición se guarda aparte en `DesignNode` mediante `x` e `y` opcionales, añadidos a `types.ts`, y `simulate` los ignora.
- [ ] **Step 2: Comprobar con `npm run build` y en el navegador** añadir, conectar y configurar piezas.
- [ ] **Step 3: Commit** `feat: lienzo de arquitectura`.

### Task 9: Informe y estimación

**Files:**
- Create: `src/game/mission/MissionScreen.tsx`, `src/game/mission/BriefingPhase.tsx`, `src/game/mission/EstimatePhase.tsx`, `src/game/mission/Clock.tsx`, `src/game/mission/HintPanel.tsx`

**Interfaces:**
- Consumes: `useGame`, `Mission`, `Attempt`, `pickVariant`, `parseEstimate`, `judgeEstimate`, `isStuck`, `activeTimer`, `selectHint`.
- Produces: `MissionScreen`, que elige la fase según `attempt.phase`, y `<HintPanel hintSet={HintSet | null} signals={StuckSignals} free={boolean} onUse={(u: HintUse) => void} />`. Con `free`, no se muestra ningún coste.

Al abrir una misión sin intento, se crea uno con `pickVariant`. El informe solo muestra el título, las preguntas y el alcance. Las preguntas revelan respuestas de la variante. Un número mal escrito muestra "Escribe un número mayor que cero, por ejemplo 40" y no avanza. Al enviar, se muestran veredictos, números reales y requisitos completos.

El panel de ayuda ofrece una pista cuando `isStuck` es verdadero, sin mostrarla hasta que el jugador acepte, y siempre tiene un botón "Pedir pista". Advierte el coste antes de abrir los niveles 2 y 3.

- [ ] **Step 1: Implementar `HintPanel` y `Clock`.** El reloj cuenta desde `startedAt`; al pasar de 45 minutos sigue contando en otro color.
- [ ] **Step 2: Implementar las fases.** Cada acción persiste con `update`.
- [ ] **Step 3: Comprobar con `npm run build` y en el navegador** que se avanza hasta la fase de diseño con un número bien escrito y que uno erróneo lo impide.
- [ ] **Step 4: Commit** `feat: fases de informe y estimación`.

### Task 10: Simulación, decisiones y comparación

**Files:**
- Create: `src/game/mission/DesignPhase.tsx`, `src/game/mission/DecisionsPhase.tsx`, `src/game/mission/ComparePhase.tsx`, `src/engine/attempt.ts`
- Test: `src/engine/attempt.test.ts`

**Interfaces:**
- Consumes: `DesignCanvas`, `HintPanel`, `validateDesign`, `simulate`, `scoreDesign`, `compareDesign`, `diagnose`, `starCap`, `nextReviewDays`.
- Produces: `canFinish(a: Attempt): boolean`, verdadero solo si `simulatedRevision === designRevision` y todas las decisiones tienen respuesta y justificación no vacía; `reviseDesign(a: Attempt, d: Design): Attempt`, que incrementa `designRevision`.

Cada cambio funcional del diseño incrementa la revisión y deja los resultados anteriores en gris con "Vuelve a simular". El botón de simulación ejecuta los escenarios en orden y muestra por escenario latencia, errores, coste y cuello de botella. La referencia no aparece hasta `ComparePhase`.

La comparación muestra estrellas obtenidas, tope por pistas, diseño propio y referencia en dos lienzos bloqueados, diferencias por categoría con enlace a la nota, botón "No estoy de acuerdo" en cada una, `growthNote`, pistas usadas y fecha de repetición. Las justificaciones se muestran junto a su decisión, sin puntuar.

- [ ] **Step 1: Escribir las pruebas fallidas de `attempt.ts`.** `reviseDesign` invalida una simulación previa; `canFinish` es falso sin simular, tras modificar el diseño, sin decisión o con justificación vacía, y verdadero con todo completo.
- [ ] **Step 2: Ejecutar `npx vitest run src/engine/attempt.test.ts`.** Esperado: FAIL.
- [ ] **Step 3: Implementar `attempt.ts`.** Ejecutar de nuevo. Esperado: PASS.
- [ ] **Step 4: Implementar las tres fases.** `diagnose` alimenta las pistas y `sameFailureRuns`. Marcar desacuerdo actualiza `disputedDifferenceIds` y no cambia las estrellas.
- [ ] **Step 5: Comprobar con `npm run build` y en el navegador** una partida completa con la referencia de la variante.
- [ ] **Step 6: Commit** `feat: simulación, decisiones y comparación`.

### Task 11: Marco de lecciones y lección 3

**Files:**
- Create: `src/lessons/types.ts`, `src/lessons/LessonScreen.tsx`, `src/lessons/EngineChallenge.tsx`, `src/lessons/latency.ts`, `src/lessons/index.ts`
- Test: `src/lessons/latency.test.ts`

**Interfaces:**
- Consumes: `DesignCanvas`, `simulate`, `Scenario`, `useGame`, `HintPanel`.
- Produces:

```ts
export type Prediction = { prompt: string; options: { id: string; label: string }[]; answerId: string };
export type EngineStep = { kind: 'engine'; design: Design; scenario: Scenario; controls: ('load' | 'instances' | 'pieces')[];
  allowedKinds?: PieceKind[]; goalLabel: string; goal: (r: SimResult, d: Design) => boolean };
export type SceneStep = { kind: 'scene'; scene: 'cache' | 'cap'; goalId: string };
export type Challenge = { id: string; title: string; prediction: Prediction; step: EngineStep | SceneStep;
  explanation: string; hints: [string, string, string] };
export type Lesson = { id: string; noteNumber: number; title: string; noteUrl: string; challenges: Challenge[] };
export const LESSONS: Record<string, Lesson>;
```

Cada reto muestra predicción → intervención → resultado → explicación, en ese orden. Una predicción errónea no bloquea: se revela al ver el resultado. `isStuck` y los tres niveles de pista funcionan sin coste. Al terminar el último reto, la lección pasa a `completedLessons`.

Lección 3, nota `https://app.notion.com/p/3f9b43c51c9381fba54ddb28e44d5381`, 3 retos:

1. **Más carriles, no autos más rápidos:** predecir si añadir instancias con poca carga reduce la latencia; duplicar instancias y ver que sube la capacidad, no la velocidad. Explicación con la fábrica de 8 horas y 5 autos por hora.
2. **El atasco:** predecir qué pasa al acercarse al 100 %; subir la carga hasta saturar y ver dispararse la latencia.
3. **Máximo throughput con latencia aceptable:** alcanzar 2.000 peticiones/s con p99 ≤ 200 ms usando el menor número de instancias.

- [ ] **Step 1: Escribir las pruebas fallidas de `latency.test.ts`.** Cada `goal` es falso para el diseño inicial y verdadero para un diseño resuelto de ejemplo. El texto de cada `prediction.prompt` no contiene `explanation`. Toda lección tiene entre 3 y 5 retos, comprobado con una prueba general sobre `LESSONS`.
- [ ] **Step 2: Ejecutar `npx vitest run src/lessons`.** Esperado: FAIL.
- [ ] **Step 3: Implementar el marco, `EngineChallenge` y la lección.** Ejecutar de nuevo. Esperado: PASS.
- [ ] **Step 4: Comprobar en el navegador** que la explicación no aparece antes del resultado.
- [ ] **Step 5: Commit** `feat: marco de lecciones y lección de latencia`.

### Task 12: Lección 13, Caché

**Files:**
- Create: `src/lessons/cacheSim.ts`, `src/lessons/CacheScene.tsx`, `src/lessons/cache.ts`
- Modify: `src/lessons/index.ts`, `src/lessons/LessonScreen.tsx`
- Test: `src/lessons/cacheSim.test.ts`, `src/lessons/cache.test.ts`

**Interfaces:**
- Consumes: `Lesson`, `EngineChallenge`.
- Produces:

```ts
export type Strategy = 'cache-aside' | 'write-through' | 'write-behind';
export type CacheState = { db: Record<string, number>; cache: Record<string, number>;
  pending: Record<string, number>; strategy: Strategy; invalidateOnWrite: boolean; log: string[] };
export function createCache(strategy: Strategy, invalidateOnWrite: boolean): CacheState;
export function read(s: CacheState, key: string): { state: CacheState; value: number | undefined; hit: boolean; trips: number };
export function write(s: CacheState, key: string, value: number): { state: CacheState; dbTrips: number };
export function flush(s: CacheState): CacheState;
export function crashCache(s: CacheState): CacheState;
```

Lección 13, nota `https://app.notion.com/p/3fab43c51c938127b062d55184fdb76f`, 3 retos:

1. **Lo que no llega a la base:** con motor, predecir cuántas lecturas siguen llegando con una caché; añadirla para bajar la base de la saturación.
2. **El número viejo:** escena; cache-aside sin invalidar sirve un dato viejo tras una escritura. El jugador provoca el fallo y lo arregla con invalidación al escribir o `write-through`. Después, `write-behind` pierde datos al caer la caché. Objetivo `goalId: 'cache-strategies'`.
3. **La dependencia oculta:** con motor, predecir qué pasa si cae la caché con la base dimensionada solo para los fallos; provocarlo y añadir capacidad para sobrevivir.

- [ ] **Step 1: Escribir las pruebas fallidas de `cacheSim`.** Fallo en cache-aside cuesta 3 viajes y el siguiente acierto 1. Sin invalidar, tras `write`, `read` devuelve el valor viejo; con invalidación, el nuevo. `write-through` deja caché y base iguales. `write-behind` deja la base atrasada hasta `flush`, y `crashCache` antes de `flush` pierde el valor pendiente.
- [ ] **Step 2: Ejecutar `npx vitest run src/lessons/cacheSim.test.ts`.** Esperado: FAIL.
- [ ] **Step 3: Implementar `cacheSim.ts`.** Ejecutar de nuevo. Esperado: PASS.
- [ ] **Step 4: Escribir `cache.test.ts` con las comprobaciones de `goal` de Task 11, e implementar `CacheScene` y la lección.** La escena muestra caché y base lado a lado, con los botones leer, escribir, volcar y caer.
- [ ] **Step 5: Ejecutar `npx vitest run src/lessons`.** Esperado: PASS.
- [ ] **Step 6: Commit** `feat: lección de caché`.

### Task 13: Lección 4, CAP

**Files:**
- Create: `src/lessons/capSim.ts`, `src/lessons/CapScene.tsx`, `src/lessons/cap.ts`
- Modify: `src/lessons/index.ts`, `src/lessons/LessonScreen.tsx`
- Test: `src/lessons/capSim.test.ts`, `src/lessons/cap.test.ts`

**Interfaces:**
- Consumes: `Lesson`.
- Produces:

```ts
export type Mode = 'CP' | 'AP';
export type Teller = 'a' | 'b';
export type BankState = { balances: Record<Teller, number>; partitioned: boolean; mode: Mode;
  pending: { teller: Teller; delta: number }[]; log: string[] };
export type OpResult = { state: BankState; status: 'ok' | 'rechazada'; balance?: number };
export function createBank(balance: number, mode: Mode): BankState;
export function deposit(s: BankState, t: Teller, amount: number): OpResult;
export function withdraw(s: BankState, t: Teller, amount: number): OpResult;
export function readBalance(s: BankState, t: Teller): OpResult;
export function setPartition(s: BankState, partitioned: boolean): BankState;
export function trueBalance(s: BankState): number;
```

Lección 4, nota `https://app.notion.com/p/3f9b43c51c9381a9aa9cf51e04606313`, 4 retos con el banco de dos cajeros:

1. **Sin problemas:** predecir si un cajero ve el depósito hecho en el otro; ambos coinciden. Con la red bien, el sistema es C y A a la vez.
2. **Se corta la red:** predecir si el cajero puede saber si el otro está caído o aislado; cortar la red y probar ambos modos.
3. **Dos retiradas:** en modo AP, retirar en ambos cajeros durante la partición y reconectar hasta dejar el saldo real negativo; en modo CP, comprobar que se rechazan. Objetivo `goalId: 'cap-double-withdraw'`.
4. **Elige para cada producto:** decidir CP o AP para pagos, inventario del último asiento, feed social, carrito y contador de "me gusta". Cubre "qué prefieres: error o dato viejo" y que muchas apps mezclan ambos.

La explicación final corrige "elige 2 de 3": la elección real es C o A durante una partición.

- [ ] **Step 1: Escribir las pruebas fallidas de `capSim`.** Sin partición, un depósito se ve en ambos. En CP con partición, escrituras y lecturas devuelven `rechazada` y el saldo real no cambia. En AP con partición, se aceptan y los saldos difieren. Reconectar en AP aplica `pending`: saldo 100, retirar 80 en cada cajero, reconectar da `trueBalance` de -60 en ambos. En CP nunca baja de cero. No se puede retirar más del saldo local.
- [ ] **Step 2: Ejecutar `npx vitest run src/lessons/capSim.test.ts`.** Esperado: FAIL.
- [ ] **Step 3: Implementar `capSim.ts`.** Ejecutar de nuevo. Esperado: PASS.
- [ ] **Step 4: Escribir `cap.test.ts` con las comprobaciones de la lección, e implementar `CapScene` y la lección.** La escena muestra ambos cajeros, cortar y reconectar la red, modo CP o AP y las operaciones.
- [ ] **Step 5: Ejecutar `npx vitest run src/lessons`.** Esperado: PASS.
- [ ] **Step 6: Commit** `feat: lección de CAP`.

### Task 14: Prueba de punta a punta y publicación

**Files:**
- Create: `playwright.config.ts`, `e2e/juego.spec.ts`

**Interfaces:**
- Consumes: toda la aplicación.

- [ ] **Step 1: Escribir `e2e/juego.spec.ts`, usando etiquetas y roles accesibles.** Casos:
  - Recorrer el mapa y abrir un nodo de cada tipo.
  - Completar la lección 3 (solo motor), la 13 (motor y escena) y la 4 (escena).
  - Jugar Pastebin con una pista de nivel 2, y comprobar el tope de 2 estrellas y una diferencia en la comparación.
  - Recargar a mitad de la fase de diseño y encontrar el mismo diseño.
  - Recargar al final y ver estrellas, lecciones completadas y fecha de repetición.
- [ ] **Step 2: Ejecutar `npx playwright test`.** Esperado: PASS. Corregir la causa de cualquier fallo en el código que lo provoca.
- [ ] **Step 3: Ejecutar `npm test`, `npm run build` y `npx tsc --noEmit`.** Esperado: todo PASS y sin errores.
- [ ] **Step 4: Commit** `test: partida completa de punta a punta`.
- [ ] **Step 5: Confirmar con Gabriel antes de publicar.** Con su visto bueno, desplegar con la skill `vercel:deploy`, abrir la URL publicada y comprobar que carga el mapa.
