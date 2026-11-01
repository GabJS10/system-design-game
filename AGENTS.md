# AGENTS.md

Juego de navegador para practicar diseño de sistemas, de uso personal. Tiene lecciones interactivas de los temas 1–17 del System Design Primer y misiones basadas en sus 8 ejercicios.

## Documentos clave

- Diseño: `docs/superpowers/specs/2026-10-31-system-design-game-design.md`. Es la autoridad si algo entra en conflicto.
- Plan de la primera entrega: `docs/superpowers/plans/2026-10-31-primera-entrega.md`.

## Comandos

- `npm run dev`: servidor de desarrollo.
- `npm test`: pruebas unitarias con Vitest.
- `npm run e2e`: pruebas de navegador con Playwright.
- `npm run build`: comprobación de tipos y compilación.

Requiere Node 24 o superior.

## Arquitectura

- `src/engine/`: motor y lógica de pistas en TypeScript puro. No importa React.
- `src/missions/` y `src/lessons/`: contenido como datos; las escenas propias de una lección son componentes React.
- `src/game/`: pantallas y lienzo.
- `src/save.ts`: progreso en `localStorage`.

## Reglas

- Todo el texto visible está en español.
- La simulación es determinista: sin `Math.random` ni `Date.now` en `simulate.ts` ni en `score.ts`.
- Sin servidor, cuentas, IA ni llamadas a Notion en tiempo de ejecución. Las notas solo se enlazan.
- La evaluación nunca compara el diseño con la referencia pieza por pieza: usa comportamiento, reglas y funciones.
- Las pistas nunca nombran la pieza de la solución ni sus números finales.
- Solo se publican piezas que el motor simula de verdad.
- Las explicaciones de una lección aparecen después de que el jugador vea el resultado.
- No añadas dependencias sin justificarlo en el commit.

## Forma de trabajo

- Desarrolla la lógica con TDD: escribe la prueba, mírala fallar y luego implementa.
- Trabaja en ramas, no en `master`.
- Los mensajes de commit no llevan atribución a Claude: sin `Co-Authored-By` ni menciones similares.
- Pide confirmación antes de publicar en Vercel.
