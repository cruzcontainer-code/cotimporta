# Cotimporta

Cotizador web de importaciones a Perú ("puesto en Perú"): el emprendedor describe su producto, sube la ficha técnica del proveedor y obtiene el costo total con tributos, etapas de pago, escenarios de precio y un PDF formal (ES/EN). Dueño: asesor de comercio exterior (Cruz Container).

## Comandos

Cada shell nueva necesita Node 24.22.3 y pnpm 12.18.0, que el Bootstrap deja en `$HOME/.local/bin`:
`export PATH="$HOME/.local/bin:$PATH"` (el hook `SessionStart` de `.claude/settings.json` lo hace solo).

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Dev | `pnpm dev` — http://localhost:3000 |
| Build | `pnpm build` |
| Probar build de producción | `bash scripts/serve-check.sh <ruta> <estado> [patrón] [cookie]` (requiere `pnpm build`) |
| Typecheck | `pnpm typecheck` (`next typegen && tsc --noEmit`) |
| Lint / formato | `pnpm lint` · `pnpm format` |
| Unit + integración | `pnpm test` · un archivo: `pnpm test tests/integration/x.test.ts` |
| E2E | `pnpm test:e2e` · un spec: `pnpm test:e2e tests/e2e/x.spec.ts` |
| Postgres local | `pnpm db:up` · `pnpm db:down` · `pnpm db:reset` (borra datos locales) |
| Migraciones | `pnpm db:generate` (tras editar `src/db/schema.ts`) · `pnpm db:migrate` |
| Seed demo | `pnpm db:seed` (idempotente) |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` debe pasar antes de marcar una tarea como hecha.
Los tests de integración y E2E necesitan `pnpm db:up` (Docker). Runtime fijado en `.nvmrc` y
`packageManager`; las versiones de dependencias viven en `pnpm-lock.yaml` — léelo, nunca adivines.

## Cómo construir

Sigue `blueprints/cotimporta/tasks.json` en orden de arreglo y abre solo el epic de la tarea
(`blueprints/cotimporta/epics/`). Un paso = un commit + un tag `step-NN-<slug>`. No toques
`blueprints/` salvo para marcar `status` en `tasks.json`. Nunca saltes un paso bloqueado: detente y reporta.

## Stack

Next.js 16 (App Router) · TypeScript 7 · Tailwind CSS 4 (tokens en `src/app/globals.css`) · next-intl (es/en) · Postgres 17 + Drizzle ORM · better-auth (email + contraseña verificada) · Gemini (`@google/genai`) · @react-pdf/renderer · pdfjs-dist · Vercel + Neon.

## Arquitectura

**Recorrido de una petición.** navegador → `src/app/(app)/app/quotes/[id]/page.tsx` (servidor) →
server action en `src/app/(app)/app/quotes/actions.ts` → `src/server/quotes/service.ts` →
`src/server/authz.ts` (dueño o 404) → `src/server/rules/repository.ts` (reglas vigentes) →
`src/lib/engine/calculate.ts` (puro) → `src/db/client.ts` → Postgres.

| Capa | Puede importar | Nunca |
|---|---|---|
| `src/app/**` | `components`, `server`, `lib`, `i18n` | `db/` directo |
| `src/components/**` | `lib`, `i18n`, otros componentes | `server/`, `db/` |
| `src/server/**` | `db`, `lib`, `server` | React de cliente, `components/` |
| `src/lib/engine/**` | solo `src/lib/engine/**` | `@/server`, `@/db`, `node:*`, `fetch` |
| `src/db/schema.ts`, `src/db/seed*.ts` | paquetes y `./x.ts` relativos | el alias `@/` (los corre Node sin bundler) |

| Asunto | Fuente única |
|---|---|
| Esquema | `src/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate` |
| Entorno | `src/lib/env.ts` — nunca leer `process.env` en otro archivo de `src/` (excepción: `src/db/seed.ts`) |
| Sesión | `src/lib/auth.ts` → `getSessionUser()` / `requireUser()` |
| Propiedad de filas | `src/server/authz.ts` → `ownedQuoteOrThrow()`; ajeno = `NOT_FOUND` (404) |
| Cuotas | `src/server/billing/entitlements.ts` → `getEntitlement()` |
| Tasas y reglas | tablas `tax_rates`, `tariff_rates`, `perception_rules`, `trade_agreements` — jamás literales en código |
| Dinero | enteros en unidades menores (`bigint`), USD; PEN solo al final con el TC único de la cotización |
| Proveedor de IA | `src/server/ai/gateway.ts` es el único archivo que importa `@google/genai` |
| Pagos | `src/server/billing/provider.ts` (interfaz `PaymentProvider`; drivers `fake` e `izipay`) |
| Archivos | `src/server/storage/index.ts` (interfaz `StorageProvider`; driver `local`) |
| Correo | `src/server/email.ts` (interfaz `EmailProvider`; driver `log`) |

## Reglas de código

1. **Máx. 300 líneas por archivo** en `src/components` y `src/app`; un componente principal por archivo.
2. **Alias `@/` → `src/`**, sin extensión, en todo el código de app y tests. Excepción única:
   `src/db/schema.ts` y `src/db/seed*.ts` usan rutas relativas con `.ts` (ver `.claude/rules/database.md`).
3. **Server Components por defecto.** `"use client"` solo en la hoja que tiene estado o eventos.
4. **Sin barrel files.** Importa desde el módulo fuente.
5. **Valida en el borde con Zod** cada server action y route handler antes de llamar a `src/server/`.
6. **Resultados tipados:** `{ ok: true, data } | { ok: false, error: { code, message } }`; códigos en `src/server/errors.ts`.
7. **Textos de UI** en un objeto `copy` tipado `Copy<T>` (`{ es: T; en: T }`) junto al componente; compartidos en `src/i18n/messages.ts`.
8. **Ninguna dependencia nueva** sin que el blueprint la nombre — pregunta antes de instalar.

## Sistema de diseño

Minimalista, mucho aire, bordes finos, radio 8 px. Tokens en `src/app/globals.css` (`@theme`); nada de hex sueltos.

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo | `#FFFFFF` | `#0B1220` |
| Superficie | `#F8FAFC` | `#111A2E` |
| Borde fino | `#E2E8F0` | `#1F2A44` |
| Borde de control | `#64748B` | `#64748B` |
| Texto | `#0F172A` | `#E5E7EB` |
| Texto atenuado | `#64748B` | `#94A3B8` |
| Acento | `#2563EB` | `#60A5FA` |
| Éxito | `#15803D` | `#4ADE80` |
| Aviso | `#B45309` | `#FBBF24` |
| Peligro | `#B91C1C` | `#F87171` |

- **Tipo:** `Inter, ui-sans-serif, system-ui, sans-serif`; escala 12/14/16/20/24/32 px; cuerpo 16/24.
- **Espaciado:** base 4 px — 4, 8, 12, 16, 24, 32, 48, 64. **Radio:** 8 px; píldoras 9999 px.
- **Elevación:** plano, solo bordes. **Movimiento:** 150 ms `ease-out`, solo opacidad/transform; respeta `prefers-reduced-motion`.
- **Layout:** ancho máx. 1120 px; breakpoints 640/768/1024/1280; mobile-first.
- **Logo:** `public/brand/logo.svg` (web) y `public/brand/logo.png` (PDF); si faltan, wordmark "Cotimporta".

## Entorno

Tabla completa (propósito, origen, paso que la requiere): `blueprints/cotimporta/blueprint.md` §10.
`.env.example` se versiona; `.env` nunca. Local funciona sin llaves reales (drivers `log`, `local`, `fake`).

## Reglas por área

| Archivo | Aplica a |
|---|---|
| `.claude/rules/database.md` | `src/db/**`, `drizzle/**` |
| `.claude/rules/engine.md` | `src/lib/engine/**`, `tests/unit/engine/**` |
| `.claude/rules/server.md` | `src/server/**`, `src/app/api/**`, `src/app/**/actions.ts` |
| `.claude/rules/ui.md` | `src/app/**/*.tsx`, `src/components/**` |
| `.claude/rules/testing.md` | `tests/**` |
| `.claude/rules/ai-billing.md` | `src/server/ai/**`, `src/server/billing/**`, `src/app/api/webhooks/**` |

## No negociable

1. Responder en español. Código, comandos e identificadores en inglés.
2. Nunca guardar llaves ni contraseñas en el repositorio, en logs ni en prompts de IA.
3. Toda tasa tributaria sale de una tabla versionada con `effective_from` y `source_url`; el motor nunca usa números de la IA.
4. Toda lectura o escritura de datos de usuario pasa por `src/server/authz.ts`; recurso ajeno = 404.
5. Cada cotización muestra el aviso "Estimación referencial" y guarda el snapshot de reglas usado.
6. Nunca editar a mano migraciones generadas en `drizzle/`.
7. Nunca marcar una tarea como hecha con un gate en rojo, ni editar un comando `verify`.
