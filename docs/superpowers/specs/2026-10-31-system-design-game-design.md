# Diseño: juego de misiones de diseño de sistemas

## Contexto

Gabriel terminó la teoría del System Design Primer (notas 1–17 en Notion), pero los 8 ejercicios siguen sin hacer. Sabe qué es cada pieza, pero ante una hoja en blanco no sabe decidir qué usar, dónde ni por qué. Quiere prepararse para entrevistas de diseño de sistemas con algo activo en lugar de seguir leyendo.

**El producto:** un juego de navegador, para uso personal, con dos tipos de contenido en un mapa libre:
- **Lecciones:** los temas 1–17 explicados de forma interactiva, con el jugador interviniendo en cada reto.
- **Misiones:** los 8 ejercicios del Primer. El jugador descubre los requisitos, estima, construye la arquitectura, lanza tráfico y ve qué se rompe.

Si el jugador se atasca, el juego ofrece pistas graduadas. El directorio del proyecto está vacío: es un proyecto nuevo.

**Éxito:** tras un par de meses, Gabriel resuelve los 8 ejercicios desde cero con la rutina de su nota 18, sin depender de las pistas, y llega a entrevistas justificando decisiones.

## Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Entrenar el método de 4 pasos de la nota 18: requisitos y estimación, alto nivel, componentes, escalado iterativo.
- Hacer visible el porqué de cada pieza: añadirla debe resolver un problema observable.
- Permitir repetir cada misión días después, desde cero.
- Explicar cada tema haciendo que el jugador prediga, intervenga y observe el resultado.
- Ayudar cuando se atasque sin quitarle el razonamiento.

**No objetivos**
- Entrevistador con IA, cuentas, nube o multijugador.
- Ejercicios de diseño orientado a objetos.
- Tarjetas tipo Anki.
- Editor general de diagramas o editor de misiones.

**Antiobjetivos: fracasa si...**
- Enseña a ganar el juego y no a diseñar (por ejemplo, memorizar una solución única).
- Da las respuestas de entrada: requisitos, números o solo las piezas que hacen falta.
- Las lecciones son texto con un cuestionario al final: eso repetiría el estudio pasivo que quiere dejar atrás.
- Una pista revela la pieza o el número exacto que Gabriel debe encontrar.
- Penaliza una alternativa válida y justificada, como NoSQL en vez de SQL.
- Premia añadir piezas sin necesidad. Pastebin tiene unas 40 lecturas/s, y un diseño sobredimensionado debe salir mal parado.

## Decisiones de Gabriel

- Formato: simulador tipo juego, con misiones y estrellas.
- Objetivo: pasar entrevistas.
- Inicio de misión: solo se ve el título; hay que descubrir requisitos y estimar.
- Usuario único: sin cuentas ni base de datos; el progreso queda en el navegador.
- Stack: aceptó la propuesta de React, TypeScript y React Flow, sin servidor, publicado en Vercel.
- Comparación final: el juego clasifica cada diferencia y Gabriel puede marcar su desacuerdo.
- Repetición: cada misión tiene 2 o 3 variantes de números, para volver a estimar y que el diseño correcto pueda cambiar.
- Lecciones: los temas 1–17 son lecciones interactivas en las que el jugador interviene.
- Navegación: mapa libre con lecciones y misiones conectadas, con sugerencias de repaso y sin nada bloqueado.
- Pistas: graduadas; el juego detecta el bloqueo o el jugador las pide, y las más directas reducen la nota.

## El bucle de una misión

1. **Informe.** Solo aparece el título, por ejemplo "Diseña Pastebin". Gabriel interroga a un jefe de producto simulado eligiendo preguntas de una lista que mezcla útiles e irrelevantes. Después marca qué entra, qué queda fuera y qué supone.
2. **Estimación.** Escribe peticiones/s de lectura y escritura y almacenamiento. El juego las evalúa por orden de magnitud y revela los números y requisitos reales antes de diseñar. Lo que no descubrió se registra como carencia, y el diseño siempre se evalúa contra los requisitos reales, no contra el alcance que él marcó.
3. **Diseño.** Lienzo vacío con todas las piezas disponibles, siempre las mismas en todas las misiones, para no dar pistas. Cada pieza se configura: instancias y opciones básicas.
4. **Simulación.** Se lanzan escenarios en orden: tráfico medio, pico, caída de una pieza y evento propio de la misión. Se ven saturación, latencia p99, coste y errores en cada pieza. Se vuelve al paso 3 tantas veces como haga falta: esto es el ciclo medir → cuello de botella → resolver de la nota 18.
5. **Decisiones.** Antes de cerrar, responde las decisiones clave de la misión (por ejemplo, cómo generar el enlace corto y dónde guardar el contenido) y escribe en una línea por qué.
6. **Comparación.** Se revela la solución de referencia. El juego clasifica cada diferencia con las categorías de la nota 18: faltó un requisito, una estimación o una pieza, o "elegí distinto, pero es válido". Gabriel puede marcar su desacuerdo en cualquier clasificación, y la marca queda guardada sin cambiar las estrellas. Cada carencia enlaza a su nota de Notion. Se muestra cuándo repetir la misión.

**Puntuación: 3 estrellas independientes**
- ⭐ **Rendimiento:** cumple los objetivos de latencia y errores con tráfico medio, pico y evento de la misión.
- ⭐ **Fiabilidad:** sobrevive a la caída de cualquier pieza propia y cumple las reglas funcionales de la misión.
- ⭐ **Coste:** se mantiene dentro del presupuesto, lo que castiga el exceso de piezas.

Las estrellas y la clasificación miden el comportamiento y las funciones cubiertas, nunca el parecido con el grafo de referencia. Cada misión define las funciones necesarias y las alternativas válidas para cubrirlas (por ejemplo, metadatos en SQL o en clave-valor).

## Las lecciones

Cada lección tiene de 3 a 5 retos cortos, con el mismo ciclo: **predecir → intervenir → observar → explicar**. La explicación llega después de que el jugador vea el resultado, en un texto breve que enlaza a su nota de Notion. Una lección bien hecha debe poder completarse en menos de 10 minutos.

| Temas | Formato | Qué hace el jugador |
| --- | --- | --- |
| 1 Escalabilidad, 2 Rendimiento, 3 Latencia y throughput | Motor | Añade clones y carga hasta encontrar el límite |
| 4 CAP, 5 Consistencia | Escena propia | Corta la red entre réplicas y elige qué sacrificar |
| 6 Disponibilidad | Motor y escena | Provoca caídas, activa failover y calcula los "nueves" |
| 7 DNS | Escena propia | Sigue una resolución y cambia TTL y enrutamiento |
| 8 CDN, 9 Balanceadores, 10 Proxy inverso | Motor | Desvía tráfico y compara estrategias |
| 11 Capa de aplicación | Motor | Encadena servicios y ve cómo suma la latencia |
| 12 Bases de datos | Motor y escena | Replica, reparte shards y encuentra la clave caliente |
| 13 Caché | Motor y escena | Prueba estrategias y provoca datos obsoletos |
| 14 Asincronismo | Motor | Satura una cola y aplica back pressure |
| 15 Comunicación | Escena propia | Pierde paquetes y compara TCP con UDP |
| 16 Seguridad | Escena propia | Ataca una app simulada y luego la protege |
| 17 Apéndice | Escena propia | Entrena estimaciones y ordena latencias |

Esta tabla se basa en los títulos de las notas. Al escribir cada lección hay que leer su nota de Notion y ajustar los retos a lo que dice. Las lecciones se pueden repetir y puntúan como completadas o no; las estrellas son solo para misiones.

## El mapa

Pantalla principal con lecciones y misiones como nodos conectados. Cada misión muestra las lecciones relacionadas, tomadas de la nota 18, y sugiere repasarlas si hubo carencias, pero todo está abierto. El mapa también señala lo que toca repetir.

## Las pistas

Son contenido escrito y reglas fijas, sin IA.

| Nivel | Qué hace | Ejemplo | Coste |
| --- | --- | --- | --- |
| 1. Orientar | Pregunta qué mirar | "¿Qué pieza llega antes al 100 %?" | Gratis |
| 2. Señalar | Identifica el problema | "Las lecturas saturan la base; el problema no son las escrituras" | Máximo 2 estrellas en el intento |
| 3. Encaminar | Nombra el tipo de solución, no la pieza concreta ni dónde va | "Necesitas evitar que las lecturas repetidas lleguen a la base" | Máximo 1 estrella en el intento |

- **Detección del bloqueo:** 3 minutos sin cambios útiles en una fase, 3 simulaciones seguidas con el mismo fallo o 3 respuestas erróneas en un reto. El juego ofrece ayuda en un aviso discreto y nunca la muestra sin que el jugador acepte.
- **Selección:** cada pista depende del fallo actual (fase, escenario y tipo de cuello de botella), no solo de la misión.
- **Registro:** las pistas usadas aparecen en la comparación final, enlazan a la lección relacionada y adelantan la repetición al siguiente intervalo más corto.
- **Lecciones:** usan los mismos niveles, sin coste, porque allí el objetivo es aprender.

## Mis decisiones (se pueden cambiar)

- **Primera entrega:** motor, mapa, sistema de pistas, misión de Pastebin y 3 lecciones: 3 Latencia y throughput (solo motor), 13 Caché (motor y escena) y 4 CAP (escena propia). Prueban los formatos antes de producir el resto.
- **Orden posterior:** cuando Gabriel confirme que sirve, las demás lecciones y luego Twitter y las otras misiones.
- **Twitter como segunda misión:** obliga al motor a soportar fan-out y escrituras amplificadas.
- **Simulador:** modelo matemático determinista, sin servidores reales ni aleatoriedad. Cada pieza tiene capacidad, latencia y coste. La carga se propaga por el grafo, la latencia crece con la saturación y las partículas animadas solo son visuales.
- **Números:** los de la nota 17 y las soluciones de Notion. Las capacidades y los precios son ficticios pero plausibles, calibrados para que las lecciones de la nota aparezcan.
- **Texto en la justificación:** el juego no lo evalúa; queda guardado para compararlo. Sin IA, la justificación escrita es autoevaluada.
- **Tiempo:** reloj visible de 45 minutos, sin bloquear al terminar.
- **Repetición:** intervalos fijos de 3, 7 y 21 días tras cada intento.
- **Referencia de Pastebin:** el diseño más sencillo que consiga las 3 estrellas en cada variante, no el diagrama completo de la sección 5 de la nota. Ese diagrama se muestra aparte como "cómo seguiría creciendo".
- **Evento de Pastebin:** un paste viral concentra lecturas en pocas claves, y hace falta caché o CDN para superarlo. El motor simula esa concentración, para que la caché resuelva un problema visible aunque el tráfico medio sea modesto.
- **Reglas funcionales:** cada misión las declara como comprobaciones sobre el grafo y la configuración. En Pastebin: separar metadatos y contenido, generar enlaces, estadísticas por lotes y borrado de caducados. Un contador de visitas en la base añade escrituras reales a la simulación.
- **Caídas:** se prueba cada pieza propia por turnos. Los servicios gestionados (almacenamiento de objetos, DNS, CDN y balanceador gestionado) se consideran redundantes de fábrica, con un coste mayor o menor control según la pieza.
- **Catálogo:** se publica solo lo que el motor simula de verdad, sin piezas decorativas. V1 incluye DNS, CDN, balanceador, servidor web, API, caché, SQL, réplica, NoSQL, almacenamiento de objetos, cola, worker, proceso por lotes y almacén de datos. Twitter añadirá el fan-out como parámetro de misión, no como pieza.
- **Contenido:** copiado a archivos de misión en el repositorio. La web no se conecta a Notion; solo guarda enlaces a las notas.
- **Idioma y plataforma:** español; pensado para escritorio, sin soporte móvil en v1.

## Cómo se construye

- **Stack:** Vite, React, TypeScript, `@xyflow/react`, y Vitest para probar el motor.
- **Progreso:** `localStorage`, con exportación/importación a JSON para no perderlo.
- **Separación principal:** el motor y la lógica de pistas son TypeScript puro, sin React; las misiones, lecciones y pistas son datos. Las escenas propias de cada lección son componentes React aparte.

Estructura prevista:

```
src/engine/simulate.ts      grafo + escenario → métricas por pieza y globales
src/engine/score.ts         métricas + reglas → estrellas y diferencias
src/engine/components.ts    catálogo de piezas
src/engine/hints.ts         detecta el bloqueo y elige la pista según el fallo
src/missions/pastebin.ts    preguntas, estimaciones, escenarios, reglas, pistas, solución
src/lessons/                retos de cada lección y escenas propias
src/game/map/               mapa de lecciones y misiones
src/game/                   pantallas de cada fase
src/game/canvas/            lienzo con React Flow
src/save.ts                 progreso, exportación e importación
```

**Pendiente del constructor:** detalle visual, forma exacta del modelo de latencia y calibración de valores, siempre que cumplan las pruebas de abajo.

## Verificación

**Pruebas del motor (Vitest), con diseños fijos de Pastebin:**
- Referencia de cada variante: 3 estrellas.
- Referencia con NoSQL clave-valor en lugar de SQL: 3 estrellas y clasificada como "elegí distinto, pero es válido".
- Un solo servidor: pierde la estrella de fiabilidad.
- Sin caché ni CDN: pierde la estrella de rendimiento en el paste viral.
- Diseño sobredimensionado con sharding: pierde la estrella de coste.
- Contador de visitas en la base: falla la regla de estadísticas y aumenta las escrituras simuladas.
- Una pieza ausente de la referencia sin alternativa: clasificada como "faltó una pieza".
- Mismo diseño, variante y escenario: mismo resultado siempre.
- Grafos inválidos (ciclos, piezas sueltas, sin almacenamiento): error claro, sin colgarse.

**Pruebas de pistas (Vitest):**
- Cada señal de bloqueo activa la oferta de ayuda, y sin bloqueo no aparece.
- El fallo actual selecciona la pista correcta para cada escenario de Pastebin.
- Las pistas de nivel 2 y 3 limitan las estrellas a 2 y 1, y las de nivel 1 no cambian nada.
- Ningún texto de pista de Pastebin contiene el nombre de la pieza de la solución ni sus números finales.

**Prueba de punta a punta (Playwright, en el navegador):** recorrer el mapa, completar una lección de cada formato, jugar Pastebin usando una pista, comprobar estrellas y comparación, recargar y verificar que el progreso sigue ahí.

**Prueba real:** Gabriel juega las 3 lecciones y Pastebin sin mirar sus notas. Funciona si en cada lección predice mal al menos una vez y lo entiende al verlo, si en la misión aparece una decisión que no había previsto y si, al repetirla, llega a ella por sí mismo y con menos pistas.

## Después de aprobar

1. Crear el repositorio y guardar este diseño en `docs/superpowers/specs/2026-10-31-system-design-game-design.md`.
2. Escribir el plan de implementación con `superpowers:writing-plans`.
