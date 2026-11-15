# Cotimporta — Blueprint

> Generado por The Architect el 2026-11-13
> Shape: saas-webapp · `knowledge/shapes/saas-webapp.md`
> Runtime track: ts-node · `knowledge/runtime-tracks/ts-node.md`
> Modo de emisión: bundle (`blueprints/cotimporta/` — 18 pasos)
> Versión del blueprint: 1
> Versiones verificadas por última vez: 2026-11-13 — ver §11 para la procedencia por paquete

Idioma: español (es-PE). Código, comandos, rutas, variables de entorno y las palabras EARS
(`WHEN`, `THE SYSTEM SHALL`) quedan en inglés.

---

## 1. Visión general y No-Objetivos (Project Overview & Non-Goals)

### Visión

Cotimporta es una herramienta web (dominio propio, enlazada desde la web del dueño) donde un
emprendedor que evalúa importar a Perú obtiene en minutos el costo **puesto en Perú** de un equipo:
describe el producto, sube la ficha técnica PDF de su proveedor chino, y recibe la partida
arancelaria sugerida (que él confirma), los tributos aplicados con su fuente oficial (ad valorem,
sobretasa, antidumping, ISC, IGV, IPM, percepción, exoneraciones por TLC con certificado de origen),
el costo total, el factor de importación, el costo unitario, escenarios de precio de venta, el
cronograma de pagos en 6 etapas y un PDF formal y minimalista como `reference/cotizacion-bg880-ejemplo.pdf`.

Reemplaza el flujo actual del dueño (asesor de comercio exterior, empresa Cruz Container): un Excel
más un chat de Gemini. El motor de cálculo mejora ese Excel: IGV por línea con banderas por línea,
tasas en tablas versionadas con fuente y vigencia, un único tipo de cambio por cotización, dinero en
enteros y un snapshot de reglas que hace cada cotización reproducible. La IA solo asiste (partida,
ficha técnica, fotos, redacción); jamás es fuente de tasas ni de montos.

### Usuarios

| Persona | Qué viene a hacer | Frecuencia |
|---|---|---|
| Emprendedor en Perú (paga en PEN) | Saber cuánto le cuesta realmente importar una máquina antes de decidir el negocio | Semanal mientras evalúa; 1–10 cotizaciones/mes |
| Emprendedor extranjero (paga en USD) | Lo mismo, para un destino Perú | Ocasional |
| Dueño / admin (rol `admin`) | Editar los gastos locales semanales, revisar y publicar reglas importadas, fijar tasas y el plan | Semanal |

### Objetivos — alcance v1

1. Registro, ingreso, salida y recuperación de contraseña con email verificado; cuentas individuales (`user_id` en cada fila).
2. Una cotización gratuita completa por cuenta verificada; plan mensual con tope de 10 cotizaciones por periodo, cobrado en PEN (Perú) o USD (resto) a través de una interfaz `PaymentProvider` con driver Izipay.
3. Asistente de cotización: producto → partida (sugerencia IA validada + confirmación) → PDF del proveedor (subida, extracción, traducción ES↔EN, fotos) → costos y términos del proveedor → resultado.
4. Motor puro con IGV por línea, exoneraciones explicadas, percepción por regla, un TC único, etapas de pago, factor, costo unitario y escenarios de margen; snapshot de reglas por cotización.
5. Guardar, listar, comparar y borrar (lógico) cotizaciones; descarga del PDF formal en el idioma elegido.
6. Panel admin: gastos locales por defecto (semanal), tasas tributarias, plan, revisión y publicación de reglas importadas (job programado + CSV de respaldo).
7. ES/EN en UI, PDF y explicaciones; exportación de datos y borrado de cuenta (Ley 29733); límites de uso; reporte de errores; CI.

### No-Objetivos — fuera de alcance en v1

| No se construye | Por qué no ahora | Se reconsidera cuando |
|---|---|---|
| Equipos / cuentas compartidas | Tenencia por usuario es el modelo de negocio v1; organizaciones reescriben autorización | Un cliente pague por 2+ asientos |
| Seguimiento de embarques | No es parte de la decisión de compra; requiere integraciones con navieras | La retención mensual pida seguimiento post-compra |
| Trámite / despacho aduanero (DUA real) | La cotización es referencial; presentar DUAs es actividad regulada del agente | El dueño decida ofrecerlo como servicio digital |
| Destinos distintos de Perú | Todas las reglas y tablas son peruanas | Demanda probada de otro país con su propio arancel |
| Módulo de agencia propia (agentes en China, cotizar servicios locales) | v2; el esquema ya guarda `concept_code` + `provider_name` por línea de costo para no reescribir | Tras 3 meses de cotizaciones reales |
| App móvil nativa | La web responsive cubre el uso | El tráfico móvil supere 60 % con quejas de usabilidad |
| Chat con la IA | La IA es asistente puntual con salida estructurada; un chat abre superficie de error y costo | Usuarios pidan iterar sobre la ficha más allá de editarla |
| Exportar a Word / Excel | El PDF formal es el entregable | Clientes B2B lo exijan |
| Créditos / pago por uso | El modelo es suscripción plana con tope | El costo de IA por cotización supere el margen del plan |
| Vista de soporte por cotización en admin | Fuera de alcance en el brief (privacidad) | El dueño necesite soporte asistido con consentimiento |

**El builder no implementa nada de esta tabla**, aunque parezca un agregado pequeño. Si un paso
parece requerirlo, es un defecto del blueprint: detenerse y reportarlo.

### Métricas de éxito

| Métrica | Meta | Cómo se mide |
|---|---|---|
| Cotizaciones calculadas por semana | ≥ 30 a los 60 días del lanzamiento | `select count(*) from quotes where calculated_at > now() - interval '7 days'` |
| Conversión gratis → plan | ≥ 5 % a los 90 días | cuentas con `subscriptions.status='active'` / cuentas con `usage_counters.kind='free'` y `quotes_used=1` |
| Partida sugerida aceptada | ≥ 60 % | `quotes.tariff_heading_code` igual a algún candidato registrado en `audit_events` (`action='heading.suggested'`) |
| Extracción de ficha sin edición manual mayor | ≥ 70 % | `supplier_documents.extraction_status='done'` / total |
| Errores 5xx | < 0,5 % de peticiones | logs JSON (`level=error`, `status>=500`) |

---

## 2. Stack técnico (Tech Stack)

**Runtime track: ts-node.** Esta tabla nombra decisiones, no versiones. Toda versión vive en §11.
Las versiones vienen del informe de `stack-researcher` de esta sesión (2026-11-13); el track
`knowledge/runtime-tracks/ts-node.md` es respaldo solo para lo que el informe no resolvió.

| Capa | Decisión | Por qué esta, frente a qué |
|---|---|---|
| Lenguaje / runtime | TypeScript sobre Node 24 LTS (Krypton) | Un lenguaje en UI, servidor, motor y scripts. Node 26 LTS también fue verificado, pero su soporte en Vercel no está verificado; 24 es la opción segura de hosting |
| Framework | Next.js App Router | Server Components + server actions cubren UI, transporte y route handlers en un despliegue; frente a Vite+Hono, que obliga a dos routers |
| Estilos | Tailwind CSS 4 (config CSS-first en `globals.css`) con tokens como variables CSS | Tokens únicos para web y PDF; frente a CSS Modules, más nombres y CSS muerto |
| Capa de componentes | HTML nativo + clases utilitarias propias estilo shadcn (`btn`, `input`, `card`…) | Sin dependencias sin fijar ni CLI interactiva; `<dialog>`/`<select>` nativos son accesibles. Frente a `shadcn` CLI, que instala Radix y utilidades sin versión fijada en este informe |
| Base de datos | Postgres 17 (Neon en producción, Docker local) | Datos relacionales con restricciones (reglas con vigencia, cotizaciones con hijas); Neon da ramas por PR y región São Paulo (no verificada); frente a Supabase, que trae auth y storage que no usamos |
| ORM | Drizzle ORM + drizzle-kit (0.x exacto) | Esquema TypeScript como fuente única, SQL explícito, `select … for update` sin fricción; frente a Prisma, cliente generado y paso de codegen |
| Auth | better-auth (email + contraseña, verificación obligatoria) | Usuarios en nuestra base (exportar/borrar bajo Ley 29733 sin terceros), sin costo por usuario; frente a Auth.js (v5 solo beta) y Clerk (usuarios fuera, costo por MAU) |
| Tareas en segundo plano | Vercel Cron → `GET /api/cron/rules-import` (protegido con `CRON_SECRET`) | Un job diario e idempotente; frente a un worker dedicado, que exige otro servicio |
| Pagos | `PaymentProvider` con drivers `fake` (dev/test) e `izipay` (cuenta del dueño); checkout alojado (redirect) | El dueño ya tiene Izipay; la interfaz permite cambiar de pasarela. Recurrencia y USD no verificadas → paso 11 lo resuelve antes del paso 17 |
| Almacenamiento de archivos | `StorageProvider` con driver `local` (dev/test); proveedor de producción se elige al desplegar | PDFs subidos, fotos y PDFs generados son privados; la app sirve bytes solo tras verificar propiedad |
| Email | `EmailProvider` con driver `log` (outbox en disco para dev/test); proveedor de producción se elige al desplegar | Verificación y recuperación funcionan y se prueban sin red |
| IA | Gemini vía `@google/genai`, importado solo en `src/server/ai/gateway.ts` | Es el modelo que el dueño ya usa; el gateway aísla al proveedor |
| PDF | `@react-pdf/renderer` (generación) + `pdfjs-dist` (lectura de imágenes y texto) | JS puro, sin binarios nativos; frente a mupdf (AGPL) y pdf-lib (sin mantenimiento) |
| i18n | next-intl sin rutas por idioma (locale por cookie `NEXT_LOCALE` + perfil) | URLs estables; el idioma es preferencia del usuario |
| Hosting | Vercel (región `gru1`, São Paulo) | Plataforma del framework: previews, rollback, cron; frente a un contenedor propio |
| Gestor de paquetes | pnpm 12 (`packageManager`) | node_modules estricto y aprobación explícita de scripts de build |
| Lint + formato | Biome | Una herramienta, rápida; con `css.parser.tailwindDirectives` para Tailwind 4 |
| Pruebas | Vitest (unit + integración contra Postgres real) y Playwright (E2E sobre el build de producción) | Integración pesa más que unit: los defectos aquí son de cableado (tenencia, cuotas, reglas) |

### Verificación de compatibilidad

Revisado contra `knowledge/stack-compatibility.md`: ninguna de sus filas de combinaciones conocidas
como malas aplica, con esta salvedad tratada explícitamente:

- **Linter que parsea CSS + Tailwind 4 con at-rules**: aplica (Biome + Tailwind). Se resuelve con
  `"css": { "parser": { "tailwindDirectives": true } }` en `biome.json` desde el Bootstrap, antes del
  primer `pnpm lint`.
- **Conexiones serverless + Postgres sin pooler**: en producción `DATABASE_URL` apunta al host con
  pooler de Neon y `DATABASE_URL_UNPOOLED` solo se usa en migraciones (CI). El cliente usa
  `prepare: false` (pooler en modo transacción).
- **Dos proveedores de identidad**: solo better-auth.
- Gotchas del track que se arrastran: `proxy.ts` reemplaza a `middleware.ts` (no se usa ninguno: la
  guardia real está en layouts y servicios); Turbopack por defecto; Drizzle 0.x fijado exacto;
  `corepack enable` con `--install-directory` escribible; pnpm 12 y `allowBuilds`.

---

## 3. Estructura de directorios (Directory Structure)

```
cotimporta/                                # raíz del repo (ya existe: git en main, CLAUDE.md, README.md, .claude/, reference/, blueprints/, src/)
├── .claude/
│   ├── settings.json                      # ws — fusiona plugin the-architect + allowlist + hook PATH
│   ├── rules/{database,engine,server,ui,testing,ai-billing}.md   # ws — reglas por ruta
│   └── skills/{add-migration,run-step-gate}/SKILL.md             # ws
├── .github/workflows/ci.yml               # ws — gate de CI = §20.1
├── blueprints/cotimporta/                 # ESTE bundle (excluido de lint, tsc, tests, tailwind)
├── reference/                             # PDF y datos de ejemplo del dueño (solo lectura; excluido de herramientas)
├── docker/postgres-init/01-test-db.sql    # ws — crea cotimporta_test
├── docs/verified/                         # paso 11 — hechos externos verificados con fecha y URL
│   ├── gemini-model.md
│   ├── izipay.md
│   └── tariff-source.md
├── drizzle/                               # migraciones que emite `pnpm db:generate` (nombres los elige drizzle-kit) — paso 2
├── public/brand/                          # logo.svg (web) y logo.png (PDF) del dueño — opcionales; sin ellos, wordmark
├── scripts/serve-check.sh                 # ws — levanta el build de producción y verifica una ruta
├── src/
│   ├── app/
│   │   ├── layout.tsx                     # paso 1 — html lang/clase de tema, proveedor next-intl, cabecera con logo
│   │   ├── page.tsx                       # paso 1 — landing pública mínima
│   │   ├── globals.css                    # paso 1 — tokens @theme + utilidades btn/input/card/table-base/badge
│   │   ├── (auth)/auth/[mode]/page.tsx    # paso 4 — sign-in | sign-up | forgot | reset | check-email
│   │   ├── (app)/app/
│   │   │   ├── layout.tsx                 # paso 4 — shell protegido (requireUser), nav, idioma, tema, salir
│   │   │   ├── page.tsx                   # paso 4 — "Panel"
│   │   │   ├── quotes/
│   │   │   │   ├── page.tsx               # paso 9 — listado + "Nueva cotización"
│   │   │   │   ├── actions.ts             # paso 8 (+9, +15) — server actions del cotizador
│   │   │   │   ├── [id]/page.tsx          # paso 8 (+14, +16) — asistente de la cotización
│   │   │   │   └── compare/page.tsx       # paso 9
│   │   │   ├── billing/page.tsx           # paso 17
│   │   │   └── settings/page.tsx          # paso 18
│   │   ├── (admin)/admin/
│   │   │   ├── layout.tsx                 # paso 10 — requireAdmin (no-admin → 404)
│   │   │   ├── charges/page.tsx           # paso 10 — gastos locales semanales
│   │   │   ├── settings/page.tsx          # paso 10 — tasas tributarias y plan
│   │   │   └── rules/page.tsx             # paso 12 — corridas, diff, publicar, CSV
│   │   └── api/
│   │       ├── auth/[...all]/route.ts     # paso 3 — better-auth + límites
│   │       ├── v1/quotes/[id]/documents/route.ts  # paso 13 — POST subida, GET ?image=
│   │       ├── v1/quotes/[id]/pdf/route.ts        # paso 16
│   │       ├── v1/account/export/route.ts         # paso 18
│   │       ├── webhooks/payments/[provider]/route.ts  # paso 17
│   │       ├── cron/rules-import/route.ts         # paso 12
│   │       └── health/route.ts                    # paso 18
│   ├── components/
│   │   ├── auth/auth-form.tsx             # paso 4 (cliente)
│   │   └── quotes/
│   │       ├── quote-wizard.tsx           # paso 8 (cliente)
│   │       └── document-step.tsx          # paso 14 (cliente)
│   ├── db/
│   │   ├── schema.ts                      # paso 2 — todas las tablas (§4)
│   │   ├── client.ts                      # paso 2 — cliente drizzle único
│   │   ├── seed.ts                        # paso 6 — `pnpm db:seed` (Node puro)
│   │   └── seed-data.ts                   # paso 6 — filas demo
│   ├── i18n/
│   │   ├── request.ts                     # paso 1 — locale por cookie/Accept-Language
│   │   └── messages.ts                    # paso 1 — textos compartidos es/en + tipo Copy<T>
│   ├── lib/
│   │   ├── env.ts                         # paso 2 — Zod sobre process.env (única lectura)
│   │   ├── auth.ts                        # paso 3 — better-auth + getSessionUser/requireUser
│   │   └── engine/{types,money,calculate}.ts   # paso 7 — motor puro
│   └── server/
│       ├── authz.ts · errors.ts           # paso 5
│       ├── email.ts · rate-limit.ts       # paso 3
│       ├── quotes/service.ts              # paso 5 (+8, +9)
│       ├── billing/entitlements.ts        # paso 5
│       ├── billing/{provider,service}.ts  # paso 17
│       ├── rules/repository.ts            # paso 6
│       ├── rules/import.ts                # paso 12
│       ├── admin/service.ts               # paso 10
│       ├── storage/index.ts               # paso 13
│       ├── documents/service.ts           # paso 13
│       ├── ai/{gateway,extract-specs}.ts  # paso 14
│       ├── ai/{suggest-heading,narrative}.ts  # paso 15
│       ├── pdf/{quote-document,render}.ts # paso 16
│       └── account/service.ts             # paso 18
├── tests/
│   ├── setup/integration.ts               # ws — migra cotimporta_test
│   ├── helpers/session.ts                 # paso 13 — sesión verificada para tests de route handlers
│   ├── unit/…                             # pasos 7, 11
│   ├── integration/…                      # pasos 2, 3, 5, 6, 8, 10, 12–18
│   └── e2e/
│       ├── env.ts · helpers.ts · global-setup.ts   # ws
│       └── {auth-shell,quotes}.spec.ts    # pasos 4, 9
├── .env.example · .gitignore · .nvmrc     # ws
├── biome.json · tsconfig.json · next.config.ts · postcss.config.mjs   # ws
├── vitest.config.ts · playwright.config.ts · drizzle.config.ts        # ws
├── docker-compose.yml · package.json · pnpm-workspace.yaml            # ws
├── vercel.json                            # paso 12 — crons + región
├── pnpm-lock.yaml                         # lo escribe `pnpm install` en el Bootstrap
├── CLAUDE.md · AGENTS.md                  # ws (CLAUDE.md reemplaza al placeholder existente)
└── README.md                              # existente, no se toca
```

`ws` = emitido como archivo real en `blueprints/cotimporta/workspace/` y copiado a la raíz por el
Bootstrap (§10). El builder copia **ese único directorio**; nada más del bundle se copia.

**Reglas de frontera**
- Nada en `src/components/` importa de `src/server/` ni de `src/db/`; los datos llegan como props desde páginas de servidor.
- `src/db/client.ts` es el único lugar que abre una conexión desde la app (excepciones: `src/db/seed.ts`, `drizzle.config.ts`, `tests/setup/integration.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/helpers.ts`).
- `src/lib/engine/**` es puro: no importa `@/server`, `@/db`, `node:*` ni llama `fetch`.
- `src/server/ai/gateway.ts` es el único importador de `@google/genai`.
- Convención de importación: ver §19.6 *Matriz de convención de resolución* (alias `@/` sin extensión; `src/db/schema.ts` y `src/db/seed*.ts` con relativos `.ts`).

---

## 4. Modelo de datos (Data Model)

Convenciones: tablas en plural `snake_case`; dinero en `bigint` (unidades menores, USD salvo que
`currency` diga otra cosa); tasas en `integer` bps (1 bps = 0,01 %); tipo de cambio en `integer`
PEN por USD × 10 000 (3,50 → 35 000); fechas-hora `timestamptz` en UTC; vigencias `date` con
`effective_from` inclusivo y `effective_to` exclusivo (nulo = vigente). Toda fila de usuario lleva
`user_id`. Las tablas `users`, `sessions`, `accounts`, `verifications` siguen el modelo de
better-auth con `usePlural: true`.

### Entidades

| Tabla | Qué representa / ciclo de vida | Dueño | Al borrar la cuenta |
|---|---|---|---|
| `users` | Usuario (fuente de verdad, better-auth) con `role` user/admin | sí | se borra |
| `sessions`, `accounts`, `verifications` | Sesiones, credenciales (hash de contraseña), tokens de verificación/reset | sí (`verifications` por `identifier`) | cascada / expiran |
| `profiles` | Locale, país, moneda (PE→PEN, resto→USD), empresa | `user_id` PK | cascada |
| `plans` | Configuración del plan (código, precios PEN/USD, cuota por periodo, activo) | admin | — |
| `subscriptions` | Una por usuario; escrita solo por eventos de pago verificados | `user_id` único | cascada |
| `payment_events` | Libro de idempotencia de webhooks (único por proveedor + id de evento) | `user_id` nullable | `user_id` → nulo, `payload` anonimizado |
| `usage_counters` | Contador de cotizaciones por periodo (`free` con periodo fijo 1970-01-01; `subscription` por periodo) | sí | cascada |
| `reference_counters` | Secuencia anual para `COT-AAAA-NNNN` | sistema | — |
| `quotes` | Cotización; borrado lógico `deleted_at`; guarda `result`, `rule_snapshot`, `specs`, `narrative` | sí | cascada |
| `quote_lines` | Ítems de la factura del proveedor (FOB = suma) | sí | cascada |
| `quote_cost_lines` | Líneas de costo con banderas `origin`, `igv_applicable`, `in_cif`, `concept_code`, `provider_name` | sí | cascada |
| `quote_supplier_terms` | Adelanto/saldo (bps) y plazos del proveedor | sí | cascada |
| `quote_stages` | Las 6 etapas calculadas (USD y PEN) | sí | cascada |
| `quote_tax_breakdown` | Cada línea tributaria con base, tasa, monto, regla, vigencia y fuente | sí | cascada |
| `supplier_documents` | PDF subido (clave de storage, SHA-256), estado y JSON de extracción | sí | cascada + archivos borrados |
| `document_images` | Fotos extraídas (orden, incluida o no) | sí | cascada + archivos borrados |
| `generated_documents` | PDFs generados (versión por locale) | sí | cascada + archivos borrados |
| `tariff_headings`, `tariff_rates` | Partidas y derechos publicados con vigencia y fuente | admin | — (`reviewed_by` → nulo) |
| `trade_agreements` | Acuerdos por país y qué exoneran | admin | — |
| `tax_rates` | IGV, IPM, UIT, tasa de despacho con vigencia y fuente | admin | — |
| `perception_rules` | Percepción por condición del importador (y excepciones por prefijo de partida) | admin | — |
| `default_local_charges` | Gastos locales por defecto; cada edición semanal es una fila nueva con `valid_from` | admin | — |
| `rule_import_runs` + `staging_tariff_headings` + `staging_tariff_rates` | Corridas de importación y sus filas en revisión | admin | — |
| `audit_events` | Acciones relevantes (admin, cuota, borrado) | `actor_user_id` nullable | → nulo |
| `data_export_requests` | Registro de exportaciones | sí | cascada |
| `rate_limit_buckets` | Ventanas fijas de límite de uso | sistema | — |
| `ai_calls` | Cada llamada a la IA: propósito, modelo, latencia, tokens, estado | `user_id` | cascada |

### Relaciones

- `users` 1—1 `profiles` (cascade) · 1—0..1 `subscriptions` (cascade) · 1—N `sessions`, `accounts`, `quotes`, `usage_counters`, `ai_calls`, `data_export_requests` (cascade).
- `quotes` 1—N `quote_lines`, `quote_cost_lines`, `quote_stages`, `quote_tax_breakdown`, `supplier_documents`, `document_images`, `generated_documents` (cascade); 1—0..1 `quote_supplier_terms` (cascade).
- `supplier_documents` 1—N `document_images` (cascade).
- `subscriptions.plan_code` → `plans.code` (restrict: no se borra un plan con suscripciones).
- `quote_cost_lines.default_charge_id` → `default_local_charges.id` (set null).
- `payment_events.user_id`, `audit_events.actor_user_id`, `*.reviewed_by`, `default_local_charges.created_by`, `rule_import_runs.published_by` → `users.id` (set null).
- `staging_*.run_id` → `rule_import_runs.id` (cascade).
- `quotes.tariff_heading_code` no lleva FK (la partida tiene historial por vigencia); se valida en el servicio contra `tariff_headings`.

### Índices

| Tabla | Índice | Por qué |
|---|---|---|
| `quotes` | (`user_id`, `created_at`) | listado paginado por usuario |
| `quotes` | (`user_id`, `deleted_at`) | filtro de no borradas |
| `quote_*`, `supplier_documents`, `document_images` | `quote_id` | carga de hijas |
| `usage_counters` | único (`user_id`, `kind`, `period_start`) | bloqueo y conteo por periodo |
| `payment_events` | único (`provider`, `external_event_id`) | idempotencia |
| `tariff_headings` | único (`code`, `effective_from`) + `code` | resolución por vigencia |
| `tariff_rates` | único (`heading_code`, `kind`, `effective_from`) | resolución por vigencia |
| `tax_rates` | único (`kind`, `effective_from`) | resolución por vigencia |
| `perception_rules` | único (`condition_code`, `heading_prefix`, `effective_from`) | seed idempotente + resolución |
| `trade_agreements` | único (`country_code`, `agreement_code`, `heading_prefix`, `effective_from`) | ídem |
| `default_local_charges` | único (`concept_code`, `valid_from`) | historial semanal |
| `audit_events` | (`entity`, `entity_id`) | auditoría por entidad |

### Esquema

```ts
// src/db/schema.ts — fuente única de tablas. Solo importa drizzle-orm: `pnpm db:seed` lo ejecuta Node puro.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => bigint(name, { mode: "number" });

export const localeEnum = pgEnum("locale", ["es", "en"]);
export const currencyEnum = pgEnum("currency", ["USD", "PEN"]);
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "incomplete",
  "active",
  "past_due",
  "canceled",
  "expired",
]);
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "calculated", "archived"]);
export const costGroupEnum = pgEnum("cost_group", [
  "origin_freight",
  "other_charges",
  "local_soles",
  "management_fee",
]);
export const costOriginEnum = pgEnum("cost_origin", ["international", "local"]);
export const extractionStatusEnum = pgEnum("extraction_status", ["pending", "done", "failed", "skipped"]);
export const taxKindEnum = pgEnum("tax_kind", ["igv", "ipm", "uit", "tasa_despacho"]);
export const tariffRateKindEnum = pgEnum("tariff_rate_kind", [
  "ad_valorem",
  "sobretasa",
  "antidumping",
  "derecho_especifico",
  "isc",
]);
export const rateBaseEnum = pgEnum("rate_base", ["cif", "fob", "cif_plus_duties", "per_unit"]);
export const verificationStatusEnum = pgEnum("verification_status", ["unverified", "verified"]);
export const importSourceEnum = pgEnum("import_source", ["official", "csv"]);
export const importRunStatusEnum = pgEnum("import_run_status", [
  "running",
  "staged",
  "failed",
  "published",
  "discarded",
]);
export const stagingChangeEnum = pgEnum("staging_change", ["added", "changed", "removed", "unchanged"]);
export const usageKindEnum = pgEnum("usage_kind", ["free", "subscription"]);
export const aiCallStatusEnum = pgEnum("ai_call_status", ["ok", "error", "timeout", "invalid_output", "rate_limited"]);

// ---------- Auth (better-auth, usePlural) ----------
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ---------- Cuenta y cobro ----------
export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  locale: localeEnum("locale").notNull().default("es"),
  country: char("country", { length: 2 }).notNull().default("PE"),
  currency: currencyEnum("currency").notNull().default("PEN"),
  companyName: text("company_name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  nameEs: text("name_es").notNull(),
  nameEn: text("name_en").notNull(),
  pricePenMinor: money("price_pen_minor").notNull().default(0),
  priceUsdMinor: money("price_usd_minor").notNull().default(0),
  quotaPerPeriod: integer("quota_per_period").notNull(),
  active: boolean("active").notNull().default(false),
  providerRefPen: text("provider_ref_pen"),
  providerRefUsd: text("provider_ref_usd"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  planCode: text("plan_code")
    .notNull()
    .references(() => plans.code, { onDelete: "restrict" }),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  currency: currencyEnum("currency").notNull(),
  status: subscriptionStatusEnum("status").notNull().default("incomplete"),
  currentPeriodStart: ts("current_period_start"),
  currentPeriodEnd: ts("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    type: text("type").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    amountMinor: money("amount_minor"),
    currency: currencyEnum("currency"),
    payload: jsonb("payload").notNull(),
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_events_provider_event_uq").on(t.provider, t.externalEventId)],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: usageKindEnum("kind").notNull(),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end"),
    quotesUsed: integer("quotes_used").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("usage_counters_user_kind_period_uq").on(t.userId, t.kind, t.periodStart)],
);

export const referenceCounters = pgTable("reference_counters", {
  year: integer("year").primaryKey(),
  last: integer("last").notNull().default(0),
});

// ---------- Reglas aduaneras (publicadas) ----------
export const tariffHeadings = pgTable(
  "tariff_headings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 10 }).notNull(),
    descriptionEs: text("description_es").notNull(),
    descriptionEn: text("description_en").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    importedAt: ts("imported_at").notNull().defaultNow(),
    importRunId: uuid("import_run_id"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
  },
  (t) => [
    uniqueIndex("tariff_headings_code_from_uq").on(t.code, t.effectiveFrom),
    index("tariff_headings_code_idx").on(t.code),
  ],
);

export const tariffRates = pgTable(
  "tariff_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    headingCode: varchar("heading_code", { length: 10 }).notNull(),
    kind: tariffRateKindEnum("kind").notNull(),
    base: rateBaseEnum("base").notNull(),
    rateBps: integer("rate_bps"),
    amountPerUnitMinor: money("amount_per_unit_minor"),
    unit: text("unit"),
    currency: currencyEnum("currency").notNull().default("USD"),
    inIgvBase: boolean("in_igv_base").notNull().default(true),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    importedAt: ts("imported_at").notNull().defaultNow(),
    importRunId: uuid("import_run_id"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
  },
  (t) => [uniqueIndex("tariff_rates_heading_kind_from_uq").on(t.headingCode, t.kind, t.effectiveFrom)],
);

export const tradeAgreements = pgTable(
  "trade_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    agreementCode: text("agreement_code").notNull(),
    nameEs: text("name_es").notNull(),
    nameEn: text("name_en").notNull(),
    exemptKinds: text("exempt_kinds").array().notNull(),
    requiresOriginCertificate: boolean("requires_origin_certificate").notNull().default(true),
    headingPrefix: text("heading_prefix").notNull().default(""),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("trade_agreements_uq").on(t.countryCode, t.agreementCode, t.headingPrefix, t.effectiveFrom),
  ],
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: taxKindEnum("kind").notNull(),
    rateBps: integer("rate_bps"),
    amountMinor: money("amount_minor"),
    currency: currencyEnum("currency").notNull().default("PEN"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tax_rates_kind_from_uq").on(t.kind, t.effectiveFrom)],
);

export const perceptionRules = pgTable(
  "perception_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conditionCode: text("condition_code").notNull(),
    headingPrefix: text("heading_prefix").notNull().default(""),
    rateBps: integer("rate_bps").notNull(),
    descriptionEs: text("description_es").notNull(),
    descriptionEn: text("description_en").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceUrl: text("source_url").notNull(),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("perception_rules_uq").on(t.conditionCode, t.headingPrefix, t.effectiveFrom)],
);

export const defaultLocalCharges = pgTable(
  "default_local_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptCode: text("concept_code").notNull(),
    labelEs: text("label_es").notNull(),
    labelEn: text("label_en").notNull(),
    group: costGroupEnum("group").notNull(),
    origin: costOriginEnum("origin").notNull(),
    igvApplicable: boolean("igv_applicable").notNull(),
    inCif: boolean("in_cif").notNull().default(false),
    amountMinor: money("amount_minor").notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),
    validFrom: date("valid_from").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("default_local_charges_concept_from_uq").on(t.conceptCode, t.validFrom)],
);

// ---------- Importación de reglas (staging) ----------
export const ruleImportRuns = pgTable("rule_import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: importSourceEnum("source").notNull(),
  sourceUrl: text("source_url"),
  status: importRunStatusEnum("status").notNull().default("running"),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  rowsStaged: integer("rows_staged").notNull().default(0),
  diffSummary: jsonb("diff_summary"),
  error: text("error"),
  triggeredBy: text("triggered_by").notNull(),
  publishedBy: text("published_by").references(() => users.id, { onDelete: "set null" }),
  publishedAt: ts("published_at"),
  createdAt: createdAt(),
});

export const stagingTariffHeadings = pgTable("staging_tariff_headings", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => ruleImportRuns.id, { onDelete: "cascade" }),
  change: stagingChangeEnum("change").notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  descriptionEs: text("description_es").notNull(),
  descriptionEn: text("description_en").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  sourceUrl: text("source_url").notNull(),
});

export const stagingTariffRates = pgTable("staging_tariff_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => ruleImportRuns.id, { onDelete: "cascade" }),
  change: stagingChangeEnum("change").notNull(),
  headingCode: varchar("heading_code", { length: 10 }).notNull(),
  kind: tariffRateKindEnum("kind").notNull(),
  base: rateBaseEnum("base").notNull(),
  rateBps: integer("rate_bps"),
  amountPerUnitMinor: money("amount_per_unit_minor"),
  unit: text("unit"),
  inIgvBase: boolean("in_igv_base").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  sourceUrl: text("source_url").notNull(),
});

// ---------- Cotizaciones ----------
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referenceCode: text("reference_code").notNull().unique(),
    title: text("title").notNull(),
    productDescription: text("product_description").notNull().default(""),
    clientName: text("client_name").notNull().default(""),
    status: quoteStatusEnum("status").notNull().default("draft"),
    locale: localeEnum("locale").notNull().default("es"),
    tariffHeadingCode: varchar("tariff_heading_code", { length: 10 }),
    headingConfirmedAt: ts("heading_confirmed_at"),
    originCountry: char("origin_country", { length: 2 }),
    hasOriginCertificate: boolean("has_origin_certificate").notNull().default(false),
    importerCondition: text("importer_condition").notNull().default("no_aplica"),
    dutiableUnits: integer("dutiable_units").notNull().default(1),
    fxPenPerUsdE4: integer("fx_pen_per_usd_e4"),
    fxDate: date("fx_date"),
    fxSource: text("fx_source"),
    validityDays: integer("validity_days").notNull().default(15),
    marginsBps: integer("margins_bps")
      .array()
      .notNull()
      .default(sql`'{1000,2000,3500}'::integer[]`),
    specs: jsonb("specs"),
    result: jsonb("result"),
    ruleSnapshot: jsonb("rule_snapshot"),
    rulesAsOf: date("rules_as_of"),
    narrative: jsonb("narrative"),
    calculatedAt: ts("calculated_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("quotes_user_created_idx").on(t.userId, t.createdAt),
    index("quotes_user_deleted_idx").on(t.userId, t.deletedAt),
  ],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    totalMinor: money("total_minor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quote_lines_quote_idx").on(t.quoteId)],
);

export const quoteCostLines = pgTable(
  "quote_cost_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    conceptCode: text("concept_code").notNull(),
    label: text("label").notNull(),
    group: costGroupEnum("group").notNull(),
    providerName: text("provider_name"),
    origin: costOriginEnum("origin").notNull(),
    igvApplicable: boolean("igv_applicable").notNull(),
    inCif: boolean("in_cif").notNull().default(false),
    amountMinor: money("amount_minor").notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),
    defaultChargeId: uuid("default_charge_id").references(() => defaultLocalCharges.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("quote_cost_lines_quote_idx").on(t.quoteId)],
);

export const quoteSupplierTerms = pgTable("quote_supplier_terms", {
  quoteId: uuid("quote_id")
    .primaryKey()
    .references(() => quotes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  advanceBps: integer("advance_bps").notNull().default(3000),
  balanceBps: integer("balance_bps").notNull().default(7000),
  productionDaysMin: integer("production_days_min").notNull().default(30),
  productionDaysMax: integer("production_days_max").notNull().default(35),
  shippingCoordinationDays: integer("shipping_coordination_days").notNull().default(7),
  transitDaysMin: integer("transit_days_min").notNull().default(30),
  transitDaysMax: integer("transit_days_max").notNull().default(40),
  note: text("note"),
  updatedAt: updatedAt(),
});

export const quoteStages = pgTable(
  "quote_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stageNo: integer("stage_no").notNull(),
    kind: text("kind").notNull(),
    amountUsdMinor: money("amount_usd_minor").notNull(),
    amountPenMinor: money("amount_pen_minor").notNull(),
    daysMin: integer("days_min"),
    daysMax: integer("days_max"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quote_stages_quote_stage_uq").on(t.quoteId, t.stageNo)],
);

export const quoteTaxBreakdown = pgTable(
  "quote_tax_breakdown",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    component: text("component").notNull(),
    scope: text("scope").notNull(),
    conceptCode: text("concept_code"),
    baseMinor: money("base_minor").notNull(),
    rateBps: integer("rate_bps"),
    amountMinor: money("amount_minor").notNull(),
    exempted: boolean("exempted").notNull().default(false),
    exemptionReason: text("exemption_reason"),
    ruleTable: text("rule_table"),
    ruleId: text("rule_id"),
    ruleEffectiveFrom: date("rule_effective_from"),
    sourceUrl: text("source_url"),
    createdAt: createdAt(),
  },
  (t) => [index("quote_tax_breakdown_quote_idx").on(t.quoteId)],
);

export const supplierDocuments = pgTable(
  "supplier_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    language: localeEnum("language"),
    extractionStatus: extractionStatusEnum("extraction_status").notNull().default("pending"),
    extractedSpecs: jsonb("extracted_specs"),
    extractionError: text("extraction_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("supplier_documents_quote_idx").on(t.quoteId)],
);

export const documentImages = pgTable(
  "document_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => supplierDocuments.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    page: integer("page").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    position: integer("position").notNull(),
    included: boolean("included").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("document_images_quote_idx").on(t.quoteId)],
);

export const generatedDocuments = pgTable(
  "generated_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    locale: localeEnum("locale").notNull(),
    version: integer("version").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    resultCalculatedAt: ts("result_calculated_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("generated_documents_quote_locale_version_uq").on(t.quoteId, t.locale, t.version)],
);

// ---------- Operación ----------
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_entity_idx").on(t.entity, t.entityId)],
);

export const dataExportRequests = pgTable("data_export_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  createdAt: createdAt(),
  completedAt: ts("completed_at"),
});

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    status: aiCallStatusEnum("status").notNull(),
    attempt: integer("attempt").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_user_created_idx").on(t.userId, t.createdAt)],
);
```

### Formato CSV de importación de reglas (contrato del paso 12)

UTF-8, separador coma, cabecera obligatoria, comillas dobles RFC 4180 para campos con comas. Una fila
por derecho de una partida; la descripción se repite en cada fila de la misma partida.

```csv
heading_code,description_es,description_en,kind,base,rate_bps,amount_per_unit_minor,unit,in_igv_base,effective_from,source_url
8477300000,"Máquinas para moldear por soplado","Blow moulding machines",ad_valorem,cif,0,,,true,2026-01-01,https://example.gob.pe/arancel
```

| Columna | Regla de validación |
|---|---|
| `heading_code` | `^\d{10}$` |
| `description_es`, `description_en` | no vacías |
| `kind` | uno de `ad_valorem`, `sobretasa`, `antidumping`, `derecho_especifico`, `isc` |
| `base` | uno de `cif`, `fob`, `cif_plus_duties`, `per_unit` |
| `rate_bps` | entero ≥ 0, obligatorio salvo `base=per_unit` |
| `amount_per_unit_minor` | entero ≥ 0, obligatorio si `base=per_unit` |
| `unit` | texto, obligatorio si `base=per_unit` |
| `in_igv_base` | `true` o `false` |
| `effective_from` | `YYYY-MM-DD` |
| `source_url` | empieza con `https://` |

La URL de la fila de ejemplo es ilustrativa del formato; las URLs reales son las de la fuente oficial
registrada en `docs/verified/tariff-source.md`.

### Migraciones

drizzle-kit genera SQL en `drizzle/` a partir de `src/db/schema.ts` (`pnpm db:generate`, nombre de
archivo elegido por la herramienta) y lo aplica (`pnpm db:migrate`). `drizzle.config.ts` carga `.env`
con `process.loadEnvFile`. Producción: el job `migrate` de CI aplica las migraciones con
`DATABASE_URL_UNPOOLED` en cada push a `main`; las migraciones son **expandir → desplegar → contraer**:
nunca se borra ni renombra una columna en el mismo despliegue que deja de usarla, de modo que el
orden entre el despliegue de Vercel y el job de migración no rompe nada. Nunca `drizzle-kit push`.

### Datos semilla (seed)

`pnpm db:seed` (= `node --env-file-if-exists=.env src/db/seed.ts`) inserta, idempotente
(`on conflict do nothing`), filas **DEMO marcadas `verification_status='unverified'` y
`source_url='seed://demo'`** para que la app sea usable en local. Nada de esto es un dato oficial:
el admin publica los reales desde `/admin/settings` y `/admin/rules`.

| Tabla | Filas demo |
|---|---|
| `tax_rates` | `igv` 1600 bps 2025-01-01→2026-01-01 · `ipm` 200 bps 2025-01-01→2026-01-01 · `igv` 1550 bps desde 2026-01-01 · `ipm` 250 bps desde 2026-01-01 (valores del Excel del dueño, por verificar contra SUNAT) |
| `tariff_headings` | `8477300000` "Máquinas para moldear por soplado (DEMO)" / "Blow moulding machines (DEMO)" · `8418690000` "Demás equipos de refrigeración (DEMO)" / "Other refrigerating equipment (DEMO)" — ambas desde 2026-01-01 |
| `tariff_rates` | `8477300000` `ad_valorem` `cif` 0 bps · `8418690000` `ad_valorem` `cif` 600 bps — desde 2026-01-01, `in_igv_base=true` |
| `trade_agreements` | `CN` `TLC-PE-CN` "TLC Perú–China (DEMO)" exonera `{ad_valorem}`, requiere certificado, desde 2026-01-01 |
| `perception_rules` | `no_aplica` 0 · `general` 350 · `primera_importacion` 1000 — desde 2026-01-01 |
| `default_local_charges` (USD, `valid_from` 2026-01-01) | `intl_freight` Flete marítimo internacional 90000 (internacional, `in_cif`, IGV sí) · `intl_insurance` Seguro internacional 4000 (internacional, `in_cif`, IGV sí) · `customs_agency` Agenciamiento y desaduanaje 25000 (local, IGV sí) · `warehouse` Almacén y visto bueno 12720 (local, IGV sí) · `local_transport` Transporte local 10000 (local, IGV sí) · `origin_fob_charges` Gastos FOB en origen 0 (internacional, fuera de CIF, IGV no) · `management_fee` Gestión comercial y despacho 150000 (grupo `management_fee`, IGV no; "Honorario de gestión USD 1,500" de `reference/datos-para-cotizar.md`) |
| `plans` | `mensual` "Plan mensual" / "Monthly plan", cuota 10, precios 0, `active=false` (el admin fija precios y lo activa) |

`seed(db)` es una función exportada que acepta cualquier instancia `drizzle(postgres-js)` (la usan
también los tests y `tests/e2e/global-setup.ts`); el script la invoca cuando se ejecuta directamente
(`import.meta.url === pathToFileURL(process.argv[1]).href`).

---

## 5. Diseño de API (API Design)

### Convenciones

- Transporte: **server actions** para la UI propia; **route handlers** solo donde hace falta HTTP
  (auth, archivos, PDF, exportación, webhooks, cron, health). Base path REST: `/api/v1`.
- Sobre de respuesta (route handlers y server actions, sin excepción):
  `{ "ok": true, "data": <T> }` · `{ "ok": false, "error": { "code": "<CODE>", "message": "<texto>", "requestId": "<uuid>" } }`.
  Excepciones de formato: respuestas binarias (`application/pdf`, `image/png`) y las de better-auth.
- Códigos de error (`src/server/errors.ts`): `VALIDATION` 422 · `UNAUTHENTICATED` 401 ·
  `NOT_FOUND` 404 (también para recursos ajenos y no-admin en rutas admin) · `QUOTA_EXCEEDED` 402 ·
  `RATE_LIMITED` 429 · `CONFLICT` 409 · `INVALID_SIGNATURE` 400 · `UPSTREAM_UNAVAILABLE` 503 · `INTERNAL` 500.
- Validación: Zod 4 en el borde de cada action/handler; esquemas junto a la action o en el servicio que los consume.
- Paginación: por cursor `(created_at, id)` descendente; `?cursor=<opaco>&limit=` (por defecto 20, máximo 50).
- Idempotencia: webhooks por (`provider`, `external_event_id`); creación de cotización por transacción con bloqueo del contador.
- Límites (Postgres, ventana fija, `src/server/rate-limit.ts`): ingreso 10/min por IP · registro 5/h por IP · otros POST de `/api/auth` 30/min por IP · IA 20/h por usuario · nuevas cotizaciones 30/h por usuario · exportación 5/día por usuario · subida de documentos 30/h por usuario. Al exceder: `RATE_LIMITED` 429 con `Retry-After`.

### Rutas

| Método | Ruta | Descripción | Auth | Límite |
|---|---|---|---|---|
| GET | `/` | Landing pública | pública | — |
| GET | `/auth/[mode]` | sign-in, sign-up, forgot, reset, check-email | pública | — |
| GET/POST | `/api/auth/[...all]` | better-auth (registro, ingreso, verificación, reset, salida) | pública | por ruta, ver arriba |
| GET | `/app`, `/app/quotes`, `/app/quotes/[id]`, `/app/quotes/compare`, `/app/billing`, `/app/settings` | App | usuario | — |
| GET | `/admin/charges`, `/admin/settings`, `/admin/rules` | Panel admin | admin (otro → 404) | — |
| POST | `/api/v1/quotes/[id]/documents` | Subir PDF del proveedor (multipart, campo `file`) | dueño | 30/h |
| GET | `/api/v1/quotes/[id]/documents?image=<imageId>` | Bytes PNG de una foto extraída | dueño | — |
| GET | `/api/v1/quotes/[id]/pdf?locale=es\|en` | Generar/descargar el PDF formal | dueño | — |
| GET | `/api/v1/account/export` | Exportación JSON de datos | usuario | 5/día |
| POST | `/api/webhooks/payments/[provider]` | Eventos de pago (`fake`, `izipay`) | firma | — |
| GET | `/api/cron/rules-import` | Corrida programada de importación | `Authorization: Bearer <CRON_SECRET>` | — |
| GET | `/api/health` | Salud: base alcanzable y migraciones al día | pública | — |

Server actions (en `src/app/(app)/app/quotes/actions.ts` salvo indicación): `createQuoteAction`,
`updateProductAction`, `searchHeadingsAction`, `suggestHeadingsAction`, `confirmHeadingAction`,
`saveItemsAction`, `saveCostLinesAction`, `saveSupplierTermsAction`, `saveFxAction`,
`calculateQuoteAction`, `deleteQuoteAction`; en páginas: acciones de admin (paso 10/12), de
documentos (paso 14), de cobro (paso 17) y de cuenta (paso 18).

### Endpoints críticos — detalle completo

**1. `calculateQuoteAction({ quoteId })`** → `src/server/quotes/service.ts#calculateQuote(actor, quoteId)`
- Requiere: cotización propia no borrada; `tariff_heading_code` confirmado; ≥ 1 ítem con `total_minor > 0`; `fx_pen_per_usd_e4 > 0` con `fx_date` y `fx_source`; términos con `advance_bps + balance_bps = 10000`.
- Errores: ajena → `NOT_FOUND`; falta TC → `VALIDATION` con mensaje que nombra `fx`; partida sin reglas publicadas a la fecha → `CONFLICT` (`RULES_INCOMPLETE` en `message`); IGV o IPM faltantes → `CONFLICT`.
- Efectos (una transacción): resuelve reglas a `rules_as_of` = fecha UTC de hoy; corre el motor (§9 paso 7); escribe `quotes.result`, `rule_snapshot`, `rules_as_of`, `calculated_at`, `status='calculated'`; reemplaza `quote_stages` (6 filas) y `quote_tax_breakdown` (una por línea tributaria).
- Respuesta: `{ ok: true, data: EngineResult }`.

**2. `POST /api/v1/quotes/[id]/documents`** (multipart `file`)
- Valida: dueño; tamaño ≤ 20 MB (20 971 520 bytes); primeros 5 bytes = `%PDF-`. Si no: 422 `VALIDATION`, nada guardado.
- Efectos: guarda en `users/<userId>/quotes/<quoteId>/uploads/<uuid>.pdf`; inserta `supplier_documents` (SHA-256, `extraction_status='pending'`); extrae imágenes embebidas con pdfjs-dist → PNG en `…/images/<uuid>.png` + filas `document_images` (posición en orden de aparición, `included=true`).
- Respuesta: 201 `{ ok: true, data: { documentId, images: [{ id, width, height, position }] } }`.

**3. `GET /api/v1/quotes/[id]/pdf?locale=es|en`**
- Valida: dueño; cotización con `status='calculated'`; `locale` ∈ {es, en} (por defecto el de la cotización). Ajena → 404.
- Efectos: si no existe un `generated_documents` para (quote, locale) con `result_calculated_at = quotes.calculated_at`, renderiza, guarda en `…/generated/<locale>-v<n>.pdf` e inserta versión `n = max+1`; si existe, sirve el guardado.
- Respuesta: 200 `application/pdf`, `Content-Disposition: attachment; filename="<COT-…>-<locale>.pdf"`.

**4. `POST /api/webhooks/payments/[provider]`**
- Lee el cuerpo crudo (`request.text()`), `provider.verifyWebhook(raw, headers)`; firma inválida → 400 `INVALID_SIGNATURE`, nada escrito.
- En una transacción: inserta `payment_events` (único por proveedor + id); si choca → 200 sin cambios. `payment.succeeded` → `subscriptions` `active`, periodo nuevo o extendido un mes calendario desde `max(now, current_period_end)` para renovaciones; crea `usage_counters` del periodo con `quotes_used=0`. `subscription.canceled` → `cancel_at_period_end=true`. Tipos desconocidos → 200 y log `info`.
- Respuesta: 200 `{ ok: true, data: { received: true } }`.

**5. `GET /api/cron/rules-import`**
- `Authorization: Bearer <CRON_SECRET>` (comparación en tiempo constante) o 401 sin crear corrida.
- Efectos: crea `rule_import_runs` (`source='official'`); el adaptador oficial descarga y normaliza; staging + diff contra lo publicado; estado `staged` o `failed` (+ log `error` + `reportError`). Nunca publica.
- Respuesta: 200 `{ ok: true, data: { runId, status } }`.

---

## 6. Arquitectura de frontend (Frontend Architecture)

### Rutas

| Ruta | Página | Fuente de datos | Auth |
|---|---|---|---|
| `/` | Landing (propuesta, cómo funciona, "1 cotización gratis", plan mensual sin precio fijo en código) | estática + cookies | pública |
| `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot`, `/auth/reset`, `/auth/check-email` | Acceso | better-auth (cliente) + server action de registro | pública (con sesión → `/app`) |
| `/app` | Panel (`h1` "Panel" / "Dashboard") con accesos | servidor | usuario |
| `/app/quotes` | Listado, estado vacío, "Nueva cotización" | servidor | usuario |
| `/app/quotes/[id]?paso=producto\|partida\|documento\|costos\|resultado` | Asistente | servidor + actions | dueño |
| `/app/quotes/compare?ids=a,b[,c]` | Comparación (máx. 3) | servidor | dueño de todas |
| `/app/billing` | Plan, cuota restante, checkout | servidor | usuario |
| `/app/settings` | Idioma, país, exportar, borrar cuenta | servidor | usuario |
| `/admin/charges`, `/admin/settings`, `/admin/rules` | Panel admin | servidor | admin |

### Estrategia de render

Todas las páginas son **dinámicas** (leen cookies: tema, idioma, sesión) y se renderizan en el
servidor; no se usa `cacheComponents` ni `"use cache"` en v1 (datos por usuario, cambian a menudo).
Los componentes interactivos son hojas `"use client"`: `auth-form.tsx`, `quote-wizard.tsx`,
`document-step.tsx`. No hay `proxy.ts`: la protección real está en `src/app/(app)/app/layout.tsx`
(`requireUser()`), `src/app/(admin)/admin/layout.tsx` (`requireAdmin()`) y en cada servicio.

### Jerarquía de componentes

```
RootLayout (server: tema + locale + NextIntlClientProvider + cabecera con logo/wordmark)
└── (app)/app/layout.tsx (server: requireUser, nav, selector idioma/tema, Salir)
    └── quotes/[id]/page.tsx (server: carga cotización propia, reglas de búsqueda, documentos)
        ├── QuoteWizard (client: pasos producto · partida · costos/términos · resultado)
        │   └── llama server actions de quotes/actions.ts
        ├── DocumentStep (client, paso 14: subir, extraer, revisar ficha, fotos)
        └── enlaces de descarga PDF es/en (paso 16)
```

### Gestión de estado

Estado de servidor: siempre desde Postgres vía páginas de servidor; tras cada action se llama
`revalidatePath` de la página. Estado de cliente: `useState`/`useActionState` dentro del componente
del paso actual; formularios con `<form action={…}>`. Sin store global, sin librería de caché de
cliente. El paso actual vive en la URL (`?paso=`) para que recargar no pierda el lugar.

### Estados de carga, vacío y error

| Superficie | Cargando | Vacío | Error |
|---|---|---|---|
| Listado de cotizaciones | `loading.tsx` con 3 filas esqueleto | "Aún no tienes cotizaciones" + botón "Nueva cotización" | `role="alert"` con el mensaje del código |
| Búsqueda de partida | spinner en el botón, `aria-busy` | "Sin resultados para «…»" | alerta |
| Sugerencia IA | botón deshabilitado "Consultando…" | `NO_VALID_CANDIDATES` → "La IA no encontró partidas válidas; busca manualmente" | `UPSTREAM_UNAVAILABLE` → "La IA no está disponible; continúa manualmente" |
| Extracción de ficha | barra indeterminada + `aria-live="polite"` | sin documento → editor manual vacío | `failed` → editor manual + aviso |
| Resultado | — | sin calcular → lista de requisitos faltantes | `CONFLICT` reglas incompletas → mensaje para el admin |
| Admin reglas | — | "No hay corridas" | corrida `failed` con su `error` |

---

## 7. Sistema de diseño (Design System)

Producido desde `knowledge/capabilities/styling.md` con los tokens decididos en la entrevista.
Minimalista, mucho espacio en blanco, bordes finos, radio 8 px, Inter, estilo shadcn/ui.

### Colores

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--primary` | `#2563EB` | `#60A5FA` | botones primarios, enlaces, anillo de foco |
| `--primary-fg` | `#FFFFFF` | `#0B1220` | texto sobre primario |
| `--background` | `#FFFFFF` | `#0B1220` | página |
| `--surface` | `#F8FAFC` | `#111A2E` | tarjetas, paneles, diálogos |
| `--border` | `#E2E8F0` | `#1F2A44` | divisores (decorativos) |
| `--border-strong` | `#64748B` | `#64748B` | bordes de inputs y controles (≥ 3:1) |
| `--fg` | `#0F172A` | `#E5E7EB` | texto |
| `--fg-muted` | `#64748B` | `#94A3B8` | texto secundario |
| `--destructive` | `#B91C1C` | `#F87171` | errores, borrar |
| `--success` | `#15803D` | `#4ADE80` | confirmaciones |
| `--warning` | `#B45309` | `#FBBF24` | avisos ("tasa no verificada") |
| `--pdf-navy` | `#0F172A` | — | regla de cabecera y encabezados de tabla del PDF |

**Contraste (WCAG 2.2 AA).** Pares de mayor riesgo, calculados con la fórmula de luminancia relativa:
`--fg-muted` `#64748B` sobre `#FFFFFF` = **4,76:1** (cuerpo ≥ 4,5 ✓) · `--primary-fg` `#FFFFFF`
sobre `#2563EB` = **5,17:1** ✓ · `--fg-muted` oscuro `#94A3B8` sobre `#0B1220` = **7,36:1** ✓ ·
`--primary` oscuro `#60A5FA` sobre `#0B1220` = **7,42:1** ✓ · `--border-strong` `#64748B` sobre
`#0B1220` = **3,96:1** (límite de componente ≥ 3 ✓). `--border` `#E2E8F0` (1,2:1) se usa solo como
divisor decorativo, nunca como único límite de un control. Los tonos oscuros de éxito/aviso/peligro
son decisión técnica por defecto (paleta del brief solo los define en claro).

### Tipografía

| Rol | Familia | Tamaño / interlineado | Peso | Tracking |
|---|---|---|---|---|
| Display | Inter, ui-sans-serif, system-ui, sans-serif | 32 px / 40 px | 700 | -0,01em |
| Encabezado | ídem | 24/32 · 20/28 · 16/24 | 600 | 0 |
| Cuerpo | ídem | 16 px / 24 px (secundario 14/20, nota 12/16) | 400 | 0 |
| Mono | ui-monospace, SFMono-Regular, Menlo, monospace | 14 px / 20 px | 400 | 0 |

**Carga de fuentes:** pila del sistema con `Inter` primero; **no** se usa `next/font/google` en v1
para que `pnpm build` no dependa de la red. Autoalojar Inter (woff2, licencia OFL) en
`public/fonts/` con `font-display: swap` queda en el checklist de lanzamiento (§20.1). El PDF usa
Helvetica (fuente estándar de PDF, sin archivo).

### Espaciado, radio, elevación

- Espaciado: base 4 px — 4, 8, 12, 16, 24, 32, 48, 64.
- Radio: 8 px (inputs, botones, tarjetas, diálogos); 9999 px (badges).
- Sombras: ninguna; elevación por borde `1px solid var(--border)` y fondo `--surface`.
- Ancho máximo de contenido: 1120 px · Breakpoints: 640 / 768 / 1024 / 1280 px.

### Movimiento

150 ms `ease-out` para hover/foco/aparición de alertas; solo `opacity` y `transform`.
`@media (prefers-reduced-motion: reduce)` reduce toda transición a 0 ms.

### Estilo de componentes

Superficies blancas o `--surface`, bordes finos, una sola acción primaria azul por vista, tablas con
encabezado en `--pdf-navy` dentro del PDF y en `--surface` en la web, cifras alineadas a la derecha
con `font-variant-numeric: tabular-nums`. El PDF replica la referencia: regla navy bajo la cabecera,
código `COT-` y metadatos arriba a la derecha, tarjetas numeradas para las 6 etapas. Un componente
nuevo pertenece si se ve correcto en escala de grises y no necesita sombra para separarse.

---

## 8. Autenticación y autorización (Authentication & Authorization)

### Proveedor y razón

better-auth (self-hosted) con adaptador Drizzle: usuarios y sesiones viven en nuestra Postgres, lo
que hace la exportación y el borrado (Ley 29733) operaciones locales, y no hay costo por usuario.

### Flujos

1. **Registro** `/auth/sign-up`: nombre, email, contraseña (≥ 10 caracteres), país (`select` con
   `PE, AR, BO, BR, CL, CN, CO, EC, ES, MX, US, VE, ZZ`; `ZZ` = otro). Server action: límite 5/h por
   IP → `auth.api.signUpEmail` → inserta `profiles` (locale de la cookie, país, moneda `PEN` si `PE`,
   si no `USD`) → envía correo de verificación → redirige a `/auth/check-email` ("Revisa tu correo").
   Si el email existe: mismo mensaje (no se revela). Si `profiles` falla, `getProfile()` lo crea con
   valores por defecto en el siguiente acceso.
2. **Verificación**: enlace de better-auth (`/api/auth/verify-email?token=…`), expira en 24 h; con
   `autoSignInAfterVerification` abre sesión y lleva a `/app`. Token vencido → `/auth/sign-in` con aviso
   y botón "Reenviar verificación".
3. **Ingreso** `/auth/sign-in`: email + contraseña; sin verificar → rechazo con texto "Verifica tu
   correo antes de ingresar"; incorrecta → "Correo o contraseña incorrectos" en `role="alert"`;
   límite 10/min por IP. Éxito → `/app`.
4. **Recuperación** `/auth/forgot` → correo con enlace a `/auth/reset?token=…` (1 h) → nueva contraseña → revoca otras sesiones.
5. **Expiración**: sesión 7 días, se renueva cada 24 h de uso. Vencida → layout redirige a `/auth/sign-in`.
6. **Salida**: botón "Salir" (form POST) → `auth.api.signOut` → `/`.
7. **Borrado de cuenta**: `/app/settings` (paso 18) — confirmación escribiendo el email; borra archivos y filas.

### Protección de rutas

| Superficie | Regla | Dónde se aplica |
|---|---|---|
| `/app/**` | sesión válida | `src/app/(app)/app/layout.tsx` → `requireUser()` (redirect `/auth/sign-in`) |
| `/admin/**` | `role='admin'` | `src/app/(admin)/admin/layout.tsx` → `requireAdmin()` (`notFound()`) |
| Server actions | sesión + dueño | cada action llama `requireActor()` y el servicio usa `src/server/authz.ts` |
| `/api/v1/**` | sesión + dueño | cada handler: `requireActor(request.headers)` + servicio |
| `/api/webhooks/payments/*` | firma del proveedor | `src/server/billing/provider.ts#verifyWebhook` |
| `/api/cron/*` | `Bearer CRON_SECRET` | `src/app/api/cron/rules-import/route.ts` |

**Regla:** la autorización se verifica en el servidor en cada petición. Ocultar un botón no es un permiso.

### Roles y permisos

| Rol | Puede | No puede |
|---|---|---|
| `user` | CRUD de sus cotizaciones, documentos, PDFs; cobro; exportar y borrar su cuenta | ver datos de otros; rutas admin (404) |
| `admin` | todo lo de `user` + gastos locales, tasas, plan, corridas de reglas (publicar/descartar/CSV) | ver cotizaciones de otros usuarios (fuera de alcance v1) |

El rol se asigna al crear el usuario: `admin` si el email está en `ADMIN_EMAILS` (lista separada por
comas, sin distinguir mayúsculas), si no `user`. `role` no es editable por el usuario (`input: false`).

### Sesiones

Token opaco de better-auth en cookie `HttpOnly`, `SameSite=Lax`, `Secure` cuando `BETTER_AUTH_URL`
es https; fila en `sessions` (revocable). CSRF: server actions de Next.js validan el origen; better-auth
valida `Origin` contra `BETTER_AUTH_URL` (`trustedOrigins`); los webhooks no usan cookies.

### Tenencia / aislamiento por fila

Mecanismo: **ámbito obligatorio en la capa de datos**. Toda consulta de filas de usuario pasa por
`src/server/authz.ts` (`ownedQuoteOrThrow(tx, actor, quoteId)` filtra `user_id = actor.userId and
deleted_at is null`; las hijas se leen siempre a través de una cotización propia y además filtran
`user_id`). Recurso ajeno o inexistente = `NOT_FOUND` (404). Probado en el paso 5 (servicio) y en los
pasos 13 y 16 (route handlers).

---

## 9. ORDEN DE CONSTRUCCIÓN (BUILD ORDER)

**Esta es la sección para la que existe el blueprint.** Un builder que sigue esta sección exactamente
y se detiene cuando cada gate está en verde entrega el proyecto.

### Las reglas de un paso

1. **Una sentada por paso.** Máximo **5 archivos** y **2–6 criterios** por paso.
2. **Cuatro campos siempre:** `Do`, `Done when`, `Verify`, `Checkpoint`. El Checkpoint es un bloque
   shell literal: `git add -A && git commit -m "step N: slug"` y `git tag step-NN-slug`.
3. **"Done when" observable** en forma EARS: **WHEN** `<disparador>` **THE SYSTEM SHALL** `<respuesta observable>`.
4. **Prohibido "se ve bien"**, "funciona", "está implementado".
5. **`Verify` es shell literal** cuyo código de salida decide; se ejecuta desde `/home/user/cotimporta`
   (raíz del proyecto) con `export PATH="$HOME/.local/bin:$PATH"` ya aplicado.
6. **Un paso no está hecho hasta que su `Verify` pasa** y los de los pasos anteriores siguen pasando.
7. **Checkpoint en cada paso**; si el paso N falla sin arreglo: `git reset --hard step-(N-1)-<slug>`.
8. **Nunca adelantarse.** Paso bloqueado → detenerse y reportar.
9. **Ningún paso rompe un gate anterior.** El entorno se degrada por paso: `src/lib/env.ts` (paso 2)
   declara todas las variables; solo `DATABASE_URL` es obligatoria en el esquema; cada módulo que
   consume una variable la exige con `requireEnv("<VAR>")` al usarse (columna "Required by step" de §10).
10. **Nunca afirmar un número derivado no contado.** Los gates afirman propiedades ("toda tabla del
    esquema existe", "exit 0, 0 failed") salvo invariantes reales (números golden, cuota del plan de prueba).
11. **Un `Verify` sale 0 cuando el paso es correcto.** Resultados no-cero esperados se escriben
    `status=0; cmd || status=$?; test "$status" -eq N`.
12. **Cada chequeo es observable en su medio.** Los tipos se verifican con `pnpm typecheck`; el texto
    del PDF con pdfjs-dist; el HTML con `serve-check.sh`.
13. **El punto de entrada se ejecuta en el paso que lo crea**: el paso 1 levanta `next start` y pide `/`.
14. **Un `Verify` no depende de su propio Checkpoint**: nada de `git status`/`ls-files` sobre archivos del paso en `Verify`.
15. **Literales golden reconciliados** contra el blueprint y el runtime (§19.6, tabla byte-exacta).
16. **Un gate falla por la razón correcta**: códigos específicos, nunca `!` ni `test $? -ne 0`.

### Un paso, una unidad — la regla de conteo

> **Un paso de §9 = una tarea en `tasks.json` = un bloque de tarea en un epic.**

Este blueprint tiene **18 pasos** → `ceil(18/9)=2` a `floor(18/5)=3` epics legales; se usan **3
epics de 6 pasos**: `01-fundacion` (pasos 1–6), `02-motor-y-cotizador` (pasos 7–12),
`03-ia-pdf-cobros` (pasos 13–18).

### Mapa de pasos

| # | Paso | Depende de | Toca | Gate |
|---|---|---|---|---|
| 1 | Scaffold ejecutable: landing con tokens, tema y locale | — | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/i18n/request.ts`, `src/i18n/messages.ts` | `bash scripts/serve-check.sh / 200 'Cotimporta'` |
| 2 | Base de datos: esquema, migración inicial y entorno validado | 1 | `src/db/schema.ts`, `src/db/client.ts`, `src/lib/env.ts`, migración que emite `pnpm db:generate` (`drizzle/**`), `tests/integration/db.test.ts` | `pnpm test tests/integration/db.test.ts` |
| 3 | Auth servidor: email verificado, roles y límites | 2 | `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`, `src/server/email.ts`, `src/server/rate-limit.ts`, `tests/integration/auth.test.ts` | `pnpm test tests/integration/auth.test.ts` |
| 4 | UI de acceso y shell protegido | 3 | `src/app/(auth)/auth/[mode]/page.tsx`, `src/components/auth/auth-form.tsx`, `src/app/(app)/app/layout.tsx`, `src/app/(app)/app/page.tsx`, `tests/e2e/auth-shell.spec.ts` | `pnpm test:e2e tests/e2e/auth-shell.spec.ts` |
| 5 | Guardia única, errores, cuotas y aislamiento | 3 | `src/server/authz.ts`, `src/server/errors.ts`, `src/server/billing/entitlements.ts`, `src/server/quotes/service.ts`, `tests/integration/guard.test.ts` | `pnpm test tests/integration/guard.test.ts` |
| 6 | Reglas: repositorio con vigencias y seed demo | 2 | `src/server/rules/repository.ts`, `src/db/seed.ts`, `src/db/seed-data.ts`, `tests/integration/rules.test.ts` | `pnpm test tests/integration/rules.test.ts` |
| 7 | Motor de cálculo puro con pruebas golden | 1 | `src/lib/engine/types.ts`, `src/lib/engine/money.ts`, `src/lib/engine/calculate.ts`, `tests/unit/engine/golden.test.ts`, `tests/unit/engine/rules.test.ts` | `pnpm test tests/unit/engine` |
| 8 | Cotizador: producto, partida, costos, términos y cálculo persistido | 4, 5, 6, 7 | `src/server/quotes/service.ts`, `src/app/(app)/app/quotes/actions.ts`, `src/app/(app)/app/quotes/[id]/page.tsx`, `src/components/quotes/quote-wizard.tsx`, `tests/integration/quotes-calc.test.ts` | `pnpm test tests/integration/quotes-calc.test.ts` |
| 9 | Listado, comparación y borrado lógico | 8 | `src/server/quotes/service.ts`, `src/app/(app)/app/quotes/page.tsx`, `src/app/(app)/app/quotes/compare/page.tsx`, `src/app/(app)/app/quotes/actions.ts`, `tests/e2e/quotes.spec.ts` | `pnpm test:e2e tests/e2e/quotes.spec.ts` |
| 10 | Panel admin: gastos locales, tasas y plan | 5, 6 | `src/server/admin/service.ts`, `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/charges/page.tsx`, `src/app/(admin)/admin/settings/page.tsx`, `tests/integration/admin.test.ts` | `pnpm test tests/integration/admin.test.ts` |
| 11 | Compuerta de hechos externos: Gemini, Izipay, fuente del arancel | 1 | `docs/verified/gemini-model.md`, `docs/verified/izipay.md`, `docs/verified/tariff-source.md`, `tests/unit/verified-docs.test.ts` | `pnpm test tests/unit/verified-docs.test.ts` |
| 12 | Importación de reglas: staging, diff, CSV, cron y publicación | 10, 11 | `src/server/rules/import.ts`, `src/app/api/cron/rules-import/route.ts`, `src/app/(admin)/admin/rules/page.tsx`, `vercel.json`, `tests/integration/rules-import.test.ts` | `pnpm test tests/integration/rules-import.test.ts` |
| 13 | Almacenamiento privado, subida del PDF y extracción de fotos | 8 | `src/server/storage/index.ts`, `src/server/documents/service.ts`, `src/app/api/v1/quotes/[id]/documents/route.ts`, `tests/helpers/session.ts`, `tests/integration/documents.test.ts` | `pnpm test tests/integration/documents.test.ts` |
| 14 | IA: gateway, extracción y traducción de la ficha, revisión | 11, 13 | `src/server/ai/gateway.ts`, `src/server/ai/extract-specs.ts`, `src/components/quotes/document-step.tsx`, `src/app/(app)/app/quotes/[id]/page.tsx`, `tests/integration/ai-extract.test.ts` | `pnpm test tests/integration/ai-extract.test.ts` |
| 15 | IA: sugerencia de partida validada y narrativa | 14 | `src/server/ai/suggest-heading.ts`, `src/server/ai/narrative.ts`, `src/app/(app)/app/quotes/actions.ts`, `tests/integration/ai-heading.test.ts` | `pnpm test tests/integration/ai-heading.test.ts` |
| 16 | PDF formal de la cotización y descarga | 13, 15 | `src/server/pdf/quote-document.ts`, `src/server/pdf/render.ts`, `src/app/api/v1/quotes/[id]/pdf/route.ts`, `src/app/(app)/app/quotes/[id]/page.tsx`, `tests/integration/quote-pdf.test.ts` | `pnpm test tests/integration/quote-pdf.test.ts` |
| 17 | Cobros: PaymentProvider, webhooks idempotentes y plan | 5, 11 | `src/server/billing/provider.ts`, `src/server/billing/service.ts`, `src/app/api/webhooks/payments/[provider]/route.ts`, `src/app/(app)/app/billing/page.tsx`, `tests/integration/billing.test.ts` | `pnpm test tests/integration/billing.test.ts` |
| 18 | Cuenta (exportar/borrar) y health de producción | 13, 16, 17 | `src/server/account/service.ts`, `src/app/(app)/app/settings/page.tsx`, `src/app/api/v1/account/export/route.ts`, `src/app/api/health/route.ts`, `tests/integration/account.test.ts` | `bash scripts/serve-check.sh /api/health 200 '"ok":true'` |

El orden respeta: scaffold → datos → auth → aislamiento → reglas → **motor antes que IA** → rebanada
vertical del cotizador → admin → compuerta de hechos externos (antes de importación, IA y cobro) →
IA → PDF → cobro → cuenta y salud. El punto de entrada se ejecuta en el paso 1.

---

#### Step 1 — Scaffold ejecutable: landing en `/` con tokens, tema y locale

**Do**
El Bootstrap (§10) ya dejó `package.json`, configs, lockfile y `node_modules`. Este paso crea el
primer código de la app y lo **ejecuta**. Archivos:
- `src/app/globals.css` — `@import "tailwindcss";` · `@source not "../../blueprints";` ·
  `@source not "../../reference";` · `@custom-variant dark (&:where(.dark, .dark *));` · variables de
  §7 en `:root` y `.dark` · `@theme inline` que mapea `--color-primary`, `--color-primary-fg`,
  `--color-background`, `--color-surface`, `--color-border`, `--color-border-strong`, `--color-fg`,
  `--color-fg-muted`, `--color-destructive`, `--color-success`, `--color-warning` a esas variables,
  `--font-sans` a la pila de §7, `--radius-md: 8px` · utilidades `@utility btn`, `btn-primary`,
  `btn-ghost`, `input`, `card`, `table-base`, `badge` (bordes `--border-strong` en controles, foco
  `outline: 2px solid var(--color-primary)` con `outline-offset: 2px`) · `prefers-reduced-motion`.
- `src/i18n/messages.ts` — `export type Locale = "es" | "en"`, `export const locales`,
  `export const defaultLocale = "es"`, `export type Copy<T> = Record<Locale, T>`, `isLocale()`, y
  `export const messages: Copy<{ common: { appName: string; signIn: string; signUp: string; disclaimer: string } }>`
  con `appName` = "Cotimporta" en ambos idiomas.
- `src/i18n/request.ts` — `getRequestConfig` de `next-intl/server`: locale = cookie `NEXT_LOCALE`
  si es válida; si no, `en` cuando `Accept-Language` empieza con `en`; si no, `es`. Devuelve
  `{ locale, messages: messages[locale] }`.
- `src/app/layout.tsx` — Server Component: `const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light"`;
  `const locale = await getLocale()`; `<html lang={locale} className={theme}>`; `<body>` con
  `NextIntlClientProvider`; cabecera con enlace a `/`: si existe `public/brand/logo.svg`
  (`existsSync(join(process.cwd(), "public/brand/logo.svg"))`) muestra `<img src="/brand/logo.svg" alt="Cotimporta">`,
  si no, el wordmark de texto "Cotimporta"; enlace "Saltar al contenido"; `<main id="contenido">`.
  `metadata.title` = "Cotimporta".
- `src/app/page.tsx` — landing: `h1` es "Cotiza tu importación puesta en Perú" / en "Quote your import landed in Peru",
  3 bloques (cómo funciona, 1 cotización gratis, plan mensual con 10 cotizaciones), enlaces a
  `/auth/sign-up` y `/auth/sign-in` (se crean en el paso 4), textos en un objeto `copy: Copy<…>`.

**Respaldo documentado de TypeScript (único caso permitido de tocar el manifiesto en un paso).** Si
`pnpm typecheck` o `pnpm build` fallan con un error que emite TypeScript 7 o la integración de tipos
de Next.js **antes** de reportar cualquier error en un archivo de `src/` (p. ej. opción de compilador
desconocida o fallo del propio `tsc`), y solo entonces, ejecutar `pnpm add -D -E typescript@6.0.3`
(respaldo del track, §11) y repetir el Verify completo. Es observable: `package.json` queda con
`"typescript": "6.0.3"` y el commit del Checkpoint se escribe `step 1: scaffold (typescript 6.0.3 fallback)`.
Cualquier otro error de tipos se corrige en el código, no con el respaldo.

**Done when**
- [ ] WHEN se ejecuta `pnpm build` sobre el árbol recién preparado por el Bootstrap THE SYSTEM SHALL terminar con código 0.
- [ ] WHEN `bash scripts/serve-check.sh / 200 Cotimporta` arranca el build de producción THE SYSTEM SHALL responder 200 en `/` con un cuerpo que contiene `Cotimporta`.
- [ ] WHEN se pide `/` con la cookie `theme=dark` THE SYSTEM SHALL devolver HTML de servidor cuyo elemento `<html>` ya trae `class="dark"`.
- [ ] WHEN se pide `/` con la cookie `NEXT_LOCALE=en` THE SYSTEM SHALL devolver HTML con `lang="en"`, y sin cookie ni `Accept-Language` en inglés SHALL devolver `lang="es"`.
- [ ] WHEN se ejecutan `pnpm typecheck`, `pnpm lint` y `pnpm test --passWithNoTests` THE SYSTEM SHALL terminar con código 0 en los tres.

**Verify**
```bash
pnpm install --frozen-lockfile                                  # expect: exit 0, lockfile sin cambios
pnpm typecheck                                                  # expect: exit 0
pnpm lint                                                       # expect: exit 0
pnpm test --passWithNoTests                                     # expect: exit 0 — aún no hay archivos de prueba; solo aquí se tolera
pnpm build                                                      # expect: exit 0
bash scripts/serve-check.sh / 200 'Cotimporta'                  # expect: exit 0 — EJECUTA next start y pide /
bash scripts/serve-check.sh / 200 'class="dark"' 'theme=dark'   # expect: exit 0 — tema en el HTML del servidor
bash scripts/serve-check.sh / 200 'lang="en"' 'NEXT_LOCALE=en'  # expect: exit 0
bash scripts/serve-check.sh / 200 'lang="es"'                   # expect: exit 0 — curl no envía Accept-Language
```

**Checkpoint**
```bash
git add -A && git commit -m "step 1: scaffold"
git tag step-01-scaffold
```

---

#### Step 2 — Base de datos: esquema completo, migración inicial y entorno validado

**Do**
- `src/db/schema.ts` — exactamente el bloque de §4 *Esquema* (todas las tablas en un solo paso: ningún paso posterior cambia el esquema).
- `src/lib/env.ts` — `envSchema` Zod con **todas** las variables de §10 (formatos: URLs válidas,
  enums de drivers `log`, `local`, `fake|gemini`, `fake|izipay`, enteros positivos). Solo
  `DATABASE_URL` es obligatoria; el resto opcional con los valores por defecto de `.env.example`.
  Exporta `parseEnv(source: Record<string, string | undefined>)` (pura; lanza `Error` cuyo mensaje
  nombra cada clave inválida o faltante), `getEnv()` (memoizada sobre `process.env`) y
  `requireEnv(key)` (lanza `Error("Falta la variable de entorno <KEY>")`). Si `VERCEL_ENV === "production"`,
  `getEnv()` rechaza valores que empiezan con `dev-only-` y los drivers `log`, `local`, `fake`.
  Único archivo de `src/` (junto a `src/db/seed.ts`) que lee `process.env`.
- `src/db/client.ts` — `postgres(getEnv().DATABASE_URL, { max: 5, prepare: false })` creado
  perezosamente; `export const db` = `drizzle(client, { schema })`; `export type Db`.
- La migración que emite `pnpm db:generate` en `drizzle/` (nombre elegido por drizzle-kit; no se edita a mano). Luego `pnpm db:migrate`.
- `tests/integration/db.test.ts` — recorre `Object.values(schema)`, filtra con `is(value, PgTable)` y
  para cada `getTableName(table)` afirma `select to_regclass('public.<name>') is not null` = `true`
  en la base de pruebas; y afirma que `parseEnv({})` lanza un error cuyo mensaje contiene `DATABASE_URL`.

**Done when**
- [ ] WHEN se ejecuta `pnpm db:migrate` contra la base local vacía THE SYSTEM SHALL terminar con código 0.
- [ ] WHEN se ejecuta `pnpm test tests/integration/db.test.ts` THE SYSTEM SHALL encontrar en la base de pruebas, vía `to_regclass`, cada tabla exportada por `src/db/schema.ts` y terminar con código 0.
- [ ] WHEN `pnpm db:generate` se ejecuta otra vez sin cambios de esquema THE SYSTEM SHALL no crear ningún archivo nuevo en `drizzle/`.
- [ ] WHEN `parseEnv` recibe un entorno sin `DATABASE_URL` THE SYSTEM SHALL lanzar un error cuyo mensaje nombra `DATABASE_URL`.

**Verify**
```bash
pnpm db:up                                                       # expect: exit 0 — Postgres healthy
pnpm db:migrate                                                  # expect: exit 0
pnpm test tests/integration/db.test.ts                           # expect: exit 0, 0 failed
n=$(ls drizzle/*.sql | wc -l); pnpm db:generate; test "$(ls drizzle/*.sql | wc -l)" -eq "$n"
                                                                 # expect: exit 0 — sin deriva esquema/migraciones
pnpm typecheck                                                   # expect: exit 0
pnpm lint                                                        # expect: exit 0
pnpm build                                                       # expect: exit 0 — el paso 1 sigue verde
bash scripts/serve-check.sh / 200 'Cotimporta'                   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 2: database"
git tag step-02-database
```

---

#### Step 3 — Auth servidor: registro con email verificado, sesiones, roles y límites

**Do**
- `src/server/email.ts` — `type EmailMessage = { to: string; subject: string; text: string; html: string }`;
  `type EmailProvider = { send(message: EmailMessage): Promise<void> }`; driver `log` (único en v1):
  agrega a un outbox en memoria (`readOutbox()`, `clearOutbox()` exportados para tests) y, si
  `EMAIL_OUTBOX_DIR` está definido, escribe `<EMAIL_OUTBOX_DIR>/<Date.now()>-<aleatorio>.json` con
  `{ to, subject, text, html, createdAt }`. `getEmailProvider()` exige `EMAIL_DRIVER` y `EMAIL_FROM` con `requireEnv`.
- `src/server/rate-limit.ts` — `hit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>`
  con un único `insert … on conflict (key) do update` atómico sobre `rate_limit_buckets` (ventana fija:
  si `window_start` venció, reinicia a 1). `clientIp(headers)` = primer valor de `x-forwarded-for` o `"local"`.
- `src/lib/auth.ts` — `betterAuth({ database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }), secret: requireEnv("BETTER_AUTH_SECRET"), baseURL: requireEnv("BETTER_AUTH_URL"),
  emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 10, sendResetPassword, revokeSessionsOnPasswordReset: true },
  emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true, expiresIn: 86400, sendVerificationEmail },
  user: { additionalFields: { role: { type: "string", defaultValue: "user", input: false } } },
  session: { expiresIn: 604800, updateAge: 86400 }, rateLimit: { enabled: false },
  databaseHooks: { user: { create: { before: asignar role "admin" si el email está en ADMIN_EMAILS } } },
  plugins: [nextCookies()] })`. Los correos de verificación y reset van por `getEmailProvider()` con
  texto es/en según la cookie de locale y el enlace en `text`. Exporta `auth`, `getSessionUser(headers)`
  (usuario o `null`), `requireUser()` (redirige a `/auth/sign-in`) y `requireActor(headers?)` →
  `{ userId, role }` o error `UNAUTHENTICATED`. Los nombres exactos de opciones se confirman contra
  los tipos instalados en `node_modules/better-auth`; el comportamiento exigido es el de los criterios.
- `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth)`; `POST` envuelto: según el último
  segmento de ruta aplica `hit("auth:<ip>:sign-in", 10, 60)`, `hit("auth:<ip>:sign-up", 5, 3600)`
  o `hit("auth:<ip>:other", 30, 60)`; si no se permite responde 429 con el sobre de error y `Retry-After`.
- `tests/integration/auth.test.ts` — con `auth.api.*` y el outbox en memoria cubre los 5 criterios.
  Emails únicos con `crypto.randomUUID()`; el caso admin usa `admin@cotimporta.test` (el valor de
  `ADMIN_EMAILS` en `vitest.config.ts`) y, antes de registrarlo, borra la fila de `users` con ese email
  si existe — única excepción permitida a "no truncar", porque ese email es fijo por diseño.

**Done when**
- [ ] WHEN una cuenta nueva se registra con email y contraseña THE SYSTEM SHALL guardar el usuario con `email_verified=false` y escribir exactamente un correo de verificación en el outbox.
- [ ] WHEN esa cuenta sin verificar intenta ingresar THE SYSTEM SHALL rechazar el ingreso y no crear ninguna fila en `sessions`.
- [ ] WHEN se sigue el enlace de verificación del outbox THE SYSTEM SHALL marcar `email_verified=true` y el siguiente ingreso SHALL tener éxito.
- [ ] WHEN una cuenta se registra con un email listado en `ADMIN_EMAILS` THE SYSTEM SHALL guardar `role='admin'`, y cualquier otra cuenta SHALL quedar con `role='user'`.
- [ ] WHEN la misma clave de rate limit recibe 11 golpes dentro de una ventana de 60 segundos con límite 10 THE SYSTEM SHALL permitir los 10 primeros y rechazar el 11.º.

**Verify**
```bash
pnpm db:up                                   # expect: exit 0
pnpm test tests/integration/auth.test.ts     # expect: exit 0, 0 failed
pnpm typecheck                               # expect: exit 0
pnpm lint                                    # expect: exit 0
pnpm build                                   # expect: exit 0 — BETTER_AUTH_* vienen de .env (copiado por el Bootstrap)
```

**Checkpoint**
```bash
git add -A && git commit -m "step 3: auth server"
git tag step-03-auth-server
```

---

#### Step 4 — UI de acceso y shell de la app protegida

**Do**
- `src/components/auth/auth-form.tsx` (`"use client"`) — un formulario por modo con `createAuthClient()`
  de `better-auth/react`. Etiquetas **exactas** (contrato con `tests/e2e/helpers.ts`): "Nombre",
  "Correo electrónico", "Contraseña", "País" (`<select>` con `PE, AR, BO, BR, CL, CN, CO, EC, ES, MX, US, VE, ZZ`);
  botones "Crear cuenta", "Ingresar", "Enviar enlace", "Guardar contraseña"; errores en `<p role="alert">`
  ("Correo o contraseña incorrectos", "Verifica tu correo antes de ingresar"). Inglés con `copy.en`.
- `src/app/(auth)/auth/[mode]/page.tsx` — `mode` ∈ `sign-in | sign-up | forgot | reset | check-email`
  (otro → `notFound()`); con sesión → `redirect("/app")`. Define la server action de registro
  (`"use server"`): límite 5/h por IP, `auth.api.signUpEmail`, inserta `profiles` (locale de cookie,
  país, moneda `PEN` si `PE` si no `USD`), redirige a `/auth/check-email`, cuyo `h1` es "Revisa tu correo".
- `src/app/(app)/app/layout.tsx` — `await requireUser()`; cabecera con wordmark, nav (Cotizaciones
  `/app/quotes`, Plan `/app/billing`, Ajustes `/app/settings`, Admin `/admin/charges` solo si
  `role='admin'`), selector de idioma y de tema (server actions que fijan las cookies `NEXT_LOCALE` y
  `theme` con `maxAge` 1 año y `revalidatePath("/", "layout")`), y botón "Salir" (form POST → `auth.api.signOut`, `redirect("/")`).
- `src/app/(app)/app/page.tsx` — `h1` "Panel" / "Dashboard"; tarjeta con enlace a `/app/quotes`.
- `tests/e2e/auth-shell.spec.ts` — usa `signUpAndVerify`, `signIn`, `uniqueEmail` de `tests/e2e/helpers.ts`;
  cubre los 5 criterios; el chequeo de ancho evalúa
  `document.documentElement.scrollWidth === document.documentElement.clientWidth` con
  `page.setViewportSize({ width: 375, height: 800 })` y `{ width: 1440, height: 900 }`.

**Done when**
- [ ] WHEN un visitante anónimo pide `/app` THE SYSTEM SHALL redirigir a `/auth/sign-in`.
- [ ] WHEN un visitante se registra en `/auth/sign-up`, sigue el enlace de verificación del outbox e ingresa THE SYSTEM SHALL mostrar `/app` con el encabezado `Panel`.
- [ ] WHEN `/` y `/auth/sign-in` se renderizan a 375 px y a 1440 px de ancho THE SYSTEM SHALL reportar `document.documentElement.scrollWidth` igual a `clientWidth`.
- [ ] WHEN un usuario con sesión pulsa `Salir` THE SYSTEM SHALL cerrar la sesión y la siguiente petición a `/app` SHALL redirigir a `/auth/sign-in`.
- [ ] WHEN se envía una contraseña incorrecta en `/auth/sign-in` THE SYSTEM SHALL mostrar el error como texto dentro de un elemento con `role="alert"` y permanecer en la página.

**Verify**
```bash
pnpm db:up                                       # expect: exit 0
pnpm test:e2e tests/e2e/auth-shell.spec.ts       # expect: exit 0, 0 failed (compila y levanta el build en :3100)
pnpm typecheck                                   # expect: exit 0
pnpm lint                                        # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 4: auth ui and app shell"
git tag step-04-auth-ui
```

---

#### Step 5 — Guardia de autorización única, errores tipados, cuotas y pruebas de aislamiento

**Do**
- `src/server/errors.ts` — `type ErrorCode` (los 9 códigos de §5), `class AppError(code, message)`,
  `httpStatus(code)`, `toResult(fn)` → `{ ok: true, data } | { ok: false, error }`, `toJsonResponse(error, requestId)`;
  `logger.{debug,info,warn,error}(msg, fields)` que escribe JSON por línea con `level`, `time`,
  `requestId`, respeta `LOG_LEVEL` y reemplaza por `"[REDACTED]"` todo valor cuya clave cumpla
  `/password|token|secret|key|authorization|cookie/i` (recursivo); `reportError(error, context)`:
  driver `log` (por defecto) o `webhook` si `ERROR_REPORT_WEBHOOK_URL` existe (POST JSON redactado, timeout 3 s, nunca lanza).
- `src/server/authz.ts` — `type Actor = { userId: string; role: "user" | "admin" }`;
  `ownedQuoteOrThrow(tx, actor, quoteId)`; `requireAdmin(actor)` (no-admin → `NOT_FOUND`).
- `src/server/billing/entitlements.ts` — `getEntitlement(tx, userId, now)` →
  `{ kind: "subscription" | "free" | "none"; remaining: number; counterKey }`: suscripción `active`,
  o `past_due` con `current_period_end` + 7 días > `now` → `plans.quota_per_period − quotes_used` del
  contador (`kind='subscription'`, `period_start = current_period_start`); si no, cuenta con
  `email_verified=true` → `1 − quotes_used` del contador `kind='free'` (`period_start` = 1970-01-01T00:00:00Z); si no, 0.
  `consumeQuote(tx, userId, now)` crea el contador si falta (`on conflict do nothing`), lo bloquea con
  `select … for update`, re-evalúa y lanza `QUOTA_EXCEEDED` si `remaining <= 0`, si no incrementa.
- `src/server/quotes/service.ts` — `createQuote(actor, { title, locale })` en una transacción:
  `hit("quote:<userId>", 30, 3600)`, `consumeQuote`, código `COT-<año UTC>-<NNNN>` con
  `insert into reference_counters … on conflict (year) do update set last = reference_counters.last + 1 returning last`
  (`NNNN` con ceros a la izquierda, 4 dígitos), inserta `quotes` y `quote_supplier_terms` por defecto,
  `audit_events` (`quote.created`); `getQuote`, `listQuotes(actor, { cursor, limit })`,
  `renameQuote`, `softDeleteQuote` — todas vía `ownedQuoteOrThrow`.
- `tests/integration/guard.test.ts` — dos usuarios verificados insertados directamente (ids
  `crypto.randomUUID()`); plan de prueba insertado en el test con código único y `quota_per_period=10`;
  concurrencia con `Promise.all` de dos `createQuote`.

**Done when**
- [ ] WHEN el usuario A pide leer, renombrar o borrar una cotización cuyo dueño es el usuario B THE SYSTEM SHALL lanzar `NOT_FOUND` (HTTP 404) en los tres casos y dejar intacta la fila de B.
- [ ] WHEN el usuario A lista sus cotizaciones THE SYSTEM SHALL devolver solo filas con `user_id` igual a A y `deleted_at` nulo.
- [ ] WHEN una cuenta verificada sin suscripción crea su primera cotización THE SYSTEM SHALL crearla con un código que cumple `^COT-\d{4}-\d{4}$`, y el segundo intento SHALL lanzar `QUOTA_EXCEEDED` (HTTP 402) sin crear fila.
- [ ] WHEN una cuenta con suscripción `active` ya usó en el periodo actual la cuota de su plan THE SYSTEM SHALL rechazar la siguiente creación con `QUOTA_EXCEEDED`.
- [ ] WHEN dos creaciones concurrentes de la misma cuenta compiten por la última cotización disponible THE SYSTEM SHALL crear exactamente una.
- [ ] WHEN se registra un log con un campo llamado `password` o `token` THE SYSTEM SHALL escribir su valor como `[REDACTED]`.

**Verify**
```bash
pnpm db:up                                    # expect: exit 0
pnpm test tests/integration/guard.test.ts     # expect: exit 0, 0 failed
pnpm typecheck                                # expect: exit 0
pnpm lint                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 5: isolation guard"
git tag step-05-isolation
```

---

#### Step 6 — Tablas de reglas: repositorio con vigencias y seed de demostración

**Do**
- `src/db/seed-data.ts` — las filas de §4 *Datos semilla* como constantes tipadas (importa solo `./schema.ts` para tipos con `import type`).
- `src/db/seed.ts` — `export async function seed(db)` con `insert … on conflict do nothing` por tabla,
  en el orden plans → tax_rates → tariff_headings → tariff_rates → trade_agreements → perception_rules
  → default_local_charges; ejecución directa: `postgres(process.env.DATABASE_URL)` (excepción
  documentada a la regla de `process.env`; `--env-file-if-exists=.env` la carga), `seed(drizzle(sql))`, `sql.end()`.
  Importa solo `drizzle-orm`, `postgres`, `node:url` y `./schema.ts`, `./seed-data.ts` (relativos con `.ts`).
- `src/server/rules/repository.ts` — `resolveRules(tx, { headingCode, at, originCountry, importerCondition })`
  → `{ heading, rates, igv, ipm, dispatchFee, agreements, perception }` en la forma de `EngineInput`
  (§9 paso 7), solo filas con `effective_from <= at` y (`effective_to` nulo o `> at`); partida
  inexistente → `NOT_FOUND`; falta `igv`/`ipm` → `CONFLICT` con mensaje `RULES_INCOMPLETE`;
  percepción: regla de la condición con el `heading_prefix` más largo que prefije la partida (o `''`).
  Cada regla trae `{ table, id, effectiveFrom, sourceUrl }`. También `searchHeadings(tx, q, at)`
  (prefijo de código o `ilike` en descripciones, máx. 20), `currentLocalCharges(tx, at)` (la fila con
  `valid_from` más reciente `<= at` por `concept_code`), `listPerceptionConditions(tx, at)`.
- `tests/integration/rules.test.ts` — corre `seed` dos veces y compara conteos por tabla; cubre los criterios 3–5.

**Done when**
- [ ] WHEN `pnpm db:seed` se ejecuta dos veces sobre la base de desarrollo migrada THE SYSTEM SHALL terminar con código 0 ambas veces.
- [ ] WHEN la función `seed` se ejecuta dos veces sobre la base de pruebas THE SYSTEM SHALL dejar los mismos conteos de filas por tabla tras la segunda ejecución que tras la primera.
- [ ] WHEN se resuelven las reglas de la partida `8477300000` para el 2026-06-01 THE SYSTEM SHALL devolver las filas de IGV e IPM vigentes ese día y ninguna fila con `effective_to` anterior a esa fecha.
- [ ] WHEN se pide una partida que no existe en `tariff_headings` THE SYSTEM SHALL lanzar `NOT_FOUND`.
- [ ] WHEN `resolveRules` devuelve reglas THE SYSTEM SHALL incluir por cada una su tabla, `id`, `effective_from` y `source_url` para el snapshot.

**Verify**
```bash
pnpm db:up                                    # expect: exit 0
pnpm db:migrate                               # expect: exit 0
pnpm db:seed                                  # expect: exit 0 — Node 24 puro, .env cargado por --env-file-if-exists
pnpm db:seed                                  # expect: exit 0 — idempotente
pnpm test tests/integration/rules.test.ts     # expect: exit 0, 0 failed
pnpm typecheck                                # expect: exit 0
pnpm lint                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 6: rules data"
git tag step-06-rules-data
```

---

#### Step 7 — Motor de cálculo puro con pruebas golden

**Do**
Motor derivado del Excel del dueño, **mejorado**. Contrato (`src/lib/engine/types.ts`):

```ts
export type Minor = number; // entero, centavos
export type Bps = number; // entero, 1 bps = 0,01 %
export type RuleRef = { table: string; id: string; effectiveFrom: string; sourceUrl: string };
export type CostLine = {
  id: string;
  conceptCode: string;
  label: string;
  group: "origin_freight" | "other_charges" | "local_soles" | "management_fee";
  origin: "international" | "local";
  igvApplicable: boolean; // ¿esta línea soporta IGV/IPM? (directo, o vía DUA si inCif)
  inCif: boolean; // solo flete y seguro internacionales; exige origin='international' e igvApplicable=true
  amountMinor: Minor;
  currency: "USD" | "PEN"; // PEN se convierte a USD una vez al entrar
};
export type TariffRateRule = RuleRef & {
  kind: "ad_valorem" | "sobretasa" | "antidumping" | "derecho_especifico" | "isc";
  base: "cif" | "fob" | "cif_plus_duties" | "per_unit";
  rateBps: Bps | null;
  amountPerUnitMinor: Minor | null;
  inIgvBase: boolean;
};
export type EngineInput = {
  fx: { penPerUsdE4: number; date: string; source: string }; // 3,50 → 35000
  items: { id: string; description: string; quantity: number; totalMinor: Minor }[]; // FOB = Σ totalMinor
  costLines: CostLine[];
  dutiableUnits: number;
  heading: { code: string; rates: TariffRateRule[] };
  taxes: {
    igv: RuleRef & { rateBps: Bps };
    ipm: RuleRef & { rateBps: Bps };
    dispatchFee: (RuleRef & { amountMinorPen: Minor }) | null; // tasa de despacho en PEN
  };
  origin: {
    countryCode: string | null;
    hasOriginCertificate: boolean;
    agreements: (RuleRef & { agreementCode: string; exemptKinds: TariffRateRule["kind"][]; requiresOriginCertificate: boolean })[];
  };
  perception: RuleRef & { conditionCode: string; rateBps: Bps };
  terms: { advanceBps: Bps; productionDays: [number, number]; shippingCoordinationDays: number; transitDays: [number, number] };
  marginsBps: Bps[];
};
export type TaxLine = {
  component: "ad_valorem" | "sobretasa" | "antidumping" | "derecho_especifico" | "isc" | "igv" | "ipm" | "tasa_despacho" | "percepcion";
  scope: "dua" | "cost_line";
  costLineId: string | null;
  conceptCode: string | null;
  baseMinor: Minor;
  rateBps: Bps | null;
  amountMinor: Minor;
  exempted: boolean;
  exemptionReason: string | null; // p. ej. "agreement:<id de la regla>"
  rule: RuleRef | null;
};
export type Stage = {
  stageNo: 1 | 2 | 3 | 4 | 5 | 6;
  kind: "advance" | "production" | "balance" | "transit" | "logistics_taxes" | "management";
  amountMinor: Minor;
  amountPenMinor: Minor;
  daysMin: number | null;
  daysMax: number | null;
};
export type EngineResult = {
  fobMinor: Minor; cifMinor: Minor; logisticMinor: Minor; dutiesMinor: Minor;
  purchaseTaxesMinor: Minor; perceptionMinor: Minor; managementFeeMinor: Minor;
  totalWithoutIgvMinor: Minor; totalWithIgvMinor: Minor; totalMinor: Minor;
  factorPpm: number;
  pen: { fobMinor: Minor; logisticMinor: Minor; purchaseTaxesMinor: Minor; perceptionMinor: Minor; managementFeeMinor: Minor; totalMinor: Minor };
  taxLines: TaxLine[];
  items: { id: string; unitCostMinor: Minor; totalCostMinor: Minor }[];
  scenarios: { marginBps: Bps; totalMinor: Minor; items: { id: string; unitPriceMinor: Minor }[] }[];
  stages: Stage[];
  snapshot: RuleRef[];
  fx: EngineInput["fx"];
};
```

Reglas de cálculo (`src/lib/engine/calculate.ts#calculateQuote(input): EngineResult`, lanza
`EngineInputError(field)` ante entrada inválida):
1. `roundDiv(a, b) = Math.floor((2a + b) / (2b))` (mitad hacia arriba, enteros ≥ 0, `Number.isSafeInteger` verificado) en `src/lib/engine/money.ts`; `applyBps(base, bps) = roundDiv(base·bps, 10000)`; `toPen(usd, fx) = roundDiv(usd·fx, 10000)`; `toUsd(pen, fx) = roundDiv(pen·10000, fx)`. También `formatMinor(n)` → `"17,332.30"` (miles con coma, 2 decimales, aritmética entera, sin `Intl`) y `formatPen(n)` → `"S/ 60,663.05"`, `formatUsd(n)` → `"$17,332.30"`.
2. Líneas `currency='PEN'` → `toUsd` una vez. FOB = Σ ítems. CIF = FOB + Σ líneas `inCif`.
3. DUA: por cada tarifa de la partida, base según `base` (`cif`, `fob`, `cif_plus_duties` = CIF + derechos anteriores, `per_unit` = `dutiableUnits × amountPerUnitMinor`); exoneración si existe un acuerdo del país de origen que incluye el `kind` y (no requiere certificado o `hasOriginCertificate`), con `exempted=true`, monto 0 y `exemptionReason="agreement:<id>"`. Tasa de despacho = `toUsd(dispatchFee.amountMinorPen)` si existe.
4. Base IGV de importación = CIF + Σ derechos con `inIgvBase`. IGV importación = `applyBps(base, igv)`; IPM importación = `applyBps(base, ipm)` (líneas separadas).
5. Por cada línea `inCif=false`, `igvApplicable=true`: IGV y IPM de la línea con `applyBps(amount, …)`. Líneas con `inCif=true`: su IGV ya está en el DUA.
6. `logisticMinor` = Σ líneas que no son `management_fee`. `dutiesMinor` = derechos DUA + tasa de despacho. `purchaseTaxesMinor` ("IGV compra: aranceles y tributos") = `dutiesMinor` + IGV/IPM de importación + IGV/IPM de líneas no-gestión. `managementFeeMinor` = líneas `management_fee` + su IGV/IPM.
7. Percepción = `applyBps(CIF + dutiesMinor + IGV/IPM de importación, perception.rateBps)`.
8. `totalWithoutIgvMinor` = FOB + logístico + `dutiesMinor` + líneas de gestión; `totalWithIgvMinor` = anterior + todo IGV/IPM; `totalMinor` = `totalWithIgvMinor` + percepción (= FOB + logístico + compra + percepción + gestión).
9. `factorPpm = roundDiv(totalMinor·1_000_000, FOB)`; costo unitario por ítem = `roundDiv(item.totalMinor·totalMinor, FOB·quantity)`; escenarios (margen sobre costo): `unitPrice = roundDiv(unitCost·(10000 + m), 10000)`, `totalMinor = Σ unitPrice·quantity`.
10. Etapas: 1 = `applyBps(FOB, advanceBps)`; 2 = 0 (días de producción); 3 = FOB − etapa 1 (días de coordinación); 4 = 0 (días de tránsito); 5 = logístico + compra + percepción; 6 = gestión. PEN de cada cifra = `toPen` una vez. Validaciones: FOB > 0, `advanceBps` en [0, 10000], `penPerUsdE4 > 0`, `inCif ⇒ origin='international' ∧ igvApplicable`.
11. `snapshot` = todas las `RuleRef` usadas (sin duplicados).

`tests/unit/engine/golden.test.ts` usa **exactamente** esta entrada golden (BG-880, `reference/cotizacion-bg880-ejemplo.pdf`; tasas 1550/250 son del fixture, no un dato oficial):

```ts
const rule = (table: string, id: string) => ({ table, id, effectiveFrom: "2026-01-01", sourceUrl: "fixture://golden" });
const golden: EngineInput = {
  fx: { penPerUsdE4: 35_000, date: "2026-10-29", source: "T.C. referencial COT-2026-BG880" },
  items: [{ id: "item-1", description: "Planta BG-880 + set auxiliar + 5 moldes", quantity: 1, totalMinor: 1_200_000 }],
  costLines: [
    { id: "l1", conceptCode: "intl_freight", label: "Flete marítimo internacional", group: "origin_freight", origin: "international", igvApplicable: true, inCif: true, amountMinor: 90_000, currency: "USD" },
    { id: "l2", conceptCode: "intl_insurance", label: "Seguro internacional", group: "origin_freight", origin: "international", igvApplicable: true, inCif: true, amountMinor: 4_000, currency: "USD" },
    { id: "l3", conceptCode: "customs_agency", label: "Agenciamiento y desaduanaje", group: "other_charges", origin: "local", igvApplicable: true, inCif: false, amountMinor: 25_000, currency: "USD" },
    { id: "l4", conceptCode: "warehouse", label: "Almacén y visto bueno", group: "other_charges", origin: "local", igvApplicable: true, inCif: false, amountMinor: 12_720, currency: "USD" },
    { id: "l5", conceptCode: "local_transport", label: "Transporte local", group: "other_charges", origin: "local", igvApplicable: true, inCif: false, amountMinor: 10_000, currency: "USD" },
    { id: "fee", conceptCode: "management_fee", label: "Gestión comercial y despacho", group: "management_fee", origin: "local", igvApplicable: false, inCif: false, amountMinor: 150_000, currency: "USD" },
  ],
  dutiableUnits: 1,
  heading: { code: "8477300000", rates: [{ ...rule("tariff_rates", "av"), kind: "ad_valorem", base: "cif", rateBps: 0, amountPerUnitMinor: null, inIgvBase: true }] },
  taxes: { igv: { ...rule("tax_rates", "igv"), rateBps: 1_550 }, ipm: { ...rule("tax_rates", "ipm"), rateBps: 250 }, dispatchFee: null },
  origin: { countryCode: "CN", hasOriginCertificate: false, agreements: [] },
  perception: { ...rule("perception_rules", "no-aplica"), conditionCode: "no_aplica", rateBps: 0 },
  terms: { advanceBps: 3_000, productionDays: [30, 35], shippingCoordinationDays: 7, transitDays: [30, 40] },
  marginsBps: [1_000, 2_000, 3_500],
};
```

Aserciones de `golden.test.ts` (enteros exactos; aritmética en §19.6 *Reconciliación byte-exacta*):
FOB 1200000 · CIF 1294000 · logístico 141720 · IGV importación 200570 · IPM importación 32350 ·
compra 241510 · percepción 0 · gestión 150000 · sin IGV 1491720 · total 1733230 · factor 1444358 ppm ·
costo unitario `item-1` 1733230 · escenarios 1906553 / 2079876 / 2339861 · etapas 360000, 0, 840000,
0, 383230, 150000 · PEN: total 6066305, etapa 1 1260000, etapa 3 2940000, etapa 5 1341305, etapa 6
525000, compra 845285 (las tres cifras PEN que difieren en un céntimo de la referencia — total, compra
y etapa 5 — se explican en §19.6 *Reconciliación byte-exacta*). Segundo caso: la misma entrada + línea
`{ id: "l6", conceptCode: "origin_fob_charges", label: "Gastos FOB en origen", group: "origin_freight", origin: "international", igvApplicable: false, inCif: false, amountMinor: 85_714, currency: "USD" }` →
compra 241510, IGV/IPM de `l6` = 0, CIF 1294000, logístico 227434, total 1818944, etapa 5 468944; y
un 18 % plano sobre FOB + logístico daría 256938 ≠ 241510.

`tests/unit/engine/rules.test.ts`: (a) ad valorem 600 bps `cif` con acuerdo `CN` que exonera
`ad_valorem` y requiere certificado: con certificado → 0, `exempted=true`, `exemptionReason="agreement:<id>"`;
sin certificado → 77640, IGV importación 212604, IPM importación 34291; (b) percepción 350 bps sobre la
golden → 53442; (c) línea `local_soles` de 35000 PEN con TC 35000 → 10000 USD; (d) para la golden y
los casos (a)–(c), Σ etapas = total y todo monto es `Number.isInteger`; (e) `inCif=true` con
`origin='local'` → `EngineInputError`.

**Done when**
- [ ] WHEN `calculateQuote` procesa la entrada golden BG-880 THE SYSTEM SHALL devolver en centavos de USD FOB 1200000, logístico 141720, tributos de compra 241510, gestión 150000 y total 1733230.
- [ ] WHEN se lee ese mismo resultado golden THE SYSTEM SHALL devolver las etapas 1, 3, 5 y 6 iguales a 360000, 840000, 383230 y 150000, y un total en PEN de 6066305 con `penPerUsdE4=35000`.
- [ ] WHEN la entrada golden recibe la línea internacional `Gastos FOB en origen` de 85714 con `inCif=false` e `igvApplicable=false` THE SYSTEM SHALL mantener los tributos de compra en 241510, cobrar 0 de IGV en esa línea y devolver un total de 1818944.
- [ ] WHEN el país de origen tiene un acuerdo que exonera `ad_valorem` y el usuario declara certificado de origen THE SYSTEM SHALL fijar el ad valorem en 0 con el id de la regla del acuerdo en su explicación, y sin certificado SHALL cobrar 77640 con una tasa de 600 bps.
- [ ] WHEN se calcula cualquier entrada válida de las pruebas THE SYSTEM SHALL devolver etapas cuya suma es igual al total y solo montos enteros.
- [ ] WHEN `grep` busca en `src/lib/engine` importaciones de `@/server`, `@/db`, `node:` o llamadas a `fetch(` THE SYSTEM SHALL no encontrar ninguna.

**Verify**
```bash
pnpm test tests/unit/engine                     # expect: exit 0, 0 failed — golden + reglas
status=0; grep -rnE 'from "@/(server|db)|from "node:|fetch\(' src/lib/engine || status=$?; test "$status" -eq 1
                                                # expect: exit 0 — 1 = sin coincidencias · 2 = error de grep, y eso falla
pnpm typecheck                                  # expect: exit 0
pnpm lint                                       # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 7: engine"
git tag step-07-engine
```

---

#### Step 8 — Cotizador: producto, partida, costos, términos y cálculo persistido

**Do**
- `src/server/quotes/service.ts` (edición) — `updateProduct` (título, descripción, cliente, país de
  origen, certificado, condición del importador, unidades), `saveItems`, `confirmHeading(code)` (debe
  existir en `tariff_headings` vigente → si no `VALIDATION` y conserva la anterior), `applyDefaultCharges`
  (copia `currentLocalCharges(hoy)` a `quote_cost_lines` si la cotización no tiene líneas),
  `saveCostLines` (Zod: enteros ≥ 0; `inCif ⇒ origin='international' ∧ igvApplicable` si no `VALIDATION` sin guardar nada),
  `saveSupplierTerms` (`advance_bps + balance_bps = 10000` si no `VALIDATION`), `saveFx` (TC > 0, fecha, fuente),
  `calculateQuote` exactamente como §5 *endpoint crítico 1* (sin TC → `VALIDATION` cuyo mensaje nombra `fx`).
- `src/app/(app)/app/quotes/actions.ts` — server actions de §5 (Zod en el borde, `requireActor()`,
  resultado tipado, `revalidatePath`). `suggestHeadingsAction` devuelve en este paso
  `{ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", message: "IA no disponible" } }` (camino manual; el paso 15 lo conecta).
- `src/app/(app)/app/quotes/[id]/page.tsx` — carga la cotización propia (`notFound()` si ajena) y
  pasa datos a `QuoteWizard`; paso por `?paso=` (`producto`, `partida`, `costos`, `resultado`).
- `src/components/quotes/quote-wizard.tsx` (`"use client"`) — pasos: **Producto** (título,
  descripción, cliente, ítems con descripción/cantidad/total USD); **Partida** (buscador manual +
  botón "Sugerir con IA" que muestra candidatos o el mensaje de degradación; confirmar); **Costos y
  términos** (tabla de líneas con `origin`, `igv_applicable`, `in_cif`, moneda editables; TC con
  fecha y fuente; adelanto/saldo y plazos; condición del importador; certificado de origen);
  **Resultado** (tabla resumen igual a la del PDF: Factura FOB, Monto logístico + destino, IGV compra,
  Percepción, Gestión, Total en USD y PEN; factor; costo unitario; escenarios 10/20/35 %; 6 etapas;
  desglose tributario con regla, vigencia, fuente y motivo de exoneración; badge "tasa no verificada"
  si alguna regla es `unverified`; aviso de §7/`ui.md` con `rules_as_of`).
- `tests/integration/quotes-calc.test.ts` — en `beforeAll` llama `seed(db)` de `@/db/seed` (idempotente;
  la base de pruebas solo trae migraciones); con un usuario verificado y `actor` directo cubre los 6 criterios.

**Done when**
- [ ] WHEN se calcula una cotización con las reglas demo sembradas THE SYSTEM SHALL persistir `result`, una fila de `quote_stages` por cada etapa 1–6 y una fila de `quote_tax_breakdown` por cada componente tributario, todas del dueño de la cotización.
- [ ] WHEN se relee una cotización calculada THE SYSTEM SHALL devolver un snapshot de reglas con tabla, `id`, `effective_from` y `source_url` de cada regla usada.
- [ ] WHEN se guarda una línea de costo con `inCif=true` y `origin='local'` THE SYSTEM SHALL devolver `VALIDATION` (HTTP 422) y no guardar nada.
- [ ] WHEN se guardan términos del proveedor cuyo adelanto y saldo no suman 10000 bps THE SYSTEM SHALL devolver `VALIDATION`.
- [ ] WHEN se confirma una partida ausente de `tariff_headings` THE SYSTEM SHALL devolver `VALIDATION` y conservar la partida anterior.
- [ ] WHEN se calcula sin tipo de cambio THE SYSTEM SHALL devolver `VALIDATION` con un mensaje que nombra `fx`.

**Verify**
```bash
pnpm db:up                                          # expect: exit 0
pnpm test tests/integration/quotes-calc.test.ts     # expect: exit 0, 0 failed
pnpm typecheck                                      # expect: exit 0
pnpm lint                                           # expect: exit 0
pnpm build                                          # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 8: quote wizard"
git tag step-08-quote-wizard
```

---

#### Step 9 — Listado, comparación y borrado lógico de cotizaciones

**Do**
- `src/server/quotes/service.ts` (edición) — `compareQuotes(actor, ids)` (2–3 ids, todos propios vía `ownedQuoteOrThrow`).
- `src/app/(app)/app/quotes/actions.ts` (edición) — `createQuoteAction` (redirige a `/app/quotes/<id>?paso=producto`; `QUOTA_EXCEEDED` → mensaje con enlace a `/app/billing`) y `deleteQuoteAction` (confirmación con `<dialog>`).
- `src/app/(app)/app/quotes/page.tsx` — `h1` "Cotizaciones"; tabla (código `COT-`, título, estado, total USD, fecha) paginada por cursor; estado vacío exacto "Aún no tienes cotizaciones"; botón "Nueva cotización"; casillas para comparar y botón "Comparar".
- `src/app/(app)/app/quotes/compare/page.tsx` — una columna por cotización con total, factor y tributos de compra; id ajeno → `notFound()`.
- `tests/e2e/quotes.spec.ts` — usa `signUpAndVerify`, `grantActiveSubscription`, `quoteDeletedAt` de `tests/e2e/helpers.ts`; en el paso de costos el test fija el TC 3.50 con fecha y fuente; borra la cotización al final y confirma `deleted_at` no nulo.

**Done when**
- [ ] WHEN una cuenta nueva verificada abre `/app/quotes` THE SYSTEM SHALL mostrar el texto `Aún no tienes cotizaciones` y un botón `Nueva cotización`.
- [ ] WHEN esa cuenta crea una cotización, ingresa un ítem de factura de 12000.00 USD, confirma la partida `8477300000`, fija el tipo de cambio 3.50 y calcula THE SYSTEM SHALL mostrar el resultado con el total en USD y en PEN.
- [ ] WHEN la cuenta vuelve a `/app/quotes` THE SYSTEM SHALL listar esa cotización con su código `COT-`.
- [ ] WHEN la cuenta borra la cotización THE SYSTEM SHALL quitarla del listado y conservar la fila con `deleted_at` informado.
- [ ] WHEN se abren dos cotizaciones propias en `/app/quotes/compare?ids=<a>,<b>` THE SYSTEM SHALL mostrar una columna por cotización con total, factor y tributos de compra.

**Verify**
```bash
pnpm db:up                                    # expect: exit 0
pnpm test:e2e tests/e2e/quotes.spec.ts        # expect: exit 0, 0 failed
pnpm typecheck                                # expect: exit 0
pnpm lint                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 9: quote list and compare"
git tag step-09-quote-list
```

---

#### Step 10 — Panel admin: gastos locales semanales, tasas tributarias y plan

**Do**
- `src/server/admin/service.ts` — todas las funciones empiezan con `requireAdmin(actor)`:
  `saveLocalCharge` (inserta fila nueva con `valid_from`; nunca actualiza la anterior),
  `listLocalCharges`, `saveTaxRate` (exige `source_url` y `effective_from`; en una transacción cierra
  `effective_to` de la fila vigente anterior del mismo `kind` en el nuevo `effective_from`; `reviewed_by` = admin),
  `markVerified(table, id)` (solo si `source_url` empieza con `https://`, si no `VALIDATION`),
  `savePlan` (precios, cuota, activo; `audit_events` `plan.updated` con el admin como actor).
- `src/app/(admin)/admin/layout.tsx` — `requireUser()` + `requireAdmin` → `notFound()`; nav Gastos / Tasas y plan / Reglas.
- `src/app/(admin)/admin/charges/page.tsx` — tabla del gasto vigente por concepto + formulario "Nueva semana" (concepto, monto, moneda, origen, IGV, CIF, `valid_from`).
- `src/app/(admin)/admin/settings/page.tsx` — tasas por `kind` con historial y estado de verificación; formulario del plan.
- `tests/integration/admin.test.ts` — un admin (role `admin` insertado) y un usuario normal; cubre los 5 criterios.
  Sigue la regla de §13 *Datos de prueba* para tablas globales de reglas: gastos con `concept_code`
  `test_<uuid>` y `valid_from` únicos con año ≥ 2099; tasas solo de `kind` `uit` o `tasa_despacho`
  (nunca `igv`/`ipm`) con dos `effective_from` únicos con año ≥ 2099 y `source_url` `https://`;
  `markVerified` sobre sus propias filas, nunca sobre filas `seed://demo`. Así se puede re-ejecutar.

**Done when**
- [ ] WHEN `requireAdmin` se ejecuta para un actor con `role='user'` THE SYSTEM SHALL lanzar `NOT_FOUND`.
- [ ] WHEN un admin guarda un gasto local con un `valid_from` nuevo THE SYSTEM SHALL insertar una fila nueva, conservar la anterior, y `currentLocalCharges` en esa fecha SHALL devolver el monto nuevo.
- [ ] WHEN un admin guarda una tasa tributaria THE SYSTEM SHALL exigir `source_url` y `effective_from`, cerrar el `effective_to` de la fila anterior en el nuevo `effective_from` y fijar `reviewed_by` con el id del admin.
- [ ] WHEN un admin edita el precio o la cuota del plan THE SYSTEM SHALL persistir el cambio y escribir una fila en `audit_events` con el admin como actor.
- [ ] WHEN un admin marca una tasa como verificada THE SYSTEM SHALL guardar `verification_status='verified'` solo si `source_url` empieza con `https://`.

**Verify**
```bash
pnpm db:up                                    # expect: exit 0
pnpm test tests/integration/admin.test.ts     # expect: exit 0, 0 failed
pnpm typecheck                                # expect: exit 0
pnpm lint                                     # expect: exit 0
pnpm build                                    # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 10: admin panel"
git tag step-10-admin
```

---

#### Step 11 — Compuerta de hechos externos: modelo Gemini, Izipay y fuente oficial del arancel

**Do**
Tres hechos no pudieron verificarse al diseñar (documentación inaccesible). Este paso los resuelve
**antes** de la importación (12), la IA (14) y el cobro (17). El builder lee las fuentes oficiales
(WebFetch) y escribe un archivo por hecho. Formato exacto: la primera línea es `---`; luego una línea
`clave: valor` por cada clave común (`topic`, `status`, `checked_on`, `source_url`) y por cada clave
extra de la tabla de abajo; luego una línea `---`; después, en texto libre, citas textuales cortas de
la fuente que respaldan cada valor. `checked_on` es la fecha real de lectura (`AAAA-MM-DD`);
`status` es `verified` o `deferred`; los valores se copian de la fuente, nunca se suponen.

Permisos: `.claude/settings.json` ya autoriza `WebFetch` para `ai.google.dev`,
`secure.micuentaweb.pe`, `developers.izipay.pe`, `www.sunat.gob.pe`, `www.aduanet.gob.pe` y `www.gob.pe`.

| Archivo | `topic` | Fuente a leer (verificar antes de usar: si la URL no responde, se busca desde la portada del mismo dominio) | Claves extra si `status: verified` |
|---|---|---|---|
| `docs/verified/gemini-model.md` | `gemini-model` | https://ai.google.dev/gemini-api/docs/models | `model_id` (no vacío), `supports_pdf_input: yes`, `supports_json_schema: yes`, `decision` |
| `docs/verified/izipay.md` | `izipay` | https://secure.micuentaweb.pe/doc/es-PE/ y https://developers.izipay.pe/ | `recurring_supported` (yes/no), `usd_supported` (yes/no), `ipn_signature` (algoritmo, campos firmados y clave usada), `integration` (`hosted_redirect`), `mode` (`recurring` o `manual_renewal`), `decision` |
| `docs/verified/tariff-source.md` | `tariff-source` | consulta de tratamiento arancelario de SUNAT https://www.aduanet.gob.pe/itarancel/arancelS01Alias ; portada de SUNAT aduanas https://www.sunat.gob.pe/ ; publicación del Arancel de Aduanas del MEF https://www.gob.pe/mef | `machine_readable` (yes/no), `format` (csv, xlsx, html, pdf o none), `fallback: csv_upload`, `decision` |

**Si una fuente no se puede leer, la compuerta NO pasa sola.** El builder se detiene y reporta al
dueño (regla 8 de §9). Solo con la aceptación explícita del dueño escribe `status: deferred`, un
`next_action` (qué hacer y quién) y `owner_ack` con la fecha ISO de esa aceptación; sin `owner_ack`
la prueba falla. Un hecho `deferred` **bloquea** los pasos que dependen de él: el paso 14 (y con él
el 15) exige `status: verified` en `docs/verified/gemini-model.md`, y el paso 17 lo exige en
`docs/verified/izipay.md`, ambos con una línea de su `Verify`. `tariff-source` puede quedar
`deferred`: el paso 12 se construye solo con el CSV manual (el adaptador oficial devuelve
`unavailable`). `mode: manual_renewal` si Izipay no soporta cobro recurrente (riesgo aceptado del brief).

`tests/unit/verified-docs.test.ts` — lee los tres archivos con `node:fs`, parsea el front matter
(sin dependencias) y valida con Zod: claves comunes `topic`, `status` (`verified|deferred`; cualquier
otro valor falla), `checked_on` (`^\d{4}-\d{2}-\d{2}$`), `source_url` (`^https://`); claves por topic
según la tabla; con `deferred`, `next_action` no vacío y `owner_ack` (`^\d{4}-\d{2}-\d{2}$`).

**Done when**
- [ ] WHEN se ejecuta `pnpm test tests/unit/verified-docs.test.ts` THE SYSTEM SHALL encontrar los tres archivos de `docs/verified/` con las claves de front matter `topic`, `status`, `checked_on` (fecha ISO) y `source_url` (URL https) y terminar con código 0.
- [ ] WHEN `docs/verified/gemini-model.md` tiene `status: verified` THE SYSTEM SHALL exigir un `model_id` no vacío junto con `supports_pdf_input: yes` y `supports_json_schema: yes`.
- [ ] WHEN `docs/verified/izipay.md` tiene `status: verified` THE SYSTEM SHALL exigir `recurring_supported`, `usd_supported`, `ipn_signature` y `mode`, con `mode` igual a `recurring` o `manual_renewal`.
- [ ] WHEN `docs/verified/tariff-source.md` tiene `status: verified` THE SYSTEM SHALL exigir `machine_readable` y `format`.
- [ ] WHEN alguno de los tres archivos no tiene `status: verified` THE SYSTEM SHALL fallar la prueba salvo que tenga `status: deferred` con un `next_action` no vacío y `owner_ack` con la fecha ISO en que el dueño aceptó el aplazamiento.

**Verify**
```bash
pnpm test tests/unit/verified-docs.test.ts    # expect: exit 0, 0 failed
pnpm lint                                     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 11: external facts gate"
git tag step-11-external-facts
git ls-files --error-unmatch docs/verified/gemini-model.md   # expect: exit 0 — versionado tras el commit
git ls-files --error-unmatch docs/verified/izipay.md         # expect: exit 0
git ls-files --error-unmatch docs/verified/tariff-source.md  # expect: exit 0
```

---

#### Step 12 — Importación de reglas: staging, diff, CSV de respaldo, cron y publicación

**Do**
- `src/server/rules/import.ts` — `type TariffSourceAdapter = { fetchRows(): Promise<{ status: "ok"; rows: StagedRow[]; sourceUrl: string } | { status: "unavailable"; reason: string }> }`;
  `csvAdapter(text, sourceLabel)` con el formato de §4 (parser RFC 4180 propio; error con número de
  línea); `officialAdapter()` implementado según `docs/verified/tariff-source.md`: si
  `machine_readable: yes`, descarga `TARIFF_SOURCE_URL` y normaliza al mismo `StagedRow`; si no, devuelve `unavailable`.
  `runImport({ adapter, source, triggeredBy, reportError, now })`: crea la corrida, valida todas las
  filas (cualquier error → `failed` con `error="línea N: …"` y nada en staging), compara cada
  (partida, derecho) con su versión publicada más reciente, sea cual sea su vigencia (`added` si no
  existe partida/derecho, `changed` si difiere tasa/base/descripción,
  `unchanged` si igual; `removed` solo para fuentes `official` completas), escribe staging y
  `diff_summary` `{ added, changed, removed, unchanged }`, estado `staged`. `unavailable` → `failed`,
  `logger.error` y `reportError` una vez. `publishRun(actor, runId)` (admin; transacción: inserta
  filas nuevas con `reviewed_by`, cierra `effective_to` de la versión anterior, `status='published'`)
  y `discardRun`.
- `src/app/api/cron/rules-import/route.ts` — `GET`; `Authorization: Bearer ${requireEnv("CRON_SECRET")}` con comparación en tiempo constante; si no, 401 sin corrida; si sí, `runImport({ adapter: officialAdapter(), source: "official", triggeredBy: "cron" })`.
- `src/app/(admin)/admin/rules/page.tsx` — corridas (estado, conteos, error), diff por fila, botones "Publicar" / "Descartar", subida de CSV (`<input type="file" accept=".csv">`) que corre `csvAdapter`.
- `vercel.json` — `{ "regions": ["gru1"], "crons": [{ "path": "/api/cron/rules-import", "schedule": "0 6 * * *" }] }`.
- `tests/integration/rules-import.test.ts` — re-ejecutable (regla de §13 *Datos de prueba*): genera
  por corrida dos partidas `"99"` + 8 dígitos aleatorios (H1, H2) y fechas `effective_from` únicas con
  año ≥ 2099; nunca toca `8477300000` ni filas `seed://demo`. Primero pone en staging y publica un CSV
  con H1 (criterio 2); luego pone en staging un CSV con H2 (nueva → `added`) y H1 con otra tasa
  (→ `changed`) y verifica que las tablas publicadas no cambian (criterio 1); CSV inválido; adaptador
  `unavailable` inyectado con un `reportError` espía; `GET` sin cabecera; lee `vercel.json` con `node:fs`.

**Done when**
- [ ] WHEN se pone en staging un CSV con cabecera `heading_code,description_es,description_en,kind,base,rate_bps,amount_per_unit_minor,unit,in_igv_base,effective_from,source_url` que trae una partida nueva y una tasa cambiada THE SYSTEM SHALL crear una fila en `rule_import_runs` con estado `staged`, filas de staging marcadas `added` y `changed`, y no modificar `tariff_headings` ni `tariff_rates`.
- [ ] WHEN un admin publica esa corrida THE SYSTEM SHALL copiar las filas de staging a las tablas publicadas con `reviewed_by` igual al id del admin y marcar la corrida como `published`.
- [ ] WHEN una fila del CSV trae un código de partida mal formado o una tasa negativa THE SYSTEM SHALL marcar la corrida `failed` con el número de línea en `error` y no poner nada en staging.
- [ ] WHEN se llama `GET /api/cron/rules-import` sin `Authorization: Bearer <CRON_SECRET>` THE SYSTEM SHALL responder 401 y no crear ninguna corrida.
- [ ] WHEN el adaptador oficial reporta la fuente no disponible THE SYSTEM SHALL marcar la corrida `failed`, registrar un log de nivel `error` y llamar una vez al reporte de errores.
- [ ] WHEN se lee `vercel.json` THE SYSTEM SHALL contener un cron con `path` igual a `/api/cron/rules-import`.

**Verify**
```bash
pnpm db:up                                           # expect: exit 0
pnpm test tests/integration/rules-import.test.ts     # expect: exit 0, 0 failed
pnpm typecheck                                       # expect: exit 0
pnpm lint                                            # expect: exit 0
pnpm build                                           # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 12: rules import"
git tag step-12-rules-import
```

---

#### Step 13 — Almacenamiento privado, subida del PDF del proveedor y extracción de fotos

**Do**
- `src/server/storage/index.ts` — `type StorageProvider = { put(key, bytes: Uint8Array, contentType): Promise<void>; get(key): Promise<Uint8Array | null>; delete(key): Promise<void>; deletePrefix(prefix): Promise<number>; list(prefix): Promise<string[]> }`;
  driver `local` sobre `requireEnv("STORAGE_LOCAL_DIR")` (rechaza claves con `..` o absolutas);
  `getStorage()` según `STORAGE_DRIVER`. Claves: `users/<userId>/quotes/<quoteId>/{uploads,images,generated}/…`.
- `src/server/documents/service.ts` — `uploadSupplierDocument(actor, quoteId, file)` según §5
  *endpoint crítico 2*; `extractImages(bytes)` con `pdfjs-dist/legacy/build/pdf.mjs`
  (`getDocument({ data, isEvalSupported: false, useSystemFonts: false })`, recorre
  `page.getOperatorList()` buscando `OPS.paintImageXObject`, obtiene el objeto con `page.objs.get(name)`,
  convierte RGB/RGBA/escala de grises a RGBA) y `encodePng(width, height, rgba)` propio con
  `node:zlib` (`deflateSync`) y CRC32 (firma `89 50 4E 47 0D 0A 1A 0A`); omite imágenes de menos de
  2 px por lado (la imagen de prueba de 4×4 se conserva). En Node, pdfjs usa su worker falso; si la
  versión instalada exige `GlobalWorkerOptions.workerSrc`, se apunta a `pdfjs-dist/legacy/build/pdf.worker.mjs`.
  `listImages`, `setImageIncluded`, `moveImage(direction)` (reordena `position`), `readImage(actor, quoteId, imageId)`.
- `src/app/api/v1/quotes/[id]/documents/route.ts` — `POST` (multipart, límite 30/h por usuario) y
  `GET ?image=<id>` (`image/png`, `Cache-Control: private, no-store`); ambos con `requireActor(request.headers)`.
- `tests/helpers/session.ts` — `createVerifiedSession(prefix)`: registra con `auth.api.signUpEmail`,
  verifica con el token del outbox en memoria (`readOutbox()`), ingresa con `auth.api.signInEmail`
  pidiendo las cabeceras de respuesta y devuelve `{ userId, cookie }` (valor para la cabecera `Cookie`).
- `tests/integration/documents.test.ts` — construye el PDF de prueba en el test: `encodePng(4, 4, …)` →
  `React.createElement(Document, …, Page, Image{src: Buffer})` → `renderToBuffer` de `@react-pdf/renderer`;
  llama a los handlers exportados `POST`/`GET` con `new Request(…, { headers: { cookie } })` y
  `{ params: Promise.resolve({ id }) }`; cubre los 5 criterios (el archivo de > 20 MB se arma con `new Uint8Array(20_971_521)` que empieza con `%PDF-`).

**Done when**
- [ ] WHEN el dueño sube a su cotización un PDF de menos de 20 MB THE SYSTEM SHALL guardarlo bajo `users/<userId>/quotes/<quoteId>/uploads/`, insertar una fila en `supplier_documents` con su SHA-256 y responder 201.
- [ ] WHEN se sube un PDF generado en la prueba con una imagen PNG incrustada de 4×4 THE SYSTEM SHALL insertar al menos una fila en `document_images` con ancho 4 y alto 4 y un PNG guardado cuyos primeros bytes son la firma PNG.
- [ ] WHEN se sube un archivo cuyos primeros bytes no son `%PDF-` o que pesa más de 20 MB THE SYSTEM SHALL responder 422 y no guardar nada.
- [ ] WHEN el usuario A sube a la cotización del usuario B o pide una imagen de ella THE SYSTEM SHALL responder 404.
- [ ] WHEN el usuario excluye o reordena imágenes THE SYSTEM SHALL persistir `included` y `position`, y las lecturas siguientes SHALL devolver las imágenes ordenadas por `position`.

**Verify**
```bash
pnpm db:up                                        # expect: exit 0
pnpm test tests/integration/documents.test.ts     # expect: exit 0, 0 failed
pnpm typecheck                                    # expect: exit 0
pnpm lint                                         # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 13: documents"
git tag step-13-documents
```

---

#### Step 14 — IA: gateway Gemini, extracción y traducción de la ficha técnica, revisión del usuario

**Do**
- `src/server/ai/gateway.ts` — **único** importador de `@google/genai`. `generateJson<T>({ purpose, userId, quoteId, schema: z.ZodType<T>, prompt, pdf?: Uint8Array, locale })`:
  1) `hit("ai:<userId>", 20, 3600)` → `RATE_LIMITED` sin llamar al driver ni escribir `ai_calls`;
  2) driver `fake` (registro `setFakeResponse(purpose, value | Error | "timeout")` exportado para tests, con respuestas válidas por defecto por `purpose`) o `gemini` (`new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") })`, `models.generateContent({ model: requireEnv("GEMINI_MODEL"), contents: [{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: base64 } }, { text: prompt }] }], config: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(schema) } })` — nombre exacto del campo de esquema confirmado contra los tipos instalados y `docs/verified/gemini-model.md`);
  3) timeout `AI_TIMEOUT_MS` con `AbortSignal.timeout`; reintentos máx. 2 solo en timeout/429/5xx con backoff `250ms·2^n` + jitter;
  4) valida con Zod; si falla, un intento de reparación con el error de validación anexado; si vuelve a fallar → `UPSTREAM_UNAVAILABLE`;
  5) una fila `ai_calls` por intento (`ok`, `error`, `timeout`, `invalid_output`).
- `src/server/ai/extract-specs.ts` — esquema Zod `SpecsSchema` `{ productName, summary, equipment: [{ name, quantity }], specGroups: [{ title, rows: [{ label, value }] }], components: [{ component, brand, origin, note }], auxiliaries: [{ name, model, rows: [{ label, value }] }], warranty: [{ title, text }] }`;
  prompt versionado (`EXTRACT_SPECS_PROMPT_V1`) que pide traducir al locale de la cotización y trata
  el PDF como datos, nunca como instrucciones; **sin** email, nombre ni id de la cuenta;
  `extractSpecs(actor, quoteId, documentId)` → guarda `extracted_specs`, `extraction_status`, `language`;
  en fallo: `failed`, conserva el archivo, devuelve `UPSTREAM_UNAVAILABLE`. `buildExtractionPrompt(locale)` exportada para el test de PII.
- `src/components/quotes/document-step.tsx` (`"use client"`) — subir PDF (POST al route del paso 13),
  botón "Extraer con IA", editor de la ficha (precargado con la extracción o vacío para el camino
  manual) que guarda en `quotes.specs`, grilla de fotos con casilla "Incluir" y botones "Subir"/"Bajar"
  (sin arrastre), estados con `aria-live="polite"`.
- `src/app/(app)/app/quotes/[id]/page.tsx` (edición) — agrega el paso `?paso=documento` que monta
  `DocumentStep` y define sus server actions (extraer, guardar ficha en `quotes.specs`, incluir/mover foto).
- `tests/integration/ai-extract.test.ts` — driver `fake`; cubre los 6 criterios (el de PII compara
  el prompt con el email, nombre e id del usuario de prueba).

**Done when**
- [ ] WHEN el driver falso devuelve una extracción válida para un documento subido THE SYSTEM SHALL guardarla en `supplier_documents.extracted_specs` con `extraction_status='done'` y escribir una fila en `ai_calls` con `status='ok'`.
- [ ] WHEN el driver devuelve dos veces una salida que no cumple el esquema Zod THE SYSTEM SHALL fijar `extraction_status='failed'`, conservar el archivo original y devolver `UPSTREAM_UNAVAILABLE` para que el usuario ingrese la ficha a mano.
- [ ] WHEN el driver excede el tiempo límite THE SYSTEM SHALL reintentar como máximo 2 veces y luego devolver `UPSTREAM_UNAVAILABLE`.
- [ ] WHEN un usuario supera 20 llamadas de IA en una hora THE SYSTEM SHALL devolver `RATE_LIMITED` antes de llamar al driver y no registrar fila en `ai_calls` para la llamada rechazada.
- [ ] WHEN `grep` lista los archivos de `src` que importan `@google/genai` THE SYSTEM SHALL encontrar exactamente `src/server/ai/gateway.ts`, y `docs/verified/gemini-model.md` SHALL tener la línea `status: verified`.
- [ ] WHEN se arma el prompt de extracción THE SYSTEM SHALL no incluir el email, el nombre ni el id de la cuenta.

**Verify**
```bash
grep -qx 'status: verified' docs/verified/gemini-model.md             # expect: exit 0 — si está deferred, este paso queda bloqueado
pnpm db:up                                                             # expect: exit 0
pnpm test tests/integration/ai-extract.test.ts                         # expect: exit 0, 0 failed
test "$(grep -rl '@google/genai' src)" = "src/server/ai/gateway.ts"    # expect: exit 0 — un solo importador
pnpm typecheck                                                         # expect: exit 0
pnpm lint                                                              # expect: exit 0
pnpm build                                                             # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 14: ai extraction"
git tag step-14-ai-extraction
```

---

#### Step 15 — IA: sugerencia de partida validada y narrativa de la cotización

**Do**
- `src/server/ai/suggest-heading.ts` — esquema `{ candidates: [{ code: /^\d{10}$/, rationale, confidence: 0..1 }] }` (máx. 3);
  prompt con la descripción del producto y la ficha revisada (`quotes.specs`), sin datos personales;
  filtra contra `tariff_headings` vigentes (descarta códigos inexistentes); sin válidos →
  `{ candidates: [], reason: "NO_VALID_CANDIDATES" }`; registra `audit_events` `heading.suggested` con los códigos; **no** cambia `quotes.tariff_heading_code`.
- `src/server/ai/narrative.ts` — esquema Zod **estricto** `{ concepts: Record<conceptCode, string>, stages: { "1": string, …, "6": string } }`
  cuyas claves deben ser exactamente los `conceptCode` de la cotización y las 6 etapas (claves extra →
  rechazo); el prompt recibe los montos ya formateados por `formatUsd` y el locale; la salida es solo
  texto: el motor nunca lee números de ella. Guarda en `quotes.narrative` con `{ locale, ... }`; si el driver falla deja `narrative` en nulo y `result` intacto.
- `src/app/(app)/app/quotes/actions.ts` (edición) — `suggestHeadingsAction` conectado; `calculateQuoteAction` llama a la narrativa después de calcular, sin bloquear el resultado si la IA falla.
- `tests/integration/ai-heading.test.ts` — driver `fake` con `setFakeResponse`; cubre los 5 criterios.

**Done when**
- [ ] WHEN el driver falso sugiere tres partidas y una no existe en `tariff_headings` THE SYSTEM SHALL devolver solo las dos publicadas, cada una con justificación y confianza entre 0 y 1.
- [ ] WHEN ninguna partida sugerida existe en `tariff_headings` THE SYSTEM SHALL devolver una lista vacía con el motivo `NO_VALID_CANDIDATES`.
- [ ] WHEN se devuelve una sugerencia THE SYSTEM SHALL no cambiar `quotes.tariff_heading_code` hasta que el usuario confirme una.
- [ ] WHEN la salida de la narrativa trae claves distintas de los ids de concepto y de etapa esperados THE SYSTEM SHALL rechazarla con el esquema Zod y dejar `quotes.narrative` sin cambios.
- [ ] WHEN el driver falla al generar la narrativa THE SYSTEM SHALL dejar `quotes.narrative` en nulo y el `result` del cálculo sin cambios.

**Verify**
```bash
pnpm db:up                                        # expect: exit 0
pnpm test tests/integration/ai-heading.test.ts    # expect: exit 0, 0 failed
pnpm typecheck                                    # expect: exit 0
pnpm lint                                         # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 15: ai heading and narrative"
git tag step-15-ai-heading-narrative
```

---

#### Step 16 — PDF formal de la cotización y descarga

**Do**
- `src/server/pdf/quote-document.ts` — documento `@react-pdf/renderer` escrito con
  `React.createElement` (sin JSX, para que Vitest no necesite transformarlo), A4, Helvetica, que replica
  `reference/cotizacion-bg880-ejemplo.pdf`: cabecera (logo `public/brand/logo.png` si existe, si no el
  wordmark de texto "Cotimporta"), título es "PROPUESTA DE INVERSIÓN" / en "INVESTMENT PROPOSAL",
  producto, código `COT-`, fecha, validez ("15 días calendarios" / "15 calendar days" desde
  `validity_days`), T.C. con fecha y fuente, regla navy `#0F172A`; 1. resumen (Factura FOB, Monto
  logístico + destino, IGV compra, Percepción, Gestión, Inversión total — USD y PEN con
  `formatUsd`/`formatPen`); 2. equipamiento incluido (`specs.equipment`); 3. cronograma de 6 etapas en
  tarjetas numeradas + nota de flujo; 4. especificaciones (`specs.specGroups`); 5. componentes y
  marcas; 6. fichas de equipos auxiliares; 7. fotos incluidas en orden; 8. términos y garantía; bloque
  de firmas; partida y ad valorem aplicados; desglose con fuentes; narrativa (si existe); aviso
  "Estimación referencial. No es una liquidación oficial de aduanas. Reglas vigentes al <rules_as_of ISO>."
  / "Reference estimate. Not an official customs assessment. Rules in force as of <rules_as_of ISO>.";
  pie "Página N de M". Textos en un `copy: Copy<…>`.
- `src/server/pdf/render.ts` — `renderQuotePdf(quote, locale)` → `Uint8Array`; `getOrCreateQuotePdf(actor, quoteId, locale)` según §5 *endpoint crítico 3* (versionado por locale y `result_calculated_at`).
- `src/app/api/v1/quotes/[id]/pdf/route.ts` — `GET` con `requireActor`, `export const runtime = "nodejs"`.
- `src/app/(app)/app/quotes/[id]/page.tsx` (edición) — en `?paso=resultado`, enlaces "Descargar PDF (ES)" y "Download PDF (EN)".
- `tests/integration/quote-pdf.test.ts` — no depende de filas mutables: `tests/setup/integration.ts`
  ya borró toda regla que no es `seed://demo`, y el test afirma que cada regla del `rule_snapshot` de
  su cotización tiene `sourceUrl` `seed://demo` (las filas sembradas de IGV 1550, IPM 250, ad valorem 0
  de `8477300000` y percepción `no_aplica`, que ninguna prueba puede modificar por §13). En `beforeAll`
  llama `seed(db)`; crea vía servicios una cotización con la entrada golden
  (ítem 1200000, líneas l1–l5 + gestión, partida `8477300000`, TC 35000, reglas sembradas con
  IGV 1550 / IPM 250 y percepción `no_aplica`), calcula, renderiza en es y en, extrae el texto con
  `pdfjs-dist/legacy/build/pdf.mjs` (`getTextContent` de cada página, `items.map(i => i.str).join("")`
  y `replace(/\s+/g, "")`); prueba el route handler con `createVerifiedSession` para dueño y ajeno.

**Done when**
- [ ] WHEN se genera el PDF de la cotización golden BG-880 THE SYSTEM SHALL producir bytes que empiezan con `%PDF-` y cuyo texto, extraído con pdfjs-dist y sin espacios, contiene `17,332.30`, `60,663.05` y el código `COT-` de la cotización.
- [ ] WHEN el PDF se genera con locale `en` THE SYSTEM SHALL contener `INVESTMENTPROPOSAL`, y con locale `es` SHALL contener `PROPUESTADEINVERSIÓN`, ambos en el texto sin espacios.
- [ ] WHEN se genera el PDF THE SYSTEM SHALL contener `Estimaciónreferencial` en el texto sin espacios del locale `es` y la fecha ISO `rules_as_of` del snapshot de reglas.
- [ ] WHEN el dueño pide `GET /api/v1/quotes/<id>/pdf?locale=es` THE SYSTEM SHALL responder 200 con `content-type: application/pdf` y guardar una fila en `generated_documents` con versión 1, y un segundo pedido tras recalcular SHALL guardar la versión 2.
- [ ] WHEN otro usuario pide esa URL THE SYSTEM SHALL responder 404.
- [ ] WHEN no existe `public/brand/logo.png` THE SYSTEM SHALL dibujar en la cabecera del PDF la marca de texto `Cotimporta`.

**Verify**
```bash
pnpm db:up                                        # expect: exit 0
pnpm test tests/integration/quote-pdf.test.ts     # expect: exit 0, 0 failed
pnpm typecheck                                    # expect: exit 0
pnpm lint                                         # expect: exit 0
pnpm build                                        # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 16: quote pdf"
git tag step-16-quote-pdf
```

---

#### Step 17 — Cobros: PaymentProvider (fake + Izipay), webhooks idempotentes y plan mensual

**Do**
- `src/server/billing/provider.ts` — `type PaymentProvider = { name: "fake" | "izipay"; createCheckout(req: { userId; planCode; currency: "PEN" | "USD"; amountMinor; orderId; returnUrl }): Promise<{ redirectUrl: string; providerRef: string }>; verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedEvent | null>; cancel(providerRef: string): Promise<void> }`;
  `VerifiedEvent = { externalEventId; type: "payment.succeeded" | "payment.failed" | "subscription.canceled" | string; userId; planCode; currency; amountMinor; occurredAt: Date; providerRef: string | null; raw: unknown }`.
  Driver `fake`: firma = HMAC-SHA256 hex de `rawBody` con `FAKE_PAYMENT_WEBHOOK_SECRET` en la cabecera
  `x-fake-signature` (comparación en tiempo constante); `createCheckout` → `/app/billing?fake_checkout=<orderId>`
  (en dev la página ofrece "Simular pago", que firma y envía el evento). Driver `izipay`: checkout
  alojado (redirect) y verificación IPN **exactamente** según `docs/verified/izipay.md`
  (`ipn_signature`, `mode`), con `IZIPAY_*`. Este paso no empieza si ese archivo no dice `status: verified` (primera línea de su `Verify`).
  `getPaymentProvider(name)`.
- `src/server/billing/service.ts` — `startCheckout(actor, planCode = "mensual")`; moneda `PEN` si el país del
  perfil es `PE`, si no `USD`; plan inactivo o precio 0 → `CONFLICT`; crea/actualiza `subscriptions`
  `incomplete`. `handleWebhook(providerName, rawBody, headers)` según §5 *endpoint crítico 4*;
  renovación: `current_period_start` = `max(now, current_period_end)` y `current_period_end` = +1 mes
  calendario UTC (31 → último día del mes siguiente); en `mode: recurring` y `manual_renewal` el mismo
  `payment.succeeded` extiende el periodo. `cancelSubscription(actor)`.
- `src/app/api/webhooks/payments/[provider]/route.ts` — `POST`, `await request.text()` antes de cualquier parseo; 400/200 según el servicio.
- `src/app/(app)/app/billing/page.tsx` — plan, precio en la moneda del perfil (`formatPen`/`formatUsd`),
  cuota restante (`getEntitlement`), botón "Suscribirme" (server action → `startCheckout` → redirect),
  mensaje "El plan aún no está disponible" si `CONFLICT`, cancelar.
- `tests/integration/billing.test.ts` — driver `fake`; crea sus propios planes con código único
  (`test-<uuid>`, activo con precio > 0, e inactivo) y los pasa a `startCheckout`; evento con
  `occurredAt` 2026-03-15T12:00:00Z → `current_period_end` 2026-04-15T12:00:00Z; cubre los 6 criterios.

**Done when**
- [ ] WHEN llega un evento falso `payment.succeeded` con firma correcta THE SYSTEM SHALL insertar una fila en `payment_events` y dejar la suscripción de la cuenta en `active` con `current_period_end` un mes después de la fecha de pago.
- [ ] WHEN el mismo id de evento llega otra vez THE SYSTEM SHALL responder 200 y no cambiar los conteos de filas de `payment_events` ni de `subscriptions`.
- [ ] WHEN llega un evento con firma incorrecta THE SYSTEM SHALL responder 400 y no escribir ninguna fila.
- [ ] WHEN un perfil con país `PE` inicia el checkout THE SYSTEM SHALL pedir el cobro al proveedor en `PEN`, cualquier otro país SHALL usar `USD`, y `docs/verified/izipay.md` SHALL tener la línea `status: verified`.
- [ ] WHEN el plan está inactivo o tiene precio 0 THE SYSTEM SHALL rechazar el checkout con `CONFLICT`.
- [ ] WHEN una suscripción pasa a `active` en un periodo nuevo THE SYSTEM SHALL iniciar un contador de uso de ese periodo con `quotes_used=0`.

**Verify**
```bash
grep -qx 'status: verified' docs/verified/izipay.md   # expect: exit 0 — si está deferred, este paso queda bloqueado
pnpm db:up                                       # expect: exit 0
pnpm test tests/integration/billing.test.ts      # expect: exit 0, 0 failed
pnpm typecheck                                   # expect: exit 0
pnpm lint                                        # expect: exit 0
pnpm build                                       # expect: exit 0
```

El ida y vuelta real con Izipay (cuenta, red, tarjeta de prueba) no es un gate: está en §20.1.

**Checkpoint**
```bash
git add -A && git commit -m "step 17: billing"
git tag step-17-billing
```

---

#### Step 18 — Ajustes: exportación y borrado de cuenta; health check de producción

**Do**
- `src/server/account/service.ts` — `exportAccount(actor)` (límite 5/día): JSON
  `{ exportedAt, profile, user: { email, name, createdAt }, quotes: [...con quote_lines, quote_cost_lines, quote_supplier_terms, quote_stages, quote_tax_breakdown, supplier_documents (metadatos + extracted_specs), document_images, generated_documents], files: [claves de storage], subscription, usage }`
  incluyendo cotizaciones con `deleted_at`; inserta `data_export_requests` (`status='ready'`).
  `deleteAccount(actor, confirmEmail)`: email debe coincidir; si hay suscripción con `providerRef`, `provider.cancel`;
  `storage.deletePrefix("users/<userId>/")`; en una transacción: `payment_events` → `user_id=null` y
  `payload = { redacted: true, type, amountMinor, currency }`; `audit_events` `account.deleted` con
  `metadata.userHash` (SHA-256 del id) y `actor_user_id` nulo; `delete from users where id = …`
  (cascadas de §4; `audit_events.actor_user_id` y `payment_events.user_id` quedan en nulo por `set null`).
- `src/app/(app)/app/settings/page.tsx` — idioma y país del perfil; "Exportar mis datos" (descarga
  `/api/v1/account/export`); "Borrar mi cuenta" en `<dialog>` que pide escribir el email.
- `src/app/api/v1/account/export/route.ts` — `GET`, `Content-Disposition: attachment; filename="cotimporta-export.json"`.
- `src/app/api/health/route.ts` — `checkHealth(sql)` exportada: `select 1` (timeout 2 s) y número de
  filas de `drizzle.__drizzle_migrations` igual al número de entradas de `drizzle/meta/_journal.json`
  (importado como JSON); 200 `{ ok: true, data: { db: "up", migrations: "current" } }` o 503
  `{ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", … } }`; `GET` usa el cliente de la app; `dynamic = "force-dynamic"`.
- `tests/integration/account.test.ts` — con `createVerifiedSession`, documentos y PDF de prueba; borra y verifica archivos, filas, sesiones y reingreso fallido; `checkHealth` contra `postgres("postgres://cotimporta:cotimporta@127.0.0.1:1/x", { connect_timeout: 1 })`.

**Done when**
- [ ] WHEN un usuario pide la exportación de datos THE SYSTEM SHALL devolver un JSON con el perfil, todas sus cotizaciones (incluidas las borradas lógicamente) con ítems, líneas de costo, etapas y desglose tributario, y la lista de archivos guardados, y registrar una fila en `data_export_requests`.
- [ ] WHEN un usuario borra su cuenta THE SYSTEM SHALL eliminar todos los archivos bajo `users/<userId>/`, eliminar toda fila ligada a ese usuario sin dejar filas en `sessions`, y un ingreso posterior con las mismas credenciales SHALL fallar.
- [ ] WHEN se borra la cuenta THE SYSTEM SHALL conservar las filas de `audit_events` y `payment_events` del usuario solo con `user_id` en nulo.
- [ ] WHEN `bash scripts/serve-check.sh /api/health 200 '"ok":true'` corre con la base alcanzable y las migraciones aplicadas THE SYSTEM SHALL responder 200 con `"ok":true`.
- [ ] WHEN `checkHealth` corre contra una base inalcanzable THE SYSTEM SHALL devolver estado 503 con `"ok":false`.
- [ ] WHEN se ejecutan `pnpm test` y `pnpm test:e2e` completos THE SYSTEM SHALL terminar con código 0, 0 fallidas y 0 omitidas.

**Verify**
```bash
pnpm db:up                                                  # expect: exit 0
pnpm db:migrate                                             # expect: exit 0 — base de desarrollo al día
pnpm test tests/integration/account.test.ts                 # expect: exit 0, 0 failed
pnpm build                                                  # expect: exit 0
bash scripts/serve-check.sh /api/health 200 '"ok":true'     # expect: exit 0 — EJECUTA el health en el build
pnpm typecheck                                              # expect: exit 0
pnpm lint                                                   # expect: exit 0
pnpm test                                                   # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e                                               # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 18: account and health"
git tag step-18-account-health
```

---

### 9.1 Paridad y transición (Parity and cutover)

NOT APPLICABLE — construcción nueva (greenfield): no se reemplaza ningún sistema en ejecución. El
Excel del dueño es referencia de lógica, no un sistema a migrar; no hay datos que mover.

---

## 10. Configuración del entorno (Environment Setup)

### Prerrequisitos

| Herramienta | Versión | Comprobación |
|---|---|---|
| Node.js | 24.22.3 (`.nvmrc`; `engines.node` `>=24.0.0 <25.0.0`) — el Bootstrap la instala en `$HOME/.local` si falta | `node -v` → `v24.22.3` |
| pnpm | 12.18.0 (`packageManager`), vía corepack de Node 24 | `pnpm -v` → `12.18.0` |
| Docker + Compose v2 (`--wait`) | cualquiera con Compose ≥ 2.1 | `docker compose version` |
| git | cualquiera reciente | `git --version` |
| curl, tar, bash | sistema | `curl --version` |
| rsync | opcional (si falta se usa `cp -Rn`) | `rsync --version` |

**Selección de Node (la máquina de construcción tiene `/opt/node22`, v22).** El proyecto exige Node 24:
`.nvmrc` = `24.22.3`, `engines.node` = `>=24.0.0 <25.0.0` (pnpm rechaza instalar con otra versión).
El Bootstrap no depende de nvm: si `node -v` no es `v24.22.3`, descarga el tarball oficial de
`https://nodejs.org/dist/v24.22.3/` a `$HOME/.local/share/` y enlaza `node`, `npm`, `npx`, `corepack`
en `$HOME/.local/bin`; luego `corepack enable --install-directory "$HOME/.local/bin"` deja ahí `pnpm`
(12.18.0). Toda shell posterior antepone `$HOME/.local/bin` al `PATH` (CLAUDE.md lo indica y el hook
`SessionStart` de `.claude/settings.json` lo escribe en `CLAUDE_ENV_FILE`).

### Cuentas a crear primero

| Servicio | URL | Primer paso que la necesita | Nota |
|---|---|---|---|
| Google AI Studio (Gemini API key) | https://aistudio.google.com | producción (local usa `AI_DRIVER=fake`) | modelo verificado en paso 11 |
| Izipay (cuenta del dueño, back office) | https://secure.micuentaweb.pe | producción (local usa `PAYMENT_PROVIDER=fake`) | claves según paso 11 |
| Neon (Postgres) | https://neon.tech | despliegue (local usa Docker) | región São Paulo por verificar |
| Vercel | https://vercel.com | despliegue | región `gru1` |
| GitHub (repo + Actions) | https://github.com | CI | secreto `DATABASE_URL_UNPOOLED` en el environment `production` |
| Proveedor de almacenamiento privado y de correo | se eligen al desplegar | lanzamiento (§20.1) | implementar `StorageProvider` y `EmailProvider` de producción |

Ninguna se necesita para construir los 18 pasos: todo corre local con drivers `log`, `local`, `fake`.
El paso 11 sí necesita leer páginas públicas con `WebFetch`; `.claude/settings.json` lo autoriza solo
para `ai.google.dev`, `secure.micuentaweb.pe`, `developers.izipay.pe`, `www.sunat.gob.pe`,
`www.aduanet.gob.pe` y `www.gob.pe`.

### Variables de entorno

| Variable | Propósito | Dónde se obtiene | Required by step | ¿Secreto? |
|---|---|---|---|---|
| `DATABASE_URL` | Postgres de la app (local: `postgres://cotimporta:cotimporta@localhost:54329/cotimporta_dev`; prod: host con pooler de Neon) | `.env.example` / consola de Neon | 2 | sí (prod) |
| `TEST_DATABASE_URL` | Base de pruebas. **Solo se lee del entorno de la shell** (`vitest.config.ts` y `tests/e2e/env.ts`; ni Vitest ni Playwright cargan `.env`): si no está exportada, ambos usan el valor local literal `postgres://cotimporta:cotimporta@localhost:54329/cotimporta_test`. CI la exporta | `.env.example` (documental) | 2 | no |
| `SERVE_CHECK_PORT` | Puerto de `scripts/serve-check.sh` (por defecto `3200`, distinto del E2E 3100); solo se lee del entorno de la shell | — (opcional) | 1 (opcional) | no |
| `DATABASE_URL_UNPOOLED` | URL directa para migraciones de producción (CI) | consola de Neon | 18 (solo CI/prod; vacía en local) | sí |
| `VERCEL_ENV` | `production` activa la guardia de `getEnv()` | la fija Vercel | 2 | no |
| `BETTER_AUTH_SECRET` | Firma de sesiones (≥ 32 caracteres) | `openssl rand -base64 32` | 3 | sí |
| `BETTER_AUTH_URL` | URL base de la app (local `http://localhost:3000`) | dominio | 3 | no |
| `ADMIN_EMAILS` | Emails que reciben `role='admin'` al registrarse (coma) | dueño | 3 (opcional; vacío = sin admins) | no |
| `EMAIL_DRIVER` | `log` (único driver v1) | `.env.example` | 3 | no |
| `EMAIL_FROM` | Remitente | dueño | 3 | no |
| `EMAIL_OUTBOX_DIR` | Carpeta del outbox del driver `log` | `.env.example` | 3 (opcional) | no |
| `LOG_LEVEL` | `debug|info|warn|error` (por defecto `info`) | `.env.example` | 5 (opcional) | no |
| `ERROR_REPORT_WEBHOOK_URL` | Destino del reporte de errores (POST JSON) | servicio elegido por el dueño | 5 (opcional) | sí |
| `CRON_SECRET` | Bearer del cron de importación | `openssl rand -hex 32` | 12 | sí |
| `TARIFF_SOURCE_URL` | URL oficial verificada en `docs/verified/tariff-source.md` | paso 11 | 12 (opcional; vacía = solo CSV) | no |
| `STORAGE_DRIVER` | `local` (único driver v1) | `.env.example` | 13 | no |
| `STORAGE_LOCAL_DIR` | Carpeta del driver `local` | `.env.example` | 13 | no |
| `AI_DRIVER` | `fake` o `gemini` | `.env.example` | 14 | no |
| `GEMINI_API_KEY` | Llave de Gemini | Google AI Studio | 14 (solo si `AI_DRIVER=gemini`) | sí |
| `GEMINI_MODEL` | Id de modelo de `docs/verified/gemini-model.md` | paso 11 | 14 (solo si `AI_DRIVER=gemini`) | no |
| `AI_TIMEOUT_MS` | Timeout por llamada (por defecto 30000) | `.env.example` | 14 (opcional) | no |
| `PAYMENT_PROVIDER` | `fake` o `izipay` | `.env.example` | 17 | no |
| `FAKE_PAYMENT_WEBHOOK_SECRET` | HMAC del driver `fake` | `.env.example` | 17 (solo si `fake`) | no |
| `IZIPAY_MODE` | `recurring` o `manual_renewal` (de `docs/verified/izipay.md`) | paso 11 | 17 (solo si `izipay`) | no |
| `IZIPAY_SHOP_ID` | Identificador de tienda | back office Izipay | 17 (solo si `izipay`) | no |
| `IZIPAY_API_PASSWORD` | Contraseña de API | back office Izipay | 17 (solo si `izipay`) | sí |
| `IZIPAY_HMAC_KEY` | Clave de firma IPN | back office Izipay | 17 (solo si `izipay`) | sí |
| `IZIPAY_PUBLIC_KEY` | Clave pública del formulario | back office Izipay | 17 (solo si `izipay`) | no |
| `IZIPAY_API_BASE_URL` | URL base de la API | `docs/verified/izipay.md` | 17 (solo si `izipay`) | no |
| `CI` | Lo fija GitHub Actions; Playwright prohíbe `.only` | runner | — | no |
| `NODE_ENV` | Lo fija Next.js | framework | — | no |

`.env.example` se versiona con todas las claves y valores locales o claramente falsos (`dev-only-…`).
`.env` y `.env.*` están ignorados salvo `!.env.example`. "Required by step" es contrato con §9: el
esquema de `src/lib/env.ts` solo exige `DATABASE_URL`; cada módulo exige lo suyo con `requireEnv`
cuando se usa. **Cargadores:** Next.js carga `.env` para la app; `drizzle.config.ts` lo carga con
`process.loadEnvFile`; `pnpm db:seed` con `node --env-file-if-exists=.env`; Vitest con `test.env` de
`vitest.config.ts`; Playwright pasa `webServer.env` y Next carga `.env` para el resto (§19.6).

### Archivos que deben versionarse

| Archivo | Por qué se versiona | Línea de excepción en el ignore |
|---|---|---|
| `.env.example` | plantilla de entorno que el Bootstrap copia a `.env` | `!.env.example` después de `.env.*` |
| `.gitignore`, `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | toolchain reproducible | — no coincide con ningún patrón |
| `biome.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` | gates de lint, tipos y build | — no coincide |
| `vitest.config.ts`, `playwright.config.ts`, `drizzle.config.ts`, `tests/setup/integration.ts`, `tests/e2e/env.ts`, `tests/e2e/helpers.ts`, `tests/e2e/global-setup.ts` | infraestructura de los gates | — no coincide |
| `docker-compose.yml`, `docker/postgres-init/01-test-db.sql`, `scripts/serve-check.sh` | servicios y runner de los gates | — no coincide |
| `.github/workflows/ci.yml`, `vercel.json` | CI y despliegue | — no coincide |
| `.claude/settings.json`, `.claude/rules/*.md`, `.claude/skills/*/SKILL.md`, `CLAUDE.md`, `AGENTS.md` | workspace del agente | — no coincide (solo `.claude/settings.local.json` se ignora) |
| `drizzle/**` | migraciones generadas | — no coincide |
| `docs/verified/*.md` | hechos externos verificados | — no coincide |
| `blueprints/cotimporta/**` | el plano | — no coincide |

### Bootstrap

Ejecutar desde la raíz del proyecto (`/home/user/cotimporta`) con `bash`. **Autoría del manifiesto:**
el proyecto **no** usa scaffolder (`pnpm create next-app` se niega a correr en un directorio no vacío
y este repo ya tiene `CLAUDE.md`, `README.md`, `.claude/`, `reference/`, `blueprints/`, `src/`); el
`package.json` completo lo emite este blueprint en `workspace/` (§19.6) y lo instala este bloque.
Ningún paso de §9 escribe el manifiesto. El bloque es no interactivo, idempotente y sale 0 en su
segunda ejecución.

```bash
set -euo pipefail
# orden: Node 24 → pnpm → copia workspace (.gitignore + exclusiones de herramientas) → fusión de
#        archivos preexistentes → .env → repo git + identidad → install → navegador → formato →
#        primer commit → servicios. El ignore file existe ANTES del primer commit.
BUNDLE=blueprints/cotimporta
test -d "$BUNDLE/workspace"   # se ejecuta desde la raíz del proyecto; si no, aborta aquí

# 1. Node 24.22.3 (la máquina puede traer otro Node, p. ej. /opt/node22)
NODE_VERSION=24.22.3
export PATH="$HOME/.local/bin:$PATH"
if [ "$(node -v 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) NODE_DIST=linux-x64 ;;
    Linux-aarch64) NODE_DIST=linux-arm64 ;;
    Darwin-arm64) NODE_DIST=darwin-arm64 ;;
    Darwin-x86_64) NODE_DIST=darwin-x64 ;;
    *) echo "plataforma no soportada: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
  NODE_HOME="$HOME/.local/share/node-v$NODE_VERSION-$NODE_DIST"
  if [ ! -x "$NODE_HOME/bin/node" ]; then
    mkdir -p "$HOME/.local/share"
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$NODE_DIST.tar.gz" | tar -xz -C "$HOME/.local/share"
  fi
  mkdir -p "$HOME/.local/bin"
  for bin in node npm npx corepack; do ln -sf "$NODE_HOME/bin/$bin" "$HOME/.local/bin/$bin"; done
fi
node -v   # expect: v24.22.3

# 2. pnpm 12.18.0 vía corepack, en un directorio escribible (corepack enable a secas da EACCES con Node de root)
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable --install-directory "$HOME/.local/bin"
corepack prepare pnpm@12.18.0 --activate
pnpm -v   # expect: 12.18.0

# 3. Copiar workspace/ a la raíz SIN pisar nada existente: un segundo run nunca revierte
#    package.json, pnpm-lock.yaml ni configs que un paso ya editó.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --ignore-existing "$BUNDLE/workspace/" ./   # omite existentes y sale 0 en ambos casos
else
  cp -Rn "$BUNDLE/workspace/." ./ || true              # -n no pisa; BSD/macOS cp sale 1 al omitir, y omitir es lo esperado
fi
chmod +x scripts/serve-check.sh

# 4. Fusión de archivos que el repo ya traía (una sola vez; idempotente por marcador):
#    .claude/settings.json existente solo tenía extraKnownMarketplaces/enabledPlugins; la versión
#    del workspace conserva esas dos claves y agrega permissions + hooks.
grep -q '"permissions"' .claude/settings.json 2>/dev/null || cp "$BUNDLE/workspace/.claude/settings.json" .claude/settings.json
#    CLAUDE.md existente era un placeholder; el del workspace incorpora sus reglas (español, no instalar sin plano, sin llaves).
grep -q 'pnpm db:migrate' CLAUDE.md 2>/dev/null || cp "$BUNDLE/workspace/CLAUDE.md" CLAUDE.md
#    Si ya existía un .gitignore propio, se le agregan las reglas del blueprint (incluida la excepción).
grep -qx '!.env.example' .gitignore 2>/dev/null || cat "$BUNDLE/workspace/.gitignore" >> .gitignore

# 5. Entorno local (valores locales/falsos; nunca se versiona)
[ -f .env ] || cp .env.example .env

# 6. Repositorio git (este repo ya existe; en un directorio nuevo se crea) e identidad local
git rev-parse --git-dir >/dev/null 2>&1 || git init -b main
git config user.email >/dev/null || git config user.email "builder@cotimporta.local"
git config user.name >/dev/null || git config user.name "Cotimporta Builder"

# 7. Dependencias (sin lockfile previo en el primer run; CI=true no lo congela gracias al flag)
pnpm install --no-frozen-lockfile || { pnpm approve-builds --all && pnpm install --no-frozen-lockfile; }

# 8. Navegador de Playwright (idempotente; CI usa --with-deps)
pnpm exec playwright install chromium

# 9. Reconciliar formato de los archivos emitidos con biome.json (no-op en el segundo run)
pnpm exec biome check --write .

# 10. Primer commit (lleva .gitignore, configs y pnpm-lock.yaml); no-op si no hay cambios
git add -A
git diff --cached --quiet || git commit -q -m "chore: bootstrap Cotimporta workspace"

# 11. Servicios locales: Postgres para los pasos ≥ 2 (sin Docker, se avisa y se sigue)
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  pnpm db:up
else
  echo "AVISO: Docker no disponible — se necesita desde el paso 2 (pnpm db:up)"
fi
```

Archivos que la copia nunca sobrescribe una vez presentes: `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `.env`, y todo lo que un paso haya editado.
Comandos de servicio: `pnpm db:up` (arranca y espera healthcheck), `pnpm db:down`, `pnpm db:reset`
(borra el volumen local). Migraciones y seed ocurren en los pasos 2 y 6, no aquí (aún no hay esquema).

---

## 11. Dependencias (Dependencies)

Fuente de autoridad: informe de `stack-researcher` de esta sesión — `registry.npmjs.org/<paquete>`
(dist-tags y manifiestos) y `nodejs.org/dist/index.json` para Node, verificado el **2026-11-13**.
Filas con fuente `knowledge/runtime-tracks/ts-node.md` son el respaldo del track para lo que el
informe no resolvió, con su fecha (2026-10-17) y la advertencia "verificar antes de instalar". Todos
los paquetes npm los instala §10 Bootstrap (paso 7) desde `package.json` emitido en `workspace/`.

### Runtime

| Paquete | Versión | Fuente | Verificado | Instalado por | Propósito |
|---|---|---|---|---|---|
| Node.js | 24.22.3 (Krypton) | https://nodejs.org/dist/index.json | 2026-11-13 | §10 Bootstrap (descarga si falta) | runtime; 26.13.1 LTS también verificado y aceptado por todos los `engines` leídos, pero el soporte de Vercel para 26 está **UNVERIFIED** |
| pnpm | 12.18.0 | https://registry.npmjs.org/pnpm | 2026-11-13 | §10 Bootstrap (corepack) | gestor de paquetes (`packageManager`) |
| next | 16.4.6 | https://registry.npmjs.org/next | 2026-11-13 | §10 Bootstrap | framework (engines `>=20.9`) |
| react | 19.3.1 | https://registry.npmjs.org/react | 2026-11-13 | §10 Bootstrap | UI (peer de next `^19.0.0` leído) |
| react-dom | 19.3.1 | https://registry.npmjs.org/react-dom | 2026-11-13 | §10 Bootstrap | UI |
| better-auth | 1.7.22 | https://registry.npmjs.org/better-auth | 2026-11-13 | §10 Bootstrap | auth (peer drizzle-orm `^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0` leído) |
| drizzle-orm | 0.45.4 (exacto) | https://registry.npmjs.org/drizzle-orm | 2026-11-13 | §10 Bootstrap | ORM (peer `postgres` `>=3` leído) |
| postgres | 4.1.1 | https://registry.npmjs.org/postgres | 2026-11-13 | §10 Bootstrap | driver Postgres (porsager) |
| next-intl | 4.15.1 | https://registry.npmjs.org/next-intl | 2026-11-13 | §10 Bootstrap | i18n (peers next `^16`, react `^19` leídos) |
| zod | 4.6.7 | https://registry.npmjs.org/zod | 2026-11-13 | §10 Bootstrap | validación en bordes, env, salidas de IA |
| @google/genai | 3.3.0 | https://registry.npmjs.org/@google/genai | 2026-11-13 | §10 Bootstrap | SDK de Gemini (engines `>=22`); solo `src/server/ai/gateway.ts` |
| @react-pdf/renderer | 4.9.0 | https://registry.npmjs.org/@react-pdf/renderer | 2026-11-13 | §10 Bootstrap | generar el PDF formal (JS puro, peer react `^19` leído) |
| pdfjs-dist | 6.5.438 | https://registry.npmjs.org/pdfjs-dist | 2026-11-13 | §10 Bootstrap | leer imágenes y texto de PDFs (Apache-2.0; engines `>=22.13 \|\| >=24`); `@napi-rs/canvas` opcional **no** se instala |

### Desarrollo

| Paquete | Versión | Fuente | Verificado | Instalado por | Propósito |
|---|---|---|---|---|---|
| typescript | 7.0.2 | https://registry.npmjs.org/typescript | 2026-11-13 | §10 Bootstrap | tipos. **Compatibilidad con next 16.4.6 NO probada por el investigador — verificar antes de instalar**: el smoke test (Bootstrap + paso 1 `pnpm typecheck && pnpm build`) la confirma; si falla, ver §20.3 decisión 6 |
| @types/node | `^24.0.0` (rango; versión exacta queda en `pnpm-lock.yaml`) | https://registry.npmjs.org/@types/node | 2026-11-13 | §10 Bootstrap | tipos de Node 24. `latest` es 26.6.6 pero el proyecto apunta a Node 24: **verificar antes de instalar** con `pnpm view @types/node versions` |
| @types/react | 19.3.0 | `knowledge/runtime-tracks/ts-node.md` | 2026-10-17 | §10 Bootstrap | tipos de React — respaldo del track, **verificar antes de instalar** |
| @types/react-dom | 19.3.0 | `knowledge/runtime-tracks/ts-node.md` | 2026-10-17 | §10 Bootstrap | ídem |
| tailwindcss | 4.3.5 | https://registry.npmjs.org/tailwindcss | 2026-11-13 | §10 Bootstrap | estilos |
| @tailwindcss/postcss | 4.3.5 | https://registry.npmjs.org/@tailwindcss/postcss | 2026-11-13 | §10 Bootstrap | plugin PostCSS (`postcss.config.mjs`) |
| drizzle-kit | 0.31.11 (exacto) | https://registry.npmjs.org/drizzle-kit | 2026-11-13 | §10 Bootstrap | generar/aplicar migraciones |
| vitest | 5.1.0 | https://registry.npmjs.org/vitest | 2026-11-13 | §10 Bootstrap | unit + integración (engines `^22.12 \|\| ^24 \|\| >=26`) |
| @playwright/test | 1.65.0 | https://registry.npmjs.org/@playwright/test | 2026-11-13 | §10 Bootstrap (+ `playwright install chromium`) | E2E |
| @biomejs/biome | 2.5.15 | `knowledge/runtime-tracks/ts-node.md` | 2026-10-17 | §10 Bootstrap | lint + formato — respaldo del track (el informe no lo resolvió), **verificar antes de instalar** |

### Artefactos con versión fuera de npm

| Artefacto | Valor | Fuente | Verificado | Instalado por | Propósito |
|---|---|---|---|---|---|
| Imagen `postgres` | `17.6-alpine` | **UNVERIFIED — verificar antes de instalar** (elegida por ser Postgres 17, la mayor por defecto de Neon; confirmar que la etiqueta exista en Docker Hub) | — | `docker-compose.yml` y `.github/workflows/ci.yml` (emitidos) | base local y de CI |
| `actions/checkout`, `actions/setup-node` | `v4` | **UNVERIFIED — verificar antes de usar** (etiqueta mayor) | — | `.github/workflows/ci.yml` (emitido) | CI |
| Modelo Gemini | `GEMINI_MODEL` (sin valor en el plano) | **UNVERIFIED** → paso 11 lo resuelve leyendo https://ai.google.dev/gemini-api/docs/models | — | paso 11 (`docs/verified/gemini-model.md`) | extracción, partida, narrativa |
| Izipay: recurrencia, USD, firma IPN | — | **UNVERIFIED** → paso 11 (https://secure.micuentaweb.pe/doc/es-PE/, https://developers.izipay.pe/) | — | paso 11 (`docs/verified/izipay.md`) | cobro |
| Neon región `aws-sa-east-1` | servicio | **UNVERIFIED** (reportada GA) | — | despliegue (§12) | base de producción |
| Vercel runtime Node | ajuste de proyecto 24.x | **UNVERIFIED** | — | despliegue (§12) | hosting |

Servicios alojados (Vercel, Neon, Izipay, Google AI) no llevan versión.

### No se usan deliberadamente

| Rechazado | En su lugar | Por qué |
|---|---|---|
| mupdf | pdfjs-dist | licencia AGPL |
| pdf-lib | @react-pdf/renderer (generar) + pdfjs-dist (leer) | sin mantenimiento |
| next-auth / Auth.js | better-auth | v5 solo beta; v4 (4.24.15) es la línea anterior |
| shadcn CLI 4.23.0 (`pnpm dlx shadcn@4.23.0`) | HTML nativo + utilidades propias en `globals.css` | la CLI instala Radix y utilidades sin versión fijada en el informe y su `init` reescribe `globals.css`; se puede adoptar después con versiones fijadas |
| `next/font/google` | pila de fuentes del sistema con Inter primero | el build no debe depender de la red |
| tsx / dotenv | Node 24 strip-types + `--env-file-if-exists`; `process.loadEnvFile` | menos dependencias; Node ya lo hace |
| `server-only` | reglas de frontera + `.claude/rules/server.md` | evita una condición de exportación que Vitest y Node puro no resuelven |
| Sentry SDK, Resend, SDKs de storage | interfaces `ErrorReporter`/`EmailProvider`/`StorageProvider` con drivers locales | proveedores se eligen al desplegar; sin versión verificada hoy |
| `@napi-rs/canvas` | codificador PNG propio con `node:zlib` | binario nativo opcional innecesario |
| Prisma | Drizzle | codegen y cliente pesado |

---

## 12. Estrategia de despliegue (Deployment Strategy)

### Hosting

Vercel, plan Pro (cron diario y funciones de hasta 60 s para PDF/IA), región de funciones `gru1`
(São Paulo) declarada en `vercel.json`. Build `pnpm build`, salida `.next`, runtime Node 24.x
(`engines.node`; confirmar en el ajuste del proyecto — UNVERIFIED). Base: Neon Postgres 17
(región São Paulo por verificar), `DATABASE_URL` con pooler, `DATABASE_URL_UNPOOLED` solo en CI.

### Entornos

| Entorno | Rama | URL | Base de datos | Modo de terceros |
|---|---|---|---|---|
| Local | — | http://localhost:3000 | Docker `cotimporta_dev` / `cotimporta_test` | `log`, `local`, `fake` |
| Preview | cualquier PR | automática de Vercel | rama de Neon por PR | `AI_DRIVER=fake`, `PAYMENT_PROVIDER=fake` |
| Producción | `main` | dominio propio (p. ej. subdominio del sitio del dueño) | Neon principal | `gemini`, `izipay`, drivers de storage/correo de producción |

### CI/CD

`.github/workflows/ci.yml` (emitido): job `check` en cada PR y push — `pnpm install --frozen-lockfile`
→ `pnpm exec playwright install --with-deps chromium` → `cp .env.example .env` → `pnpm typecheck` →
`pnpm lint` → `pnpm test` → `pnpm build` → `pnpm db:migrate` → `serve-check /` → `serve-check
/api/health` → `pnpm test:e2e` (Postgres de servicio). Job `migrate` solo en push a `main`, después
de `check`, con `DATABASE_URL_UNPOOLED` del environment `production`. Vercel despliega por su
integración con GitHub. El gate de CI es §20.1; queda completo en verde a partir del paso 18.

### Liberación y rollback

Promoción: merge a `main` → `check` verde → `migrate` → despliegue de Vercel. Rollback: "Instant
Rollback" de Vercel al despliegue anterior (segundos); las migraciones son solo aditivas
(expandir/contraer), así que el código anterior funciona con el esquema nuevo. Datos: PITR de Neon
(restauración a un punto en el tiempo) — prueba de restauración en el checklist §20.1.

### Dominio, DNS, TLS

Registro `CNAME` del subdominio elegido → `cname.vercel-dns.com`; TLS automático de Vercel; HSTS en
producción (`next.config.ts`). El sitio de marketing del dueño enlaza a este dominio.

---

## 13. Estrategia de pruebas (Testing Strategy)

| Capa | Framework | Qué cubre | Dónde | Corre |
|---|---|---|---|---|
| Unit | Vitest (proyecto `unit`) | motor (golden, exoneraciones, percepción, PEN, invariantes), docs verificados | `tests/unit/**` | cada commit |
| Integración | Vitest (proyecto `integration`, en serie) | servicios + Postgres real: auth, aislamiento, cuotas, reglas, cálculo persistido, admin, importación, documentos, IA (fake), PDF, cobro, cuenta, health | `tests/integration/**` | cada commit |
| E2E | Playwright (chromium, build de producción en :3100) | registro→verificación→ingreso, shell sin scroll horizontal, cotización completa, listado, comparación, borrado | `tests/e2e/*.spec.ts` | cada commit en CI; pasos 4, 9, 18 |

### Flujos críticos E2E

1. Registro → verificación por el outbox → ingreso → `/app` (paso 4).
2. Crear cotización → partida `8477300000` → TC 3.50 → calcular → total USD/PEN (paso 9).
3. Listar, comparar y borrar lógicamente (paso 9).

### Datos de prueba

Postgres de `docker-compose.yml`, base `cotimporta_test` (creada por
`docker/postgres-init/01-test-db.sql`), apuntada por `TEST_DATABASE_URL`; `tests/setup/integration.ts`
la migra y `tests/e2e/global-setup.ts` la migra, vacía `rate_limit_buckets` (para que el límite de
registro por IP no se arrastre entre corridas E2E) y la siembra. Nunca se trunca la base: cada prueba
crea usuarios únicos. Desarrollo usa `cotimporta_dev`; nunca se comparten. Toda prueba de un solo
archivo falla si el archivo no existe (no hay `passWithNoTests` global; solo el paso 1 lo pasa por flag).

**Tablas globales de reglas — regla obligatoria.** `tax_rates`, `tariff_headings`, `tariff_rates`,
`trade_agreements`, `perception_rules` y `default_local_charges` las comparten todas las pruebas y el
golden del paso 16. Por eso:
1. Una prueba que escribe en ellas usa valores únicos por corrida: partidas `"99"` + 8 dígitos
   aleatorios, `concept_code` `test_<uuid>`, fechas `effective_from`/`valid_from` únicas con año ≥ 2099
   y `source_url` `https://`.
2. Nunca escribe filas de `kind` `igv` o `ipm`, ni filas de la partida `8477300000`, ni actualiza filas
   del seed (`source_url='seed://demo'`; en `default_local_charges`, `created_by` nulo).
3. `tests/setup/integration.ts`, después de migrar y antes de cada archivo de integración, borra toda
   fila de esas tablas que no sea del seed y todas las `rule_import_runs` (con su staging en cascada).
Así los pasos 10 y 12 se pueden re-ejecutar y el golden del paso 16 solo ve las reglas sembradas.

### Qué no se prueba deliberadamente

- La llamada real a Gemini y el ida y vuelta real con Izipay (red, cuentas): §20.1.
- La calidad lingüística de traducciones y narrativa: revisión humana en §20.1; la estructura sí se prueba.
- El pixel-perfect del PDF frente a la referencia: se prueban contenido y cifras, no la maquetación.
- La importación oficial real si `docs/verified/tariff-source.md` dice `machine_readable: no`.

---

## 14. Seguridad y secretos (Security & Secrets)

| Asunto | Control | Implementado en |
|---|---|---|
| Almacenamiento de secretos | variables de entorno de Vercel/GitHub; nunca en el repo | §10, `.gitignore` |
| Rotación | `BETTER_AUTH_SECRET`, `CRON_SECRET`, `IZIPAY_HMAC_KEY`, `GEMINI_API_KEY` cada 6 meses o ante sospecha; rotar `BETTER_AUTH_SECRET` cierra sesiones | runbook en `docs/` (post-lanzamiento) |
| Validación de entrada | Zod en cada action/handler; tamaño y firma mágica de archivos | `src/app/**`, `src/server/**` |
| Salida / XSS | React escapa; nada de `dangerouslySetInnerHTML`; texto de IA se muestra como texto | `src/components/**` |
| Inyección SQL | Drizzle parametrizado y plantillas etiquetadas de `postgres`; nunca SQL concatenado | `src/server/**` |
| AuthN / AuthZ | §8: servidor en cada petición; `authz.ts`; ajeno = 404 | `src/server/authz.ts` |
| CSRF | origen validado en server actions de Next y en better-auth (`trustedOrigins`) | framework + `src/lib/auth.ts` |
| Límites / abuso | §5 (Postgres); registro 5/h por IP mitiga cuentas gratis en masa (riesgo residual aceptado) | `src/server/rate-limit.ts` |
| Webhooks | firma sobre cuerpo crudo + libro `payment_events` único | `src/server/billing/**` |
| Cron | Bearer `CRON_SECRET`, comparación en tiempo constante | `src/app/api/cron/rules-import/route.ts` |
| Auditoría de dependencias | `pnpm audit --prod` semanal; altas/críticas se corrigen en ≤ 7 días | CI (post-lanzamiento) |
| Cabeceras | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`; en producción CSP `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'` y HSTS | `next.config.ts` |
| Datos personales | nombre, email, país, cotizaciones y PDFs del proveedor; archivos privados servidos solo tras verificar propiedad; exportación y borrado (paso 18) | `src/server/account/service.ts` |
| Higiene de logs | redacción por clave; sin prompts completos ni PDFs en logs | `src/server/errors.ts` |
| IA y datos | sin PII en prompts; Gemini solo recibe documento, descripción y locale | `src/server/ai/**` |

**Reglas duras**
- Ningún secreto se versiona, se imprime en logs, se envía al reporte de errores ni llega al cliente.
- La autorización corre antes del trabajo.
- Los webhooks se verifican por firma antes de confiar en el cuerpo.

**Régimen:** Ley N.° 29733 de Protección de Datos Personales del Perú. Obligaciones para este build:
finalidad informada al registrarse (texto en `/auth/sign-up` que enlaza a la política de privacidad —
redacción legal en §20.1), derechos de acceso y supresión (exportar y borrar, paso 18), medidas de
seguridad (cifrado en tránsito, acceso privado a archivos, mínimo privilegio), y registro del banco
de datos ante la autoridad (trámite del dueño, §20.1). No se tratan datos de salud ni de menores.

---

## 15. Accesibilidad (Accessibility)

**Objetivo: WCAG 2.2 nivel AA.**

### Requisitos base

| Requisito | Regla |
|---|---|
| HTML semántico | `header`/`nav`/`main`/`footer`, un `h1` por página, encabezados en orden, listas para listas |
| Teclado | todo operable con teclado; orden lógico; sin trampas; enlace "Saltar al contenido" (paso 1) |
| Foco visible | `outline: 2px solid var(--color-primary)`, `outline-offset: 2px` (≥ 3:1) |
| Contraste | texto 4,5:1, texto grande y límites 3:1 — §7 lo cumple |
| Formularios | cada input con `<label>`; errores como texto en `role="alert"` |
| Imágenes | fotos del proveedor con `alt` = nombre del equipo o "Foto N del proveedor"; decorativas `alt=""` |
| Movimiento | todo respeta `prefers-reduced-motion: reduce` |
| Zoom / reflow | usable a 200 % y a 320 px sin scroll horizontal (tablas en contenedor desplazable) |
| Regiones vivas | extracción, cálculo y guardado anunciados con `aria-live="polite"` |

### Adiciones WCAG 2.2

| CS | Requisito |
|---|---|
| 2.4.11 Foco no oculto | sin barras fijas que tapen el foco; la cabecera no es sticky |
| 2.5.7 Movimientos de arrastre | reordenar fotos con botones "Subir"/"Bajar" |
| 2.5.8 Tamaño del objetivo | controles ≥ 24×24 px |
| 3.3.7 Entrada redundante | el asistente reutiliza lo ingresado (país del perfil, TC, términos por defecto) |
| 3.3.8 Autenticación accesible | se permite pegar y gestores de contraseñas; sin CAPTCHA cognitivo |

### Verificación

```bash
pnpm lint                                        # expect: exit 0 — reglas a11y de Biome (recommended)
pnpm test:e2e tests/e2e/auth-shell.spec.ts       # expect: exit 0 — etiquetas, role="alert", sin scroll horizontal a 375/1440 px
```
Un barrido automático con axe no se incluye en v1 (paquete no verificado en el informe); se agrega
con versión fijada después. Antes del lanzamiento: recorrido solo con teclado de los flujos críticos,
una pasada con lector de pantalla del asistente y una pasada a 200 % de zoom en 375 px (§20.1).

---

## 16. Observabilidad y costos (Observability & Cost)

### Instrumentación

| Señal | Herramienta | Qué captura | Quién la mira |
|---|---|---|---|
| Errores | `reportError` (driver `log` o `webhook` → `ERROR_REPORT_WEBHOOK_URL`) | excepciones no controladas con `requestId`, ruta, release; PII redactada | dueño (alerta en su canal) |
| Logs | JSON por línea en Vercel Logs | `level`, `time`, `requestId`, ruta, `userId` (id, nunca email) | dueño / builder |
| Métricas | consultas SQL sobre `quotes`, `ai_calls`, `rule_import_runs`, `payment_events` | las de abajo | dueño, semanal |
| Disponibilidad | monitor externo (p. ej. un uptime checker gratuito) sobre `/api/health` cada 5 min desde Sudamérica | 200/503 | dueño |

### Métricas que importan

| Métrica | Meta | Alerta en |
|---|---|---|
| p95 de `calculateQuoteAction` | < 800 ms | > 2 s por 15 min |
| Tasa de 5xx | < 0,5 % | > 2 % en 15 min |
| `ai_calls` con `status != 'ok'` | < 5 % | > 20 % en 1 h |
| Corridas de importación `failed` | 0 por semana | cualquier `failed` (ya llama a `reportError`) |
| Webhooks con firma inválida | 0 | > 3 por hora |
| Cotizaciones calculadas por semana (negocio) | ≥ 30 a los 60 días | < 5 en una semana tras el mes 2 |

### Health check

`GET /api/health` (paso 18): `select 1` con timeout de 2 s y conteo de migraciones aplicadas igual al
journal de `drizzle/`; 200 o 503. Lo consulta el monitor externo y CI.

### Modelo de costos (estimados; verificar en las páginas de precios al contratar)

| Servicio | Free tier | Costo a escala v1 (≈ 100 usuarios, 300 cotizaciones/mes) | A 10× | Precipicio |
|---|---|---|---|---|
| Vercel | Hobby (sin uso comercial) | plan Pro por asiento | igual + excedentes de funciones | duración de funciones de PDF/IA |
| Neon | plan gratis con límite de cómputo | plan de entrada | plan de entrada + cómputo | horas de cómputo activas |
| Gemini | cuota gratuita con límites | centavos por cotización (≈ 3 llamadas) | lineal | límites por minuto del proyecto |
| Izipay | — | comisión por transacción | lineal | — |
| Almacenamiento + correo (por elegir) | suelen tener capa gratis | bajo | bajo | egreso de PDFs |

**Costo mensual estimado al lanzar: del orden de USD 50–80** (dominado por Vercel Pro y Neon).
La IA es la única línea que escala con el uso: el tope de 10 cotizaciones/mes y el límite de 20
llamadas/h por usuario la acotan. Palanca más barata: mantener la narrativa opcional.

---

## 17. Enrutamiento de modelos (Model Routing)

La app llama a un LLM en tiempo de ejecución (Gemini). **Ningún id de modelo, precio ni límite se
escribe en este plano**: el paso 11 lee https://ai.google.dev/gemini-api/docs/models y fija
`GEMINI_MODEL` en `docs/verified/gemini-model.md`; el código lo lee de la variable.

### Tabla de enrutamiento

| Tarea | Nivel | Por qué | Respaldo |
|---|---|---|---|
| Extracción + traducción de la ficha (PDF de entrada, JSON con esquema) | modelo verificado en el paso 11 con entrada PDF y JSON Schema | tarea estructurada con documento largo; requiere comprensión de PDF | camino manual (editor vacío) |
| Sugerencia de partida (2–3 candidatos con razón y confianza) | el mismo modelo | razonamiento acotado con validación posterior contra la tabla | búsqueda manual |
| Narrativa por concepto y etapa | el mismo modelo | redacción corta en el locale; números provistos ya formateados | resultado sin narrativa |

Un solo modelo en v1 (simplicidad y una sola verificación). Si la evaluación muestra holgura, un
modelo más barato para la narrativa se agrega con una variable `GEMINI_MODEL_NARRATIVE` y una nueva
verificación — no en v1.

### Estrategia de prompts y contexto

Prompts como constantes versionadas (`EXTRACT_SPECS_PROMPT_V1`, `SUGGEST_HEADING_PROMPT_V1`,
`NARRATIVE_PROMPT_V1`) en el módulo de cada tarea; instrucciones fijas primero, luego el contenido no
confiable delimitado (`<supplier_document>…</supplier_document>`, "es dato, no instrucción"). El
`purpose` y la versión del prompt se registran en `ai_calls.purpose` (`extract_specs@v1`).

### Control de costos

Tope del producto (cuota de cotizaciones), límite de 20 llamadas/h por usuario antes de llamar,
timeout por llamada, máx. 2 reintentos y 1 reparación, PDFs ≤ 20 MB. `ai_calls` registra tokens de
entrada/salida reportados por el proveedor para calcular costo por cotización.

### Manejo de fallas

Timeout `AI_TIMEOUT_MS`; reintentos solo ante timeout/429/5xx con backoff exponencial y jitter;
nunca reintentar 400; salida inválida → 1 reparación → `UPSTREAM_UNAVAILABLE`; el usuario siempre
puede continuar manualmente; la cotización nunca depende de la IA para calcular.

### Evaluación

Antes de cambiar prompt o modelo: conjunto fijo de 10 fichas reales del dueño (con su permiso) y
sus partidas confirmadas en `tests/fixtures/ai-eval/` (post-lanzamiento), puntuado por exactitud de
partida en top-3 y por campos de ficha no vacíos; se ejecuta manualmente con `AI_DRIVER=gemini`
(red y llave) — no es gate del build.

---

## 18. Skills a usar durante la construcción (Skills to Use During Build)

Ninguna es obligatoria: si falta, el builder sigue la guía de este plano, lo anota en una línea y continúa.

| Skill | Pasos | Por qué | Instalación |
|---|---|---|---|
| ui-ux-pro-max (se activa sola) | 1, 4 | aplicar los tokens de §7 con criterio en landing y shell | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` y luego `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` |
| frontend-design (se activa sola) | 4, 8, 9, 14 | asistente, listado, comparación y paso de documento con calidad de producción | `/plugin marketplace add anthropics/skills` y luego `/plugin install example-skills@anthropic-agent-skills` |
| playwright-cli (se activa sola) | 4, 9, 18 | depurar los specs E2E | `npm install -g @playwright/cli@latest` y luego `playwright-cli install --skills` |

---

## 19. Workspace del agente (Agent Workspace)

Modo bundle: los archivos reales viven en `blueprints/cotimporta/workspace/` y reflejan la ruta que
ocupan en el proyecto. **El builder copia ese único directorio a la raíz del proyecto** con el comando
no destructivo de §10 Bootstrap (paso 3): `rsync -a --ignore-existing` (sale 0 aunque omita) o, si no
hay rsync, `cp -Rn … || true` (BSD/macOS `cp -n` sale 1 al omitir, y omitir es lo esperado). Nunca se
sobrescriben `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`
ni `.env` una vez presentes. Los tres archivos que el repo ya traía (`CLAUDE.md`, `.claude/settings.json`,
y un posible `.gitignore`) se fusionan con los comandos con marcador del paso 4 del Bootstrap.
No se emite `.claude/commands/`.

Estilo de formato de los archivos emitidos: el que fija `biome.json` emitido (espacios, ancho 2,
comillas dobles, punto y coma, comas finales, línea de 100). El Bootstrap ejecuta
`pnpm exec biome check --write .` una vez para reconciliar cualquier diferencia antes del primer
commit; `tsconfig.json` está excluido de Biome porque Next.js lo reescribe.

### 19.1 `CLAUDE.md`

````markdown
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
````

### 19.2 `AGENTS.md`

````markdown
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
````

### 19.3 `.claude/settings.json`

Fusiona el archivo que el repo ya tenía (`extraKnownMarketplaces`, `enabledPlugins` del plugin
the-architect — conservados tal cual) con la allowlist y el hook de `PATH`. Cada subcomando de cada
`Verify` de §9, de cada Checkpoint y de §20.1 tiene su entrada (`grep`, `ls`, `wc`, `cat` son
lecturas integradas; `test` tiene `Bash(test:*)`; las asignaciones `status=0`/`n=$(…)` no son comandos).
También están, tal cual los ejecuta §10, los comandos de una re-ejecución del Bootstrap (`rsync`/`cp`
de la copia, fusiones, `corepack`, `pnpm install --no-frozen-lockfile`, `pnpm approve-builds --all`,
`pnpm exec biome check --write .`, `git config`, `git init -b main`, `git commit -q -m`), el respaldo
documentado de TypeScript del paso 1 (`pnpm add -D -E typescript@6.0.3`) y `WebFetch` limitado a los
dominios oficiales que lee el paso 11. La descarga de Node (`curl … | tar`) solo ocurre en el primer
run y no se pre-aprueba.

```json
{
  "extraKnownMarketplaces": {
    "soyenriquerocha": {
      "source": { "source": "github", "repo": "Hainrixz/the-architect" }
    }
  },
  "enabledPlugins": {
    "the-architect@soyenriquerocha": true
  },
  "permissions": {
    "allow": [
      "Bash(pnpm install --frozen-lockfile)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm lint)",
      "Bash(pnpm format)",
      "Bash(pnpm test)",
      "Bash(pnpm test:*)",
      "Bash(pnpm test:e2e)",
      "Bash(pnpm test:e2e:*)",
      "Bash(pnpm build)",
      "Bash(pnpm dev)",
      "Bash(pnpm db:up)",
      "Bash(pnpm db:down)",
      "Bash(pnpm db:reset)",
      "Bash(pnpm db:generate)",
      "Bash(pnpm db:migrate)",
      "Bash(pnpm db:seed)",
      "Bash(pnpm exec playwright install chromium)",
      "Bash(bash scripts/serve-check.sh:*)",
      "Bash(docker compose ps:*)",
      "Bash(test:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add -A)",
      "Bash(git commit -m:*)",
      "Bash(git tag:*)",
      "Bash(git ls-files:*)",
      "Bash(git check-ignore:*)",
      "Bash(git rev-list:*)",
      "Bash(git rev-parse:*)",
      "Bash(git config:*)",
      "Bash(git init -b main)",
      "Bash(git commit -q -m:*)",
      "Bash(rsync -a --ignore-existing blueprints/cotimporta/workspace/ ./)",
      "Bash(cp -Rn blueprints/cotimporta/workspace/. ./)",
      "Bash(cp blueprints/cotimporta/workspace/.claude/settings.json .claude/settings.json)",
      "Bash(cp blueprints/cotimporta/workspace/CLAUDE.md CLAUDE.md)",
      "Bash(cp .env.example .env)",
      "Bash(chmod +x scripts/serve-check.sh)",
      "Bash(corepack enable --install-directory:*)",
      "Bash(corepack prepare pnpm@12.18.0 --activate)",
      "Bash(pnpm install --no-frozen-lockfile)",
      "Bash(pnpm approve-builds --all)",
      "Bash(pnpm exec biome check --write .)",
      "Bash(pnpm add -D -E typescript@6.0.3)",
      "WebFetch(domain:ai.google.dev)",
      "WebFetch(domain:secure.micuentaweb.pe)",
      "WebFetch(domain:developers.izipay.pe)",
      "WebFetch(domain:www.sunat.gob.pe)",
      "WebFetch(domain:www.aduanet.gob.pe)",
      "WebFetch(domain:www.gob.pe)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.local)",
      "Read(./.env.production)",
      "Read(./.env.production.local)",
      "Bash(git push:*)",
      "Bash(git push --force:*)",
      "Bash(git reset --hard origin:*)",
      "Bash(docker volume rm:*)",
      "Bash(rm -rf:*)"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "if [ -n \"${CLAUDE_ENV_FILE:-}\" ]; then echo 'export PATH=\"$HOME/.local/bin:$PATH\"' >> \"$CLAUDE_ENV_FILE\"; fi; true"
          }
        ]
      }
    ]
  }
}
```

Las reglas `deny` desalientan, no aíslan: un script que abra `.env` por sí mismo no lo detectan. El
aislamiento real de secretos de producción es que nunca están en esta máquina (§14).

### 19.4 Skills del proyecto — `.claude/skills/<name>/SKILL.md`

| Skill | Se activa con | Qué automatiza |
|---|---|---|
| `add-migration` | "nueva columna", "nueva tabla", "migración", cambios en `src/db/schema.ts` | editar esquema → generar → migrar → verificar sin deriva |
| `run-step-gate` | "cerrar paso", "marcar hecho", "siguiente tarea", retomar sesión | correr el `verify` completo, marcar `done`, commit y tag |

`.claude/skills/add-migration/SKILL.md`:

````markdown
---
name: add-migration
description: Cambia el esquema de Postgres de Cotimporta y genera/aplica la migración con Drizzle. Úsalo cuando haya que agregar o modificar una tabla, columna, índice o enum en src/db/schema.ts, o cuando digan "nueva columna", "nueva tabla", "migración".
---

# Agregar una migración

## Cuándo usarlo
- Hay que cambiar `src/db/schema.ts` (tabla, columna, índice, enum).
- Un test de integración falla por una columna que no existe.

## Pasos
1. `pnpm db:up` (Postgres local con healthcheck).
2. Edita solo `src/db/schema.ts`. Importaciones: paquetes o relativas con `.ts`; nunca `@/`.
3. Si es producción-sensible, expande primero (columna nullable o con default); contrae en otro despliegue.
4. `pnpm db:generate` — revisa la migración que emite en `drizzle/` (nombre elegido por drizzle-kit).
5. `pnpm db:migrate` contra la base de desarrollo.
6. Corre la prueba que cubre la tabla.

## Verify
```bash
pnpm db:migrate                                     # expect: exit 0
pnpm test tests/integration/db.test.ts              # expect: exit 0 — toda tabla del esquema existe
n=$(ls drizzle/*.sql | wc -l); pnpm db:generate; test "$(ls drizzle/*.sql | wc -l)" -eq "$n"
                                                    # expect: exit 0 — no hay deriva entre esquema y migraciones
```

## No hagas
- Editar, renombrar o borrar a mano un archivo de `drizzle/`.
- Borrar o renombrar una columna en el mismo despliegue que deja de usarla.
- Usar `pnpm exec drizzle-kit push`: este proyecto solo migra con archivos versionados.
````

`.claude/skills/run-step-gate/SKILL.md`:

````markdown
---
name: run-step-gate
description: Ejecuta y cierra un paso del plan de construcción de Cotimporta (tasks.json) con su verify, commit y tag. Úsalo al terminar una tarea, cuando digan "cerrar paso", "marcar hecho", "siguiente tarea" o al retomar una sesión interrumpida.
---

# Cerrar un paso del plan

## Cuándo usarlo
- Terminaste el trabajo de una tarea de `blueprints/cotimporta/tasks.json`.
- Retomas una sesión y hay una tarea en `in_progress`.

## Pasos
1. `export PATH="$HOME/.local/bin:$PATH"` y confirma `node -v` = `v24.22.3`.
2. Si la tarea toca base de datos: `pnpm db:up`.
3. Corre **cada** comando del arreglo `verify` de la tarea, en orden, desde la raíz del proyecto.
4. Si alguno falla: corrige el código, nunca el comando. Repite el arreglo completo.
5. Cambia `status` a `done` en `tasks.json`.
6. `git add -A && git commit -m "<id>: <título>"` y luego `git tag <checkpoint>` (valor literal del campo).
7. Corre las aserciones que el bloque Checkpoint del paso traiga después del tag.

## Verify
```bash
pnpm typecheck && pnpm lint && pnpm test        # expect: exit 0
git tag -l 'step-*'                               # expect: lista el tag recién creado
```

## No hagas
- Saltar a la siguiente tarea con un gate en rojo.
- Hacer commit antes de que el `verify` pase.
- Inventar un tag distinto del campo `checkpoint`.
````

### 19.5 `.claude/rules/*.md`

| Archivo | `paths` | Cubre |
|---|---|---|
| `.claude/rules/database.md` | `src/db/**`, `drizzle/**`, `drizzle.config.ts` | esquema, imports relativos `.ts`, migraciones, dinero, seed |
| `.claude/rules/engine.md` | `src/lib/engine/**`, `tests/unit/engine/**` | pureza, redondeo, IGV por línea, etapas, snapshot |
| `.claude/rules/server.md` | `src/server/**`, `src/app/api/**`, `src/app/**/actions.ts` | transporte delgado, authz, errores, sobre, logs, límites |
| `.claude/rules/ui.md` | `src/app/**/*.tsx`, `src/components/**` | server-first, copy es/en, tokens, a11y, aviso |
| `.claude/rules/testing.md` | `tests/**`, `vitest.config.ts`, `playwright.config.ts` | capas, datos únicos, drivers falsos |
| `.claude/rules/ai-billing.md` | `src/server/ai/**`, `src/server/billing/**`, `src/app/api/webhooks/**` | gateway único, sin PII, webhooks idempotentes |

`.claude/rules/database.md`:

```markdown
---
description: Esquema, migraciones y seed de Postgres (Drizzle)
paths:
  - "src/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
---

# Base de datos

- `src/db/schema.ts` es la única definición de tablas. Cambiarlo → `pnpm db:generate` → `pnpm db:migrate`.
- `src/db/schema.ts` y `src/db/seed*.ts` importan solo paquetes y archivos relativos con extensión
  `.ts` (`./schema.ts`). Nunca `@/…`: `pnpm db:seed` los ejecuta Node 24 sin bundler, que resuelve
  rutas literalmente. `schema.ts` no importa nada interno.
- Sintaxis TypeScript borrable solamente (`erasableSyntaxOnly`): sin `enum`, sin `namespace`, sin
  parámetros-propiedad. Importaciones de tipos con `import type` (`verbatimModuleSyntax`).
- Nunca editar ni renombrar a mano un archivo de `drizzle/`; la migración la nombra `drizzle-kit`.
  Se describe como "la migración que emite `pnpm db:generate`".
- Dinero: `bigint` modo `number`, unidades menores (centavos). Tasas: `integer` en puntos básicos
  (1 bps = 0,01 %). Tipo de cambio: `integer` PEN por USD × 10 000.
- Fechas-hora: `timestamp with time zone` (UTC). Vigencias de reglas: `date` (`effective_from`
  inclusivo, `effective_to` exclusivo, nulo = vigente).
- Toda fila de usuario lleva `user_id` con índice. `quotes` se borra lógicamente (`deleted_at`);
  el resto de hijas se borra en cascada al borrar la cuenta.
- El seed es idempotente: `insert … on conflict do nothing` sobre claves naturales únicas.
- Migraciones de producción: expandir → desplegar → contraer. Nunca borrar o renombrar una columna
  en el mismo despliegue que deja de usarla.
```

`.claude/rules/engine.md`:

```markdown
---
description: Motor de cálculo puro de la cotización
paths:
  - "src/lib/engine/**"
  - "tests/unit/engine/**"
---

# Motor de cálculo

- Puro: sin I/O, sin `fetch`, sin `node:*`, sin importar `@/server` ni `@/db`. Entrada → salida.
- Ninguna tasa literal en el código: IGV, IPM, derechos, percepción y tasa de despacho llegan en `EngineInput`.
- Solo enteros. Montos en centavos de USD; tasas en bps; TC en PEN×10 000; factor en ppm.
- Redondeo único `roundDiv(a, b)` = mitad hacia arriba para enteros ≥ 0 (`Math.floor((2a + b) / (2b))`),
  con `Number.isSafeInteger` verificado. Cada línea tributaria se redondea por separado y el total es
  la suma de líneas redondeadas.
- IGV/IPM por línea: base DUA (CIF + derechos con `inIgvBase`) y, aparte, cada línea local con
  `igvApplicable=true` e `inCif=false`. Nunca un 18 % plano sobre la suma.
- Líneas en PEN se convierten a USD una sola vez al entrar al motor con el TC de la cotización.
  La conversión final USD→PEN usa el mismo TC, una vez por cifra mostrada.
- Etapa 3 = FOB − etapa 1 (sin redondear dos veces). La suma de las 6 etapas siempre es el total.
- Cada línea tributaria lleva su regla (`table`, `id`, `effectiveFrom`, `sourceUrl`) y, si se
  exonera, el motivo. El resultado incluye el snapshot de todas las reglas usadas.
- Las pruebas golden (`tests/unit/engine/golden.test.ts`) son el contrato; no se ajustan para pasar.
```

`.claude/rules/server.md`:

```markdown
---
description: Servicios, server actions y route handlers
paths:
  - "src/server/**"
  - "src/app/api/**"
  - "src/app/**/actions.ts"
---

# Servidor

- Transporte delgado: la server action o el route handler valida con Zod, obtiene el actor con
  `requireActor()` y llama a una función de `src/server/**`. La lógica nunca vive en el handler.
- Toda consulta a filas de usuario pasa por `src/server/authz.ts`: `ownedQuoteOrThrow(tx, actor, id)`
  filtra por `user_id` y `deleted_at is null`. Recurso ajeno o inexistente = `NOT_FOUND` (404).
- Admin: `requireAdmin(actor)`; un no-admin recibe `NOT_FOUND`, no 403.
- Errores tipados de `src/server/errors.ts`: `VALIDATION` 422, `UNAUTHENTICATED` 401,
  `NOT_FOUND` 404, `QUOTA_EXCEEDED` 402, `RATE_LIMITED` 429, `CONFLICT` 409,
  `INVALID_SIGNATURE` 400, `UPSTREAM_UNAVAILABLE` 503, `INTERNAL` 500.
- Respuesta JSON única: `{ "ok": true, "data": … }` o
  `{ "ok": false, "error": { "code", "message", "requestId" } }`.
- Escrituras que cambian cuota, dinero o reglas: dentro de `db.transaction`, con `select … for update`
  sobre el contador o la fila afectada.
- `logger` escribe JSON por línea con `requestId`; redacta claves que coincidan con
  `/password|token|secret|key|authorization|cookie/i` como `[REDACTED]`.
- Límites (`src/server/rate-limit.ts`, Postgres): ingreso 10/min por IP; registro 5/h por IP;
  otros POST de `/api/auth` 30/min por IP; IA 20/h por usuario; nuevas cotizaciones 30/h por usuario;
  exportación 5/día por usuario.
- `process.env` solo se lee en `src/lib/env.ts`.
```

`.claude/rules/ui.md`:

```markdown
---
description: Componentes, páginas, accesibilidad y textos ES/EN
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
---

# Interfaz

- Server Components por defecto; `"use client"` en la hoja más pequeña con estado o eventos.
- Sin librería de componentes: HTML nativo (`<dialog>`, `<details>`, `<select>`, `<table>`) con las
  clases utilitarias de `src/app/globals.css` (`btn`, `btn-primary`, `btn-ghost`, `input`, `card`,
  `table-base`, `badge`). Ningún hex ni px arbitrario fuera de `globals.css`.
- Textos: objeto `copy: Copy<T>` junto al componente (`{ es: T; en: T }`); TypeScript obliga a que
  ambos idiomas tengan las mismas claves. Locale con `getLocale()` (servidor) o `useLocale()` (cliente).
- Montos: siempre `formatMinor()` / `formatPen()` de `src/lib/engine/money.ts`; nunca `toFixed` ni
  `Intl` en componentes.
- Cada input con `<label>` asociado; errores como texto en `role="alert"`; foco visible
  (`outline` 2 px acento); objetivos de 24×24 px mínimo; reordenar con botones, nunca solo arrastre.
- Un `h1` por página. Listas y vistas asíncronas con estado vacío, de carga y de error.
- Sin desplazamiento horizontal a 375 px; tablas anchas dentro de un contenedor con `overflow-x-auto`.
- Aviso obligatorio en resultado y PDF: es "Estimación referencial. No es una liquidación oficial de
  aduanas. Reglas vigentes al AAAA-MM-DD." / en "Reference estimate. Not an official customs
  assessment. Rules in force as of YYYY-MM-DD."
```

`.claude/rules/testing.md`:

```markdown
---
description: Convenciones de pruebas (Vitest y Playwright)
paths:
  - "tests/**"
  - "vitest.config.ts"
  - "playwright.config.ts"
---

# Pruebas

- Unitarias: `tests/unit/**/*.test.ts` (sin base de datos). Integración: `tests/integration/**/*.test.ts`
  (base `cotimporta_test`, migrada por `tests/setup/integration.ts`, archivos en serie).
  E2E: `tests/e2e/*.spec.ts` (Playwright levanta el build de producción en el puerto 3100).
- Nunca se trunca ni se comparte estado: cada prueba crea sus propios usuarios con email único
  (`uniqueEmail()` en E2E; `crypto.randomUUID()` en integración).
- Tablas globales de reglas (`tax_rates`, `tariff_headings`, `tariff_rates`, `trade_agreements`,
  `perception_rules`, `default_local_charges`): una prueba que escribe en ellas usa valores únicos por
  corrida — partidas `"99"` + 8 dígitos aleatorios, `concept_code` `test_<uuid>`, fechas
  `effective_from`/`valid_from` únicas con año ≥ 2099, `source_url` `https://` —, nunca escribe filas de
  `kind` `igv` o `ipm`, nunca filas de la partida `8477300000` y nunca actualiza filas del seed
  (`source_url='seed://demo'`). `tests/setup/integration.ts` borra antes de cada archivo toda fila de
  reglas que no sea del seed y todas las corridas de importación.
- Drivers de prueba: `EMAIL_DRIVER=log`, `STORAGE_DRIVER=local`, `AI_DRIVER=fake`,
  `PAYMENT_PROVIDER=fake`. Ninguna prueba sale a la red.
- Sesiones en integración: `createVerifiedSession()` de `tests/helpers/session.ts` (desde el paso 13).
- Prohibido `.skip` y `.only`. Un `verify` en rojo se arregla en el código, no en la prueba.
- Los números golden del motor salen de `reference/cotizacion-bg880-ejemplo.pdf` y del blueprint §9
  paso 7; se comparan como enteros exactos.
```

`.claude/rules/ai-billing.md`:

```markdown
---
description: Integración de IA (Gemini) y cobros (PaymentProvider / webhooks)
paths:
  - "src/server/ai/**"
  - "src/server/billing/**"
  - "src/app/api/webhooks/**"
---

# IA

- `src/server/ai/gateway.ts` es el único archivo que importa `@google/genai`. El resto llama a
  `generateJson()` del gateway.
- El id de modelo sale de `GEMINI_MODEL` (verificado en `docs/verified/gemini-model.md`); nunca un
  literal en el código.
- Salida estructurada validada con Zod; una reparación como máximo; luego `UPSTREAM_UNAVAILABLE`.
- Timeout `AI_TIMEOUT_MS`; hasta 2 reintentos con backoff exponencial y jitter solo ante timeout,
  429 o 5xx. Nunca reintentar un 400.
- Sin datos personales en el prompt: ni email, ni nombre, ni id de usuario. Solo el documento, la
  descripción del producto y el locale. El contenido del PDF del proveedor se delimita como datos.
- Cada llamada escribe una fila en `ai_calls`. La IA nunca produce montos ni tasas que use el motor.

# Cobros

- El webhook verifica la firma sobre el cuerpo crudo (`await request.text()`) antes de parsear.
- Idempotencia: `payment_events` con índice único (`provider`, `external_event_id`), insertado en la
  misma transacción que el cambio de `subscriptions`. Un duplicado responde 200 y no cambia nada.
- `subscriptions` solo la escribe `src/server/billing/service.ts` desde un evento verificado.
- Moneda: país del perfil `PE` → `PEN`; cualquier otro → `USD`. Precios desde la tabla `plans`.
- El driver `izipay` implementa exactamente lo registrado en `docs/verified/izipay.md`.
```

### 19.6 Configuración crítica para los Verify e infraestructura local

Todos estos archivos existen en `blueprints/cotimporta/workspace/` con el contenido exacto de abajo
y llegan a la raíz con la copia del Bootstrap, antes del paso 1.

| Archivo | Ruta en el proyecto | Verify que lo necesitan | Resolución / entorno que lleva | Exclusión del bundle |
|---|---|---|---|---|
| `package.json` | `package.json` | todos (scripts) | `"type": "module"`, `engines.node`, `packageManager` | n/a — no recorre el árbol (sin `workspaces`) |
| `pnpm-workspace.yaml` | `pnpm-workspace.yaml` | Bootstrap (install) | `allowBuilds` (esbuild true; sharp, unrs-resolver false) | sin `packages:` → pnpm no recorre subdirectorios; `blueprints/` nunca es paquete |
| `.nvmrc` | `.nvmrc` | Bootstrap, CI | `24.22.3` | n/a |
| `tsconfig.json` | `tsconfig.json` | `pnpm typecheck`, `pnpm build` (todos los pasos) | `paths` `@/*`; `allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (Node puro del seed); `types: ["node"]` (TS 7 por defecto `[]`) | `"exclude": [..., "blueprints", "reference", ...]` |
| `biome.json` | `biome.json` | `pnpm lint` (todos) | `css.parser.tailwindDirectives: true`; VCS ignore | `"!!**/blueprints"`, `"!!**/reference"` en `files.includes` |
| `next.config.ts` | `next.config.ts` | `pnpm build` (todos) | plugin next-intl → `./src/i18n/request.ts`; `serverExternalPackages` `@react-pdf/renderer`, `pdfjs-dist` | `outputFileTracingExcludes` `"blueprints/**"`, `"reference/**"` |
| `postcss.config.mjs` | `postcss.config.mjs` | `pnpm build` | `@tailwindcss/postcss` | n/a — Tailwind excluye con `@source not "../../blueprints"` en `globals.css` (paso 1) |
| `vitest.config.ts` | `vitest.config.ts` | `pnpm test …` (pasos 1–18) | alias `^@/` → `src/`; cargador de entorno `test.env`; proyectos `unit`/`integration` | `exclude: [..., "blueprints/**", "reference/**", ...]` |
| `tests/setup/integration.ts` | `tests/setup/integration.ts` | integración (pasos 2–18) | migra `cotimporta_test` con `drizzle/` (omite si no hay journal) y borra filas de reglas no-seed y corridas de importación (§13) | n/a — no recorre |
| `playwright.config.ts` | `playwright.config.ts` | `pnpm test:e2e` (pasos 4, 9, 18) | `webServer` build+start en :3100 con `env` de prueba; `globalSetup` | `testDir: "./tests/e2e"` + `testIgnore` `**/blueprints/**` |
| `tests/e2e/env.ts` | `tests/e2e/env.ts` | E2E | puerto, URL de base de pruebas, outbox | n/a |
| `tests/e2e/global-setup.ts` | `tests/e2e/global-setup.ts` | E2E | migra, vacía `rate_limit_buckets` y siembra (`import()` dinámico de `src/db/seed.ts`, omite si falta) | n/a |
| `tests/e2e/helpers.ts` | `tests/e2e/helpers.ts` | `auth-shell.spec.ts`, `quotes.spec.ts` | lee outbox; SQL directo a `cotimporta_test` | n/a |
| `drizzle.config.ts` | `drizzle.config.ts` | `pnpm db:generate`, `pnpm db:migrate` (pasos 2, 6, 18, CI) | **cargador de entorno**: `process.loadEnvFile(".env")` si existe; `DATABASE_URL_UNPOOLED` o `DATABASE_URL` | n/a — lee solo `./src/db/schema.ts` |
| `docker-compose.yml` | `docker-compose.yml` | `pnpm db:up` (pasos 2–18) | `postgres:17.6-alpine`, volumen nombrado, healthcheck que exige `cotimporta_test` | n/a |
| `docker/postgres-init/01-test-db.sql` | idem | `pnpm db:up` (primera vez) | crea `cotimporta_test` | n/a |
| `scripts/serve-check.sh` | `scripts/serve-check.sh` | pasos 1, 2, 18; CI | `next start` carga `.env` | n/a |
| `.env.example` | `.env.example` | Bootstrap → `.env` | valores locales de §10 | n/a |
| `.gitignore` | `.gitignore` | primer commit del Bootstrap | `!.env.example` | `blueprints/` se versiona a propósito (no se ignora) |
| `.github/workflows/ci.yml` | idem | CI (= §20.1) | servicio Postgres, `TEST_DATABASE_URL`, `DATABASE_URL` | n/a |

Servicios: (1) `docker-compose.yml` con etiqueta fija, volumen y healthcheck; (2) `DATABASE_URL` y
`TEST_DATABASE_URL` en §10 con su valor local literal y en `.env.example`; (3) `pnpm db:up` /
`pnpm db:down` / `pnpm db:reset` en el Bootstrap y en la tabla de comandos de §19.1; (4) esos
comandos en `permissions.allow` de §19.3.

`package.json`:
```json
{
  "name": "cotimporta",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.18.0",
  "engines": {
    "node": ">=24.0.0 <25.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "next typegen && tsc --noEmit",
    "lint": "biome check .",
    "format": "biome check --write .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "db:up": "docker compose up -d --wait db",
    "db:down": "docker compose down",
    "db:reset": "docker compose down -v && docker compose up -d --wait db",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "node --env-file-if-exists=.env src/db/seed.ts"
  },
  "dependencies": {
    "@google/genai": "3.3.0",
    "@react-pdf/renderer": "4.9.0",
    "better-auth": "1.7.22",
    "drizzle-orm": "0.45.4",
    "next": "16.4.6",
    "next-intl": "4.15.1",
    "pdfjs-dist": "6.5.438",
    "postgres": "4.1.1",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.15",
    "@playwright/test": "1.65.0",
    "@tailwindcss/postcss": "4.3.5",
    "@types/node": "^24.0.0",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "drizzle-kit": "0.31.11",
    "tailwindcss": "4.3.5",
    "typescript": "7.0.2",
    "vitest": "5.1.0"
  }
}
```

`.nvmrc`:
```text
24.22.3
```

`pnpm-workspace.yaml`:
```yaml
# Solo ajustes de pnpm para un proyecto único (sin "packages": no hay monorepo, nada que recorrer).
# pnpm 12 aborta la instalación ante scripts de build no revisados (ERR_PNPM_IGNORED_BUILDS).
# esbuild (dependencia de drizzle-kit) necesita su postinstall; sharp y unrs-resolver no.
allowBuilds:
  esbuild: true
  sharp: false
  unrs-resolver: false
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2023"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "react-jsx",
    "incremental": true,
    "esModuleInterop": true,
    "types": ["node"],
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.ts",
    "*.config.ts",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules", "blueprints", "reference", ".data", ".next/cache"]
}
```

`biome.json`:
```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "root": true,
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true,
    "includes": [
      "**",
      "!!**/blueprints",
      "!!**/reference",
      "!!**/.next",
      "!!**/.data",
      "!!**/drizzle",
      "!**/*.svg",
      "!tsconfig.json"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@react-pdf/renderer", "pdfjs-dist"],
  outputFileTracingExcludes: {
    "*": ["blueprints/**", "reference/**", ".data/**"],
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (isProduction) {
      security.push(
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      );
    }
    return [{ source: "/(.*)", headers: security }];
  },
};

export default withNextIntl(nextConfig);
```

`postcss.config.mjs`:
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

`vitest.config.ts`:
```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Alias "@/" -> src/ (igual que tsconfig.json "paths"). Vitest no hereda los paths de tsconfig.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Las pruebas nunca comparten base con desarrollo: siempre cotimporta_test (docker-compose.yml).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://cotimporta:cotimporta@localhost:54329/cotimporta_test";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
  },
  test: {
    // Sin passWithNoTests: un gate de un solo archivo debe fallar si el archivo no existe.
    exclude: [
      "**/node_modules/**",
      "blueprints/**",
      "reference/**",
      ".next/**",
      ".data/**",
      "tests/e2e/**",
    ],
    // Cargador de entorno de Vitest: valores locales y falsos, nunca secretos reales.
    env: {
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_SECRET: "test-only-secret-not-for-production-0000000000",
      BETTER_AUTH_URL: "http://localhost:3000",
      ADMIN_EMAILS: "admin@cotimporta.test",
      EMAIL_DRIVER: "log",
      EMAIL_FROM: "Cotimporta <no-reply@cotimporta.test>",
      EMAIL_OUTBOX_DIR: ".data/test-outbox",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: ".data/test-storage",
      AI_DRIVER: "fake",
      AI_TIMEOUT_MS: "2000",
      PAYMENT_PROVIDER: "fake",
      FAKE_PAYMENT_WEBHOOK_SECRET: "test-only-fake-webhook-secret",
      CRON_SECRET: "test-only-cron-secret",
      LOG_LEVEL: "error",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
```

`tests/setup/integration.ts`:
```ts
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { beforeAll } from "vitest";

// Aplica las migraciones de drizzle/ a la base de pruebas antes de cada archivo de integración.
// Antes del paso 2 no existe drizzle/meta/_journal.json y no hay nada que migrar.
// DATABASE_URL lo inyecta vitest.config.ts (test.env) y apunta a cotimporta_test.
// Después borra toda fila de reglas que no sea del seed demo (source_url 'seed://demo'; en
// default_local_charges, created_by nulo) y las corridas de importación: ningún archivo depende
// de filas que dejó otro archivo u otra corrida. Ver .claude/rules/testing.md.
beforeAll(async () => {
  if (!existsSync("drizzle/meta/_journal.json")) {
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está definido para las pruebas de integración");
  }
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    await sql`delete from tariff_rates where source_url <> 'seed://demo'`;
    await sql`delete from tariff_headings where source_url <> 'seed://demo'`;
    await sql`delete from tax_rates where source_url <> 'seed://demo'`;
    await sql`delete from trade_agreements where source_url <> 'seed://demo'`;
    await sql`delete from perception_rules where source_url <> 'seed://demo'`;
    await sql`delete from default_local_charges where created_by is not null`;
    await sql`delete from rule_import_runs`;
  } finally {
    await sql.end();
  }
});
```

`playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";
import { e2eBaseUrl, e2eDatabaseUrl, e2eOutboxDir, e2ePort, e2eStorageDir } from "./tests/e2e/env";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/blueprints/**", "**/reference/**"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && ./node_modules/.bin/next start --port ${e2ePort}`,
    url: `${e2eBaseUrl}/`,
    reuseExistingServer: false,
    timeout: 300_000,
    // Se suma a process.env y a .env (Next no sobrescribe variables ya definidas).
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      BETTER_AUTH_URL: e2eBaseUrl,
      EMAIL_DRIVER: "log",
      EMAIL_OUTBOX_DIR: e2eOutboxDir,
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: e2eStorageDir,
      AI_DRIVER: "fake",
      PAYMENT_PROVIDER: "fake",
    },
  },
});
```

`tests/e2e/env.ts`:
```ts
// Constantes compartidas por playwright.config.ts, global-setup.ts y helpers.ts.
export const e2ePort = 3100;
export const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
export const e2eDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://cotimporta:cotimporta@localhost:54329/cotimporta_test";
export const e2eOutboxDir = ".data/e2e-outbox";
export const e2eStorageDir = ".data/e2e-storage";
```

`tests/e2e/global-setup.ts`:
```ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { e2eDatabaseUrl } from "./env";

type SeedModule = { seed: (database: unknown) => Promise<void> };

// Migra y siembra la base de pruebas antes de levantar el servidor E2E.
// Antes del paso 2 no hay migraciones; antes del paso 6 no hay seed. Ambos casos se omiten.
// Vacía rate_limit_buckets (justo después de migrar, cuando la tabla ya existe) para que el
// límite de registro por IP (5/h, IP "local") no se arrastre de una corrida E2E a la siguiente.
export default async function globalSetup(): Promise<void> {
  if (!existsSync("drizzle/meta/_journal.json")) {
    return;
  }
  const sql = postgres(e2eDatabaseUrl, { max: 1 });
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: "drizzle" });
    await sql`delete from rate_limit_buckets`;
    const seedPath = resolve("src/db/seed.ts");
    if (existsSync(seedPath)) {
      const mod = (await import(pathToFileURL(seedPath).href)) as SeedModule;
      await mod.seed(db);
    }
  } finally {
    await sql.end();
  }
}
```

`tests/e2e/helpers.ts`:
```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { e2eDatabaseUrl, e2eOutboxDir } from "./env";

// Contrato con el paso 4: etiquetas y botones de /auth/sign-up y /auth/sign-in en español
// (locale por defecto). Contrato con el paso 3: el driver "log" escribe cada correo como JSON
// en EMAIL_OUTBOX_DIR con nombre "<epoch-ms>-<aleatorio>.json".

type OutboxMessage = { to: string; subject: string; text: string; createdAt: string };

export function uniqueEmail(prefix: string): string {
  const random = Math.floor(Math.random() * 1_000_000);
  return `${prefix}-${Date.now()}-${random}@cotimporta.test`;
}

export function latestEmailTo(to: string): OutboxMessage {
  if (!existsSync(e2eOutboxDir)) {
    throw new Error(`No existe el outbox ${e2eOutboxDir}`);
  }
  const files = readdirSync(e2eOutboxDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const messages = files
    .map((file) => JSON.parse(readFileSync(join(e2eOutboxDir, file), "utf8")) as OutboxMessage)
    .filter((message) => message.to === to);
  const last = messages.at(-1);
  if (!last) {
    throw new Error(`No hay correos para ${to} en ${e2eOutboxDir}`);
  }
  return last;
}

export function firstUrl(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) {
    throw new Error("El correo no contiene un enlace");
  }
  return match[0];
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/app");
}

export async function signUpAndVerify(
  page: Page,
  options: { email: string; password: string; name?: string; country?: string },
): Promise<void> {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Nombre").fill(options.name ?? "Prueba E2E");
  await page.getByLabel("Correo electrónico").fill(options.email);
  await page.getByLabel("Contraseña").fill(options.password);
  await page.getByLabel("País").selectOption(options.country ?? "PE");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Revisa tu correo")).toBeVisible();
  await page.goto(firstUrl(latestEmailTo(options.email).text));
  await page.goto("/app");
  if (page.url().includes("/auth/sign-in")) {
    await signIn(page, options.email, options.password);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
}

export async function grantActiveSubscription(email: string): Promise<void> {
  const sql = postgres(e2eDatabaseUrl, { max: 1 });
  try {
    await sql`
      insert into subscriptions
        (user_id, plan_code, provider, currency, status, current_period_start, current_period_end)
      select id, 'mensual', 'fake', 'USD', 'active', now(), now() + interval '1 month'
      from users where email = ${email}
      on conflict (user_id) do update set
        status = 'active',
        current_period_start = now(),
        current_period_end = now() + interval '1 month'
    `;
  } finally {
    await sql.end();
  }
}

export async function quoteDeletedAt(referenceCode: string): Promise<Date | null> {
  const sql = postgres(e2eDatabaseUrl, { max: 1 });
  try {
    const rows = await sql<{ deleted_at: Date | null }[]>`
      select deleted_at from quotes where reference_code = ${referenceCode}
    `;
    const row = rows[0];
    if (!row) {
      throw new Error(`No existe la cotización ${referenceCode}`);
    }
    return row.deleted_at;
  } finally {
    await sql.end();
  }
}
```

`drizzle.config.ts`:
```ts
import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit es una CLI independiente: Next.js no le carga .env. Este es su cargador.
// process.loadEnvFile no sobrescribe variables ya exportadas (CI exporta las suyas).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// Migraciones de producción usan la URL directa (sin pooler); local usa DATABASE_URL.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL no está definido (copia .env.example a .env)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  verbose: true,
});
```

`docker-compose.yml`:
```yaml
# Postgres local para desarrollo (cotimporta_dev) y pruebas (cotimporta_test).
# Etiqueta de imagen: ver blueprint §11 (UNVERIFIED — verificar antes de instalar).
services:
  db:
    image: postgres:17.6-alpine
    environment:
      POSTGRES_USER: cotimporta
      POSTGRES_PASSWORD: cotimporta
      POSTGRES_DB: cotimporta_dev
    ports:
      - "54329:5432"
    volumes:
      - cotimporta-pg:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U cotimporta -d cotimporta_dev && psql -U cotimporta -d cotimporta_test -c "select 1"
      interval: 2s
      timeout: 5s
      retries: 30
      start_period: 5s

volumes:
  cotimporta-pg:
```

`docker/postgres-init/01-test-db.sql`:
```sql
-- Se ejecuta una sola vez, al crear el volumen. Las pruebas nunca comparten base con desarrollo.
CREATE DATABASE cotimporta_test OWNER cotimporta;
```

`scripts/serve-check.sh`:
```bash
#!/usr/bin/env bash
# Arranca el build de producción (next start), pide una ruta y verifica el estado HTTP y,
# opcionalmente, que el cuerpo contenga un texto literal. Apaga el servidor al salir.
# Uso: bash scripts/serve-check.sh <ruta> <estado> [patrón-literal] [cookie]
# Ejemplo: bash scripts/serve-check.sh / 200 'class="dark"' 'theme=dark'
# Requiere un `pnpm build` previo. Sale 0 solo si estado y patrón coinciden.
set -euo pipefail

path="${1:?uso: serve-check.sh <ruta> <estado> [patrón] [cookie]}"
expected="${2:?falta el estado esperado}"
pattern="${3:-}"
cookie="${4:-}"
port="${SERVE_CHECK_PORT:-3200}"
base="http://127.0.0.1:${port}"

if [ ! -f .next/BUILD_ID ]; then
  echo "serve-check: no hay build de producción (.next/BUILD_ID); ejecuta pnpm build" >&2
  exit 2
fi

mkdir -p .data
log=".data/serve-check.log"
body=".data/serve-check.body"

# Grupo de procesos propio para poder apagar next start y sus hijos de una vez.
set -m
./node_modules/.bin/next start --port "$port" >"$log" 2>&1 &
server_pid=$!
set +m

cleanup() {
  kill -- "-${server_pid}" 2>/dev/null || kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${base}/" || true)"
  if [ "$code" != "000" ]; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "serve-check: el servidor no respondió en 90 s; ver ${log}" >&2
  exit 3
fi

if [ -n "$cookie" ]; then
  status="$(curl -s -o "$body" -w '%{http_code}' -H "Cookie: ${cookie}" "${base}${path}")"
else
  status="$(curl -s -o "$body" -w '%{http_code}' "${base}${path}")"
fi

if [ "$status" != "$expected" ]; then
  echo "serve-check: ${path} respondió ${status}, se esperaba ${expected}" >&2
  exit 1
fi

if [ -n "$pattern" ] && ! grep -qF -- "$pattern" "$body"; then
  echo "serve-check: el cuerpo de ${path} no contiene: ${pattern}" >&2
  exit 1
fi

echo "serve-check: OK ${path} ${status}"
```

`.gitignore`:
```gitignore
# Cotimporta — emitido por el blueprint (§10). Debe existir antes del primer commit del Bootstrap.
node_modules/
.next/
out/
coverage/
playwright-report/
test-results/
.data/
.vercel/
next-env.d.ts
*.tsbuildinfo
.DS_Store
.claude/settings.local.json

# Secretos: nunca en el repo. La plantilla .env.example sí se versiona.
.env
.env.*
!.env.example
```

`.env.example`:
```dotenv
# Cotimporta — plantilla de entorno. El Bootstrap la copia a .env si .env no existe.
# Valores locales o claramente falsos ("dev-only-..."). En producción (VERCEL_ENV=production)
# src/lib/env.ts rechaza cualquier valor "dev-only-..." y los drivers log/local/fake.
# Columna "Required by step" de cada variable: blueprint §10.

# --- Base de datos (docker-compose.yml) ---
DATABASE_URL=postgres://cotimporta:cotimporta@localhost:54329/cotimporta_dev
TEST_DATABASE_URL=postgres://cotimporta:cotimporta@localhost:54329/cotimporta_test
DATABASE_URL_UNPOOLED=

# --- Auth (better-auth) ---
BETTER_AUTH_SECRET=dev-only-insecure-secret-change-me-000000000000
BETTER_AUTH_URL=http://localhost:3000
ADMIN_EMAILS=

# --- Correo ---
EMAIL_DRIVER=log
EMAIL_FROM=Cotimporta <no-reply@localhost>
EMAIL_OUTBOX_DIR=.data/outbox

# --- Archivos ---
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=.data/storage

# --- IA (Gemini) ---
AI_DRIVER=fake
GEMINI_API_KEY=
GEMINI_MODEL=
AI_TIMEOUT_MS=30000

# --- Pagos ---
PAYMENT_PROVIDER=fake
FAKE_PAYMENT_WEBHOOK_SECRET=dev-only-fake-webhook-secret
IZIPAY_MODE=
IZIPAY_SHOP_ID=
IZIPAY_API_PASSWORD=
IZIPAY_HMAC_KEY=
IZIPAY_PUBLIC_KEY=
IZIPAY_API_BASE_URL=

# --- Reglas aduaneras ---
CRON_SECRET=dev-only-cron-secret
TARIFF_SOURCE_URL=

# --- Observabilidad ---
LOG_LEVEL=info
ERROR_REPORT_WEBHOOK_URL=
```

`.github/workflows/ci.yml`:
```yaml
# CI de Cotimporta — mismo gate que blueprint §20.1. Acciones: ver §11 (UNVERIFIED — verificar tags).
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17.6-alpine
        env:
          POSTGRES_USER: cotimporta
          POSTGRES_PASSWORD: cotimporta
          POSTGRES_DB: cotimporta_test
        ports:
          - 54329:5432
        options: >-
          --health-cmd "pg_isready -U cotimporta -d cotimporta_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20
    env:
      TEST_DATABASE_URL: postgres://cotimporta:cotimporta@localhost:54329/cotimporta_test
      DATABASE_URL: postgres://cotimporta:cotimporta@localhost:54329/cotimporta_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - run: corepack enable && corepack prepare pnpm@12.18.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: cp .env.example .env
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - run: pnpm db:migrate
      - run: bash scripts/serve-check.sh / 200 Cotimporta
      - run: bash scripts/serve-check.sh /api/health 200 '"ok":true'
      - run: pnpm test:e2e

  migrate:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: check
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - run: corepack enable && corepack prepare pnpm@12.18.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
        env:
          DATABASE_URL_UNPOOLED: ${{ secrets.DATABASE_URL_UNPOOLED }}
```

#### Matriz de convención de resolución

**La convención, dicha una vez:** el código de la app y de las pruebas importa módulos propios con el
alias **`@/<ruta>` sin extensión** (`@/server/quotes/service`). Excepción única: `src/db/schema.ts` y
`src/db/seed*.ts` (y lo que `src/db/seed.ts` importe) usan **rutas relativas con extensión `.ts`**
(`./schema.ts`) y solo paquetes, porque Node 24 los ejecuta sin bundler.

| Contexto | Comando que lo ejercita | Forma de la convención ahí | Config + ajuste literal que la hace funcionar |
|---|---|---|---|
| Código de la app | `pnpm build` / `pnpm dev` | `@/…` sin extensión; `src/db/*.ts` con `./x.ts` | `tsconfig.json` — `"paths": { "@/*": ["./src/*"] }`, `"moduleResolution": "bundler"`, `"allowImportingTsExtensions": true` (con `"noEmit": true`); Turbopack lee `paths` de tsconfig |
| Type check | `pnpm typecheck` | igual | `tsconfig.json` — los mismos ajustes; `verbatimModuleSyntax` y `erasableSyntaxOnly` hacen que lo que pasa `tsc` también lo acepte el strip-types de Node |
| Pruebas Vitest | `pnpm test …` | `@/…`; relativos `.ts` desde `src/db` | `vitest.config.ts` — `resolve.alias: [{ find: /^@\//, replacement: \`${srcDir}/\` }]`; Vite resuelve `./x.ts` literal |
| Pruebas Playwright | `pnpm test:e2e` | relativos sin extensión entre archivos de `tests/e2e/` (`./env`); `import()` dinámico de `src/db/seed.ts` por URL de archivo | transformador TypeScript propio de Playwright (resuelve `./env` → `env.ts`); `seed.ts` solo importa relativos `.ts` |
| Script independiente | `pnpm db:seed` (= `node --env-file-if-exists=.env src/db/seed.ts`) | solo paquetes + `./schema.ts`, `./seed-data.ts` | Node 24 (strip-types por defecto) resuelve el especificador literal; `package.json` `"type": "module"`; `tsconfig.json` `allowImportingTsExtensions` para que el mismo archivo pase `tsc` |
| drizzle-kit | `pnpm db:generate`, `pnpm db:migrate` | carga `drizzle.config.ts` y `./src/db/schema.ts` (sin imports internos) | `drizzle.config.ts` — `schema: "./src/db/schema.ts"`; el cargador propio de drizzle-kit transpila TS |
| Build / bundle | `pnpm build` | lo de "Código de la app" | Next.js (Turbopack) con `tsconfig.json`; `serverExternalPackages` evita empaquetar `@react-pdf/renderer` y `pdfjs-dist` |
| Biome (lint) | `pnpm lint` | no resuelve imports (solo ordena) | `biome.json` — `assist.actions.source.organizeImports: "on"` |

Ningún paquete mandado usa condiciones de exportación especiales (no se usa `server-only`), binarios
nativos obligatorios (`@napi-rs/canvas` no se instala) ni codegen previo. `pdfjs-dist` se importa por
su ruta `pdfjs-dist/legacy/build/pdf.mjs` en servidor y pruebas (ESM, sin worker en Node).

#### Reconciliación de valores entre artefactos

| Valor compartido | Fuente única | Valor literal | Otras apariciones | Comparado |
|---|---|---|---|---|
| Versión de Node | `.nvmrc` | `24.22.3` | Bootstrap `NODE_VERSION=24.22.3` · `package.json` `engines.node` `>=24.0.0 <25.0.0` (compatible) · CI `node-version-file: .nvmrc` · CLAUDE.md/AGENTS.md "Node 24.22.3" · §11 | sí |
| Versión de pnpm | `package.json` `packageManager` | `pnpm@12.18.0` | Bootstrap `corepack prepare pnpm@12.18.0` · CI `corepack prepare pnpm@12.18.0` · CLAUDE.md/AGENTS.md "pnpm 12.18.0" | sí |
| Puerto/host Postgres local | `docker-compose.yml` `ports` | `54329:5432` | `.env.example` `localhost:54329` (dos URLs) · `vitest.config.ts` · `tests/e2e/env.ts` · CI `ports` y `env` · §10 | sí |
| Usuario/clave/base dev | `docker-compose.yml` `environment` | `cotimporta` / `cotimporta` / `cotimporta_dev` | `.env.example` `DATABASE_URL` · §10 | sí |
| Base de pruebas | `docker/postgres-init/01-test-db.sql` | `cotimporta_test` | healthcheck del compose · `.env.example` `TEST_DATABASE_URL` · `vitest.config.ts` · `tests/e2e/env.ts` · CI `POSTGRES_DB` y `env` | sí |
| Imagen Postgres | `docker-compose.yml` | `postgres:17.6-alpine` | CI `services.postgres.image` · §11 | sí |
| Carpeta de migraciones | `drizzle.config.ts` `out` | `./drizzle` (= `drizzle/`) | `tests/setup/integration.ts` `migrationsFolder: "drizzle"` y `drizzle/meta/_journal.json` · `tests/e2e/global-setup.ts` ídem · `biome.json` `!!**/drizzle` · paso 2 Verify `drizzle/*.sql` · paso 18 health (journal) | sí |
| Esquema | `drizzle.config.ts` `schema` | `./src/db/schema.ts` | §3 · paso 2 · `tests/integration/db.test.ts` | sí |
| Archivo del seed | `package.json` `db:seed` | `src/db/seed.ts` | `tests/e2e/global-setup.ts` `resolve("src/db/seed.ts")` · paso 6 | sí |
| Puerto E2E | `tests/e2e/env.ts` `e2ePort` | `3100` | `playwright.config.ts` (importa la constante) | sí |
| Puerto serve-check | `scripts/serve-check.sh` `SERVE_CHECK_PORT` por defecto | `3200` | distinto del E2E a propósito (pueden coexistir) | sí |
| Outbox E2E | `tests/e2e/env.ts` `e2eOutboxDir` | `.data/e2e-outbox` | `playwright.config.ts` `EMAIL_OUTBOX_DIR` (constante) · `tests/e2e/helpers.ts` (constante) · paso 3 (driver `log` escribe en `EMAIL_OUTBOX_DIR`) | sí |
| Módulo de i18n | `next.config.ts` `createNextIntlPlugin("./src/i18n/request.ts")` | `src/i18n/request.ts` | §3 · paso 1 Do (lo crea) | sí |
| Alias | `tsconfig.json` `paths` | `@/*` → `./src/*` | `vitest.config.ts` `/^@\//` → `src/` · CLAUDE.md regla 2 | sí |
| Ruta del bundle | layout de The Architect | `blueprints/` (`blueprints/cotimporta/`) | `tsconfig.json` `exclude` · `biome.json` `!!**/blueprints` · `vitest.config.ts` `exclude` · `playwright.config.ts` `testIgnore` · `next.config.ts` `outputFileTracingExcludes` · `globals.css` `@source not "../../blueprints"` · Bootstrap `BUNDLE=blueprints/cotimporta` | sí |
| Plan sembrado | `src/db/seed-data.ts` (paso 6, §4) | `mensual` | `tests/e2e/helpers.ts` `grantActiveSubscription` · paso 17 `startCheckout` | sí |
| Etiquetas de acceso | paso 4 Do | "Nombre", "Correo electrónico", "Contraseña", "País", "Crear cuenta", "Ingresar", "Revisa tu correo", "Panel", "Salir" | `tests/e2e/helpers.ts` · paso 4 criterios | sí |
| Ruta del cron | `vercel.json` (paso 12) | `/api/cron/rules-import` | `src/app/api/cron/rules-import/route.ts` · §5 · paso 12 criterio 6 | sí |
| Health | `src/app/api/health/route.ts` (paso 18) | `/api/health`, cuerpo con `"ok":true` | paso 18 Verify · CI `serve-check /api/health 200 '"ok":true'` · §16 | sí |

Contratos y el paso más temprano en que se ejercitan: build ↔ servidor (`next start` sirve lo que
`pnpm build` dejó en `.next/`) → **paso 1** (`serve-check`); `drizzle.config.ts` ↔ `docker-compose.yml`
↔ `.env.example` → **paso 2** (`pnpm db:migrate` + test); `vitest.config.ts` ↔ base de pruebas →
**paso 2**; `playwright.config.ts` ↔ `helpers.ts` ↔ UI del paso 4 → **paso 4**; seed ↔ `global-setup.ts`
↔ `helpers.ts` (`mensual`) → **paso 9** (primer spec que lo usa; `pnpm db:seed` ya en el paso 6);
`vercel.json` ↔ ruta del cron → **paso 12**; health ↔ CI → **paso 18**.

#### Reconciliación de artefactos byte-exactos

| Artefacto byte-exacto | Autorizado por | Comparado por primera vez | Reglas del blueprint que lo restringen | Llamada de runtime que lo produce, sobre el pin de §11 | Ambos confirmados |
|---|---|---|---|---|---|
| Números golden BG-880 (enteros en `tests/unit/engine/golden.test.ts`) | paso 7 (literal en este blueprint) | paso 7 | §9 paso 7 reglas 1–10 (redondeo mitad hacia arriba por línea, IGV/IPM por línea, PEN al final, etapa 3 = FOB − etapa 1); `reference/cotizacion-bg880-ejemplo.pdf`: FOB 12,000.00 · logístico 1,417.20 · IGV compra 2,415.10 · gestión 1,500.00 · total 17,332.30 · etapas 3,600 / 8,400 / 3,832.30 / 1,500. Aritmética: CIF 1 294 000 × 1550/10000 = 200 570 exacto; × 250/10000 = 32 350; locales 25 000 → 3 875 + 625; 12 720 → 1 971,6 ⇒ 1 972 y 318; 10 000 → 1 550 + 250; Σ IGV 207 967 + Σ IPM 33 543 = 241 510 ✓; total 1 200 000 + 141 720 + 241 510 + 0 + 150 000 = 1 733 230 ✓; PEN 1 733 230 × 35 000/10 000 = 6 066 305 ✓. Tres diferencias de un céntimo frente a la referencia, todas intencionales: total S/ 60,663.04 (referencia) vs S/ 60,663.05 (plano); IGV compra S/ 8,452.84 vs S/ 8,452.85; etapa 5 S/ 13,413.04 vs S/ 13,413.05. Causa real: la referencia convirtió el IGV compra **sin redondear** (2,415.096 USD × 3.5 = 8,452.836 ⇒ 8,452.84; etapa 5: 3,832.296 × 3.5 = 13,413.036 ⇒ 13,413.04; total = suma de filas PEN ya redondeadas = 60,663.04). Este motor redondea a centavos enteros por línea y convierte a PEN una sola vez al final desde esos centavos (241 510 × 3,5 = 845 285; 383 230 × 3,5 = 1 341 305; 1 733 230 × 3,5 = 6 066 305). Ver `reference/datos-para-cotizar.md` punto 4 | ninguna: aritmética entera en JS (`Number` seguro < 2^53), independiente de la versión de Node | sí |
| Casos de `tests/unit/engine/rules.test.ts` (77640, 212604, 34291, 53442, 10000, 1818944, 468944, 256938) | paso 7 | paso 7 | mismas reglas: 1 294 000 × 600/10000 = 77 640; (1 294 000 + 77 640) × 0,155 = 212 604,2 ⇒ 212 604; × 0,025 = 34 291; percepción (1 294 000 + 200 570 + 32 350) × 0,035 = 53 442,2 ⇒ 53 442; 35 000 PEN × 10 000 / 35 000 = 10 000; 1 818 944 = 1 733 230 + 85 714; 468 944 = 383 230 + 85 714; 18 % × 1 427 434 = 256 938,12 ⇒ 256 938 | ninguna (aritmética entera) | sí |
| Textos buscados en el PDF (`17,332.30`, `60,663.05`, `INVESTMENTPROPOSAL`, `PROPUESTADEINVERSIÓN`, `Estimaciónreferencial`, `Cotimporta`) | paso 16 | paso 16 | `formatMinor` propio (aritmética entera, sin `Intl`) → `17,332.30` y `60,663.05`; títulos y aviso definidos literalmente en el paso 16 y en `ui.md` | `@react-pdf/renderer` 4.9.0 escribe el texto y `pdfjs-dist` 6.5.438 lo extrae; la comparación quita todo espacio (`/\s+/g`) para no depender de cómo se parten los ítems de texto. Helvetica estándar codifica `Ó`/`ó` en WinAnsi. **No ejecutado por el autor** → ver "literales sin verificar" en el informe de entrega | parcial — reglas sí; runtime pendiente de una ejecución (paso 16 la hace) |
| HTML de `/` (`class="dark"`, `lang="en"`, `lang="es"`, `Cotimporta`) | paso 1 | paso 1 | paso 1 Do: `className={theme}` con `theme ∈ {light, dark}`, `lang={locale}` | React 19.3.1 serializa `className` como `class="…"` y `lang` tal cual en el HTML del servidor; `serve-check.sh` busca subcadena literal | sí (atributos estándar de React DOM server) |

---

## 20. Gate de aceptación, riesgos y registro de decisiones (Acceptance Gate, Risks & Decision Log)

### 20.1 Gate global de aceptación

El proyecto está **terminado** cuando cada comando de abajo sale 0 sobre un checkout limpio (con
Bootstrap aplicado y `pnpm db:up`), y no antes. Es el mismo conjunto que corre CI.

```bash
pnpm install --frozen-lockfile                              # expect: exit 0
pnpm typecheck                                              # expect: exit 0, cero errores
pnpm lint                                                   # expect: exit 0
pnpm db:migrate                                             # expect: exit 0
pnpm test                                                   # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e                                               # expect: exit 0, 0 failed
pnpm build                                                  # expect: exit 0
bash scripts/serve-check.sh / 200 'Cotimporta'              # expect: exit 0 — ejecuta el build
bash scripts/serve-check.sh /api/health 200 '"ok":true'     # expect: exit 0 — base y migraciones al día
```

Cada expectativa es una propiedad, no un conteo. Cada línea sale 0 en un build correcto y falla por
la razón que declara. Las verificaciones de accesibilidad automáticas son `pnpm lint` (reglas a11y)
y `tests/e2e/auth-shell.spec.ts`, ya incluidas.

Checklist manual de lanzamiento (una vez, antes de lanzar):

- [ ] Cada paso de §9 tiene su tag: `git tag -l 'step-*'` lista `step-01-scaffold` … `step-18-account-health`.
      El repositorio lo garantiza §10 Bootstrap (paso 6), no un scaffolder.
- [ ] Cada archivo de §10 *Archivos que deben versionarse* está en un checkout limpio, **un archivo por
      invocación**: `git ls-files --error-unmatch .env.example` (y lo mismo para `.gitignore`,
      `pnpm-lock.yaml`, `biome.json`, `vitest.config.ts`, `playwright.config.ts`, `docker-compose.yml`,
      `scripts/serve-check.sh`, `.claude/settings.json`, `.github/workflows/ci.yml`, `vercel.json`,
      `docs/verified/izipay.md`) sale 0; y por cada uno
      `status=0; git check-ignore -q .env.example || status=$?; test "$status" -eq 1` sale 0
      (1 = no ignorado · 128 = uso incorrecto, y entonces falla).
- [ ] El ignore file estuvo antes del primer commit del Bootstrap:
      `test "$(git log --diff-filter=A --format=%H -- .gitignore | tail -n 1)" = "$(git log --format=%H --grep='chore: bootstrap Cotimporta workspace' | tail -n 1)"`
      sale 0 (este repo ya tenía commits previos sin `.gitignore`; el commit que lo agrega es el del Bootstrap, anterior a todo paso).
- [ ] Toda fila de §19.6 *Reconciliación byte-exacta* dice "sí"; la fila "parcial" quedó confirmada
      porque `pnpm test tests/integration/quote-pdf.test.ts` pasó en el pin de §11.
- [ ] §10 Bootstrap se ejecutó **dos veces seguidas** sobre el árbol ya preparado y la segunda **salió 0**;
      después, `pnpm install --frozen-lockfile` y `pnpm build` siguen saliendo 0 (el manifiesto no se revirtió).
- [ ] Toda fila de §19.6 *Reconciliación de valores* dice `Comparado: sí`, y lint/typecheck/tests se
      corrieron desde la raíz **con el bundle presente** en `blueprints/cotimporta/`.
- [ ] §9.1 no aplica (greenfield).
- [ ] Ningún No-Objetivo de §1 fue construido.
- [ ] Toda variable de §10 está en Vercel/GitHub para producción y ausente del repo; `VERCEL_ENV=production`
      no arranca con drivers `log`/`local`/`fake` (guardia de `getEnv()`).
- [ ] **Drivers de producción**: `StorageProvider` (bucket privado; URLs firmadas si el proveedor las
      ofrece) y `EmailProvider` implementados para los proveedores elegidos, con versión fijada tras
      `stack-researcher`, y probados en preview.
- [ ] `docs/verified/izipay.md` tiene `status: verified`; un pago real en modo prueba de Izipay
      (PEN y, si `usd_supported: yes`, USD) llega al webhook, activa la suscripción y la repetición del
      mismo IPN no cambia nada. Si `recurring_supported: no`, la renovación manual mensual está explicada en `/app/billing`.
- [ ] `docs/verified/gemini-model.md` tiene `status: verified`; con `AI_DRIVER=gemini` en preview, la
      ficha de `reference/cotizacion-bg880-ejemplo.pdf` se extrae y se sugiere una partida existente.
- [ ] Las tasas reales (IGV, IPM, percepción, UIT, tasa de despacho, aranceles, acuerdos) están
      publicadas con `source_url` oficial y `verification_status='verified'`; ninguna fila `seed://demo` queda vigente en producción.
- [ ] Los flujos E2E de §13 pasan contra la URL de producción.
- [ ] Recorrido solo con teclado y una pasada con lector de pantalla del asistente; zoom 200 % a 375 px (§15).
- [ ] Un error provocado a propósito llega al destino de `ERROR_REPORT_WEBHOOK_URL` (§16).
- [ ] Un rollback en preview, a propósito; una restauración PITR de Neon a una rama, a propósito (§12).
- [ ] Inter autoalojada (woff2, OFL) en `public/fonts/` con `font-display: swap` (§7).
- [ ] Logo del dueño en `public/brand/logo.svg` y `public/brand/logo.png`.
- [ ] Política de privacidad y términos redactados por un abogado (Ley 29733) y enlazados en el registro; banco de datos inscrito por el dueño.
- [ ] Revisión humana de la redacción ES/EN de la UI, el PDF y la narrativa.

**No se ignoran advertencias.**

### 20.2 Registro de riesgos

| Riesgo | Prob. | Impacto | Señal temprana | Mitigación (dueño) |
|---|---|---|---|---|
| Cifras equivocadas generan exposición financiera/legal | M | A | usuario reporta diferencia con su agente | aviso "referencial" + snapshot de reglas + pruebas golden/propiedad + compuerta de publicación del admin (pasos 7, 8, 12, 16) — dueño |
| La IA sugiere una partida equivocada | A | M | partidas confirmadas distintas de las sugeridas | candidatos validados contra la tabla, confirmación del usuario, razón visible, el motor nunca lee números de la IA (paso 15) — builder |
| La fuente oficial cambia de formato o no está disponible | M | M | corrida `failed` | staging + diff + CSV manual + alerta (pasos 11, 12) — dueño |
| Izipay no soporta recurrencia o USD | M | M | `docs/verified/izipay.md` lo indica | interfaz `PaymentProvider`; renovación manual aceptada; pasarela alternativa evaluada con `stack-researcher` (pasos 11, 17) — dueño |
| Extracción del PDF falla (escaneados, maquetación rara) | A | B | `extraction_status='failed'` > 20 % | revisión siempre, original guardado, camino manual (paso 14) — builder |
| Pérdida de datos / privacidad (Ley 29733) | B | A | — | PITR de Neon, exportar/borrar (paso 18), secretos mínimos, archivos privados — dueño |
| Abuso de la cotización gratis (muchas cuentas) | M | B | registros por IP/día anómalos | email verificado + 5 registros/h por IP + cuota; riesgo residual aceptado (pasos 3, 5) — dueño |
| TypeScript 7.0.2 incompatible con next 16.4.6 o con la toolchain | M | M | el smoke test del Bootstrap/paso 1 falla en `typecheck`/`build` | decisión 6 de §20.3: volver al respaldo del track `typescript@6.0.3` en `package.json` emitido antes de entregar el plano — main thread |
| Pins de respaldo del track (Biome 2.5.15, @types/react 19.3.0) y `@types/node ^24` sin verificar hoy | M | B | `pnpm install` falla o Biome reporta claves de config desconocidas | `stack-researcher` los confirma; el smoke test lo ejecuta — main thread |
| Imagen `postgres:17.6-alpine` o tags de GitHub Actions inexistentes | B | M | `pnpm db:up` falla en el pull | verificar en Docker Hub/GitHub antes de entregar; cambiar a la última 17.x existente — main thread |
| Vercel con Node 24 / región `gru1` / Neon São Paulo no como se asume | B | M | el primer deploy elige otra versión/región | confirmar en la configuración del proyecto antes del lanzamiento — dueño |
| Storage y correo de producción sin implementar al lanzar | A | A | la guardia de `getEnv()` impide arrancar producción | ítem bloqueante del checklist §20.1 — dueño + builder |

### 20.3 Registro de decisiones

| # | Decisión | Alternativa rechazada | Por qué | Se revierte si |
|---|---|---|---|---|
| 1 | Track TypeScript/Node con Next.js | Rails/Laravel | un lenguaje para UI, motor puro y PDF; Vercel | el equipo cambia a un stack server-rendered |
| 2 | Postgres (Neon + Docker local) con Drizzle | Supabase + Prisma | sin auth/storage de plataforma que no usamos; SQL explícito para bloqueos de cuota | se necesita row-level security gestionada |
| 3 | better-auth | Auth.js (v5 beta), Clerk | usuarios en nuestra base (Ley 29733), sin costo por MAU | se exige SSO empresarial |
| 4 | Vercel `gru1` + cron | contenedor en Railway | previews, rollback, cron sin worker | el cron necesita > tiempo máximo de función |
| 5 | Tailwind 4 + HTML nativo, sin shadcn CLI | shadcn CLI 4.23.0 + Radix | sin dependencias sin fijar ni CLI interactiva | se requieren componentes complejos (combobox, datepicker) — adoptar shadcn con versiones fijadas |
| 6 | TypeScript 7.0.2 | 6.0.3 (respaldo del track) | `latest` verificado y más rápido; el track reporta `next build` 16.4.2 + TS 7.0.2 en verde | el smoke test falla con next 16.4.6 → cambiar `"typescript": "6.0.3"` en `workspace/package.json` antes de entregar; si aun así ocurre durante el build, solo el paso 1 aplica el respaldo documentado (`pnpm add -D -E typescript@6.0.3`, criterio y mensaje de commit observables en el paso 1); ningún otro paso cambia la versión |
| 7 | Node 24.22.3 | Node 26.13.1 LTS | soporte de Vercel para 26 no verificado | Vercel confirma 26 y una dependencia lo exige |
| 8 | Sin estado global ni librería de caché de cliente | TanStack Query | páginas de servidor + server actions bastan | aparece edición colaborativa o vistas en vivo |
| 9 | Manifiesto emitido en `workspace/` (sin scaffolder) | `pnpm create next-app` | el directorio no está vacío y el scaffolder lo rechaza; un solo autor del manifiesto | se parte de un repo vacío |
| 10 | Motor en enteros (centavos, bps, PEN×10 000) con redondeo mitad hacia arriba por línea | decimales / `Number` con 2 decimales | determinismo y reproducibilidad del snapshot | la SUNAT publica una regla de redondeo distinta → se ajusta `roundDiv` y las pruebas golden |
| 11 | Escenarios de precio como margen sobre costo (`costo × (1 + m)`) | margen sobre precio (`costo / (1 − m)`) | coincide con la lectura más simple del Excel; se rotula en UI | el dueño confirma que su Excel usa margen sobre precio |
| 12 | Una cotización consume cuota al crearse | al calcular / al descargar PDF | simple y resistente al abuso (la IA cuesta desde el inicio) | los usuarios se quejan de perder cuota por borradores |
| 13 | `PaymentProvider` con checkout alojado (redirect) | formulario embebido de Izipay | PCI mínimo; CSP sin scripts de terceros | Izipay solo ofrece formulario embebido para el modo elegido |
| 14 | Logo web SVG + logo PDF PNG | un solo SVG para ambos | `@react-pdf/renderer` no dibuja archivos SVG con `Image` | se adopta un renderizador que sí lo haga |

### 20.4 Qué construir después

1. **Módulo de agencia propia** (contactar agentes en China, cotizar servicios locales con proveedor por línea) — tras 3 meses de cotizaciones reales; el esquema ya guarda `concept_code` + `provider_name`.
2. **Equipos / cuentas compartidas** — cuando un cliente pague por 2+ asientos.
3. **Exportar a Excel** — cuando clientes B2B lo pidan.
4. **Seguimiento de embarques** — cuando la retención mensual lo pida.
5. **Créditos / pago por uso** — si el costo de IA por cotización supera el margen del plan.

---

*Fin del blueprint. El orden de construcción es §9. Detenerse cuando §20.1 esté en verde.*
