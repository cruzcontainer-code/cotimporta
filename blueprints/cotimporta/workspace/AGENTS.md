# Cotimporta — instrucciones para agentes

Cotizador web de importaciones a Perú: costo puesto en Perú con tributos, etapas de pago y PDF formal (ES/EN).

## Comandos

Requiere Node 24.22.3 y pnpm 12.18.0 en `$HOME/.local/bin` (`export PATH="$HOME/.local/bin:$PATH"`).

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Dev | `pnpm dev` |
| Build | `pnpm build` |
| Probar build | `bash scripts/serve-check.sh <ruta> <estado> [patrón] [cookie]` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Tests | `pnpm test` · `pnpm test:e2e` |
| Postgres local | `pnpm db:up` · `pnpm db:migrate` · `pnpm db:seed` |

Gate antes de dar algo por hecho: `pnpm typecheck && pnpm lint && pnpm test`.

## No negociable

1. Responder en español. Código, comandos e identificadores en inglés.
2. Nunca guardar llaves ni contraseñas en el repositorio, en logs ni en prompts de IA.
3. Toda tasa tributaria sale de una tabla versionada con `effective_from` y `source_url`; el motor nunca usa números de la IA.
4. Toda lectura o escritura de datos de usuario pasa por `src/server/authz.ts`; recurso ajeno = 404.
5. Cada cotización muestra el aviso "Estimación referencial" y guarda el snapshot de reglas usado.
6. Nunca editar a mano migraciones generadas en `drizzle/`.
7. Nunca marcar una tarea como hecha con un gate en rojo, ni editar un comando `verify`.

Orden de construcción: `blueprints/cotimporta/tasks.json` y `blueprints/cotimporta/epics/`.
Arquitectura, límites y tokens de diseño: `CLAUDE.md` en este directorio (fuente canónica).
