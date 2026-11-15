# Epic 01: Fundación

> Al terminar existe una app Next.js ejecutable con tokens y ES/EN, Postgres con el esquema completo, cuentas con email verificado, un shell protegido, una guardia de propiedad con cuotas probada y las tablas de reglas con su seed demo.

| | |
|---|---|
| **Epic id** | `01-fundacion` |
| **Tasks** | `E1-T1` … `E1-T6` (pasos 1–6 de `blueprint.md` §9) |
| **Depends on** | nada — se empieza aquí (después del Bootstrap de `blueprint.md` §10) |
| **Unlocks** | `02-motor-y-cotizador`, `03-ia-pdf-cobros` |
| **Parallel with** | `E2-T1` (motor) y `E2-T5` (compuerta) dependen solo de `E1-T1` y no comparten archivos con este epic |

No necesitas ningún otro archivo para completar este epic, salvo el bloque de código del esquema que
se indica en `E1-T2`. Todo lo demás se repite aquí a propósito.

---

## Stack

Next.js 16 (App Router) · TypeScript 7 · Tailwind CSS 4 · next-intl · Postgres 17 (Docker local) ·
Drizzle ORM · better-auth · Vercel. Gestor: `pnpm` 12.18.0 (`packageManager`). Runtime fijado en
`.nvmrc` (Node 24.22.3). Versiones de dependencias: `pnpm-lock.yaml` — léelo, nunca adivines.
Cada shell: `export PATH="$HOME/.local/bin:$PATH"` (Node 24 y pnpm los instala el Bootstrap ahí).

| Tarea | Comando |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test tests/integration/x.test.ts` |
| E2E (un spec) | `pnpm test:e2e tests/e2e/x.spec.ts` |
| Build + servidor | `pnpm build` · `bash scripts/serve-check.sh <ruta> <estado> [patrón] [cookie]` |
| Migraciones | `pnpm db:generate` · `pnpm db:migrate` · seed `pnpm db:seed` |
| Servicios locales | `pnpm db:up` / `pnpm db:down` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

Las tareas que tocan base de datos arrancan Postgres con `pnpm db:up`. `docker-compose.yml`,
`vitest.config.ts`, `playwright.config.ts`, `drizzle.config.ts`, `tests/setup/integration.ts`,
`tests/e2e/{env,helpers,global-setup}.ts` y `scripts/serve-check.sh` llegaron desde `workspace/` en el
Bootstrap y ya están en la raíz — no los escribes y nunca sustituyes un servicio por un falso.

## Subárbol de directorios

```
src/
  app/
    layout.tsx                         # NUEVO E1-T1 — html lang + clase de tema, next-intl, cabecera con logo/wordmark
    page.tsx                           # NUEVO E1-T1 — landing
    globals.css                        # NUEVO E1-T1 — tokens @theme + utilidades btn/input/card/table-base/badge
    api/auth/[...all]/route.ts         # NUEVO E1-T3 — better-auth + límites
    (auth)/auth/[mode]/page.tsx        # NUEVO E1-T4 — sign-in | sign-up | forgot | reset | check-email
    (app)/app/layout.tsx               # NUEVO E1-T4 — shell protegido
    (app)/app/page.tsx                 # NUEVO E1-T4 — "Panel"
  components/auth/auth-form.tsx        # NUEVO E1-T4 (cliente)
  db/
    schema.ts                          # NUEVO E1-T2 — todas las tablas
    client.ts                          # NUEVO E1-T2
    seed.ts                            # NUEVO E1-T6 — `pnpm db:seed`
    seed-data.ts                       # NUEVO E1-T6
  i18n/request.ts · i18n/messages.ts   # NUEVO E1-T1
  lib/env.ts                           # NUEVO E1-T2
  lib/auth.ts                          # NUEVO E1-T3
  server/
    email.ts · rate-limit.ts           # NUEVO E1-T3
    authz.ts · errors.ts               # NUEVO E1-T5
    billing/entitlements.ts            # NUEVO E1-T5
    quotes/service.ts                  # NUEVO E1-T5
    rules/repository.ts                # NUEVO E1-T6
drizzle/                               # NUEVO E1-T2 — migración que emite `pnpm db:generate` (nombre de drizzle-kit)
tests/
  integration/{db,auth,guard,rules}.test.ts   # E1-T2, T3, T5, T6
  e2e/auth-shell.spec.ts               # E1-T4
  e2e/helpers.ts                       # existe (workspace), solo lectura — contrato de etiquetas de E1-T4
```

Fuera de este subárbol no se toca nada. Si una tarea parece requerirlo, detente y reporta.

## Modelo de datos tocado aquí

| Entidad | Campos que este epic agrega o lee | Notas |
|---|---|---|
| todas (§4 de `blueprint.md`) | creadas en `E1-T2` | ningún paso posterior cambia el esquema |
| `users`, `sessions`, `accounts`, `verifications` | modelo better-auth (`usePlural`), `users.role` user/admin | `email_verified` |
| `profiles` | `locale`, `country`, `currency` (PE → PEN, otro → USD) | creada en el registro (E1-T4) |
| `rate_limit_buckets` | `key`, `window_start`, `count` | ventana fija (E1-T3) |
| `quotes`, `quote_supplier_terms`, `reference_counters`, `usage_counters`, `audit_events` | creación, código `COT-AAAA-NNNN`, cuota | E1-T5 |
| `subscriptions`, `plans` | lectura para cuotas | E1-T5 |
| `tax_rates`, `tariff_headings`, `tariff_rates`, `trade_agreements`, `perception_rules`, `default_local_charges`, `plans` | seed demo + resolución por vigencia | E1-T6 |

Convenciones: dinero `bigint` en centavos; tasas `integer` bps; TC `integer` PEN×10 000; vigencias
`date` (`effective_from` inclusivo, `effective_to` exclusivo, nulo = vigente).

## Contratos

**Consumidos** — ya existen, no se reconstruyen:

| De | Interfaz | Garantía |
|---|---|---|
| Bootstrap | `package.json` scripts, configs, `pnpm-lock.yaml`, `.env` | instalados; `.env` con valores locales |
| Bootstrap | `tests/e2e/helpers.ts` | `signUpAndVerify`, `signIn`, `uniqueEmail`, `latestEmailTo`, `grantActiveSubscription`, `quoteDeletedAt` |
| Bootstrap | `scripts/serve-check.sh <ruta> <estado> [patrón] [cookie]` | sale 0 solo si estado y patrón coinciden |

**Producidos** — los siguientes epics dependen de estas firmas exactas:

| Export | Firma | Usado por |
|---|---|---|
| `src/i18n/messages.ts` → `Copy`, `Locale`, `messages` | `type Copy<T> = Record<"es" \| "en", T>` | todos |
| `src/lib/env.ts` → `getEnv`, `requireEnv`, `parseEnv` | `requireEnv(key: string): string` | todos |
| `src/db/client.ts` → `db`, `Db` | `drizzle(postgres(...), { schema })` | todos |
| `src/lib/auth.ts` → `auth`, `getSessionUser`, `requireUser`, `requireActor` | `requireActor(headers?) → Promise<Actor>` | E2, E3 |
| `src/server/email.ts` → `getEmailProvider`, `readOutbox`, `clearOutbox` | `EmailProvider.send(message)` | E3-T1 (`tests/helpers/session.ts`) |
| `src/server/rate-limit.ts` → `hit`, `clientIp` | `hit(key, limit, windowSeconds)` | E2, E3 |
| `src/server/errors.ts` → `AppError`, `toResult`, `toJsonResponse`, `logger`, `reportError` | códigos `VALIDATION`…`INTERNAL` | todos |
| `src/server/authz.ts` → `Actor`, `ownedQuoteOrThrow`, `requireAdmin` | ajeno = `NOT_FOUND` | todos |
| `src/server/billing/entitlements.ts` → `getEntitlement`, `consumeQuote` | `getEntitlement(tx, userId, now)` | E3-T5 |
| `src/server/quotes/service.ts` → `createQuote`, `getQuote`, `listQuotes`, `renameQuote`, `softDeleteQuote` | `(actor, …)` | E2 |
| `src/server/rules/repository.ts` → `resolveRules`, `searchHeadings`, `currentLocalCharges`, `listPerceptionConditions` | ver E1-T6 | E2 |
| `src/db/seed.ts` → `seed` | `seed(db): Promise<void>` idempotente | E2, E3 tests; `tests/e2e/global-setup.ts` |

## Convenciones que muerden en esta área

- Imports con alias `@/…` sin extensión, **excepto** `src/db/schema.ts` y `src/db/seed*.ts`: solo paquetes y relativos con `.ts` (`./schema.ts`), porque `pnpm db:seed` los ejecuta Node 24 sin bundler. Sin `enum` de TS (`erasableSyntaxOnly`), `import type` para tipos.
- `process.env` solo en `src/lib/env.ts` (y `src/db/seed.ts`). El esquema de env exige solo `DATABASE_URL`; cada módulo exige lo suyo con `requireEnv` al usarse — así ningún paso rompe un gate anterior.
- Recurso ajeno o inexistente = `NOT_FOUND` (404), nunca 403.
- Textos de UI en `copy: Copy<T>` junto al componente; tokens solo en `globals.css`.
- Nunca editar a mano una migración de `drizzle/`.

Reglas completas: `CLAUDE.md`. Reglas por área: `.claude/rules/database.md`, `server.md`, `ui.md`, `testing.md`.

---

## Tasks

En el mismo orden que `tasks.json`. Ese orden es el de construcción.

### `E1-T1` — Scaffold ejecutable: landing con tokens, tema y locale

**Depends on:** nada · **Priority:** p0 — metadato para recortes de alcance, no orden de ejecución

Crea el primer código y **ejecútalo** con `serve-check`. `globals.css`: `@import "tailwindcss";`,
`@source not "../../blueprints";`, `@source not "../../reference";`,
`@custom-variant dark (&:where(.dark, .dark *));`, variables en `:root` y `.dark` (claro/oscuro):
`--primary` #2563EB/#60A5FA, `--primary-fg` #FFFFFF/#0B1220, `--background` #FFFFFF/#0B1220,
`--surface` #F8FAFC/#111A2E, `--border` #E2E8F0/#1F2A44, `--border-strong` #64748B/#64748B,
`--fg` #0F172A/#E5E7EB, `--fg-muted` #64748B/#94A3B8, `--destructive` #B91C1C/#F87171,
`--success` #15803D/#4ADE80, `--warning` #B45309/#FBBF24; `@theme inline` las mapea a
`--color-*`, `--font-sans: Inter, ui-sans-serif, system-ui, sans-serif`, `--radius-md: 8px`;
utilidades `@utility btn | btn-primary | btn-ghost | input | card | table-base | badge` (controles con
borde `--border-strong`, foco `outline: 2px solid var(--color-primary); outline-offset: 2px`);
`prefers-reduced-motion` a 0 ms. `messages.ts`: `Locale`, `locales`, `defaultLocale = "es"`,
`Copy<T>`, `isLocale()`, `messages` con `common.appName = "Cotimporta"`. `request.ts`
(`getRequestConfig`): cookie `NEXT_LOCALE` válida → esa; si no, `en` si `Accept-Language` empieza con
`en`; si no, `es`. `layout.tsx`: tema = cookie `theme` (`dark` o `light`), `<html lang={locale}
className={theme}>`, `NextIntlClientProvider`, cabecera con `<img src="/brand/logo.svg"
alt="Cotimporta">` si existe `public/brand/logo.svg` y, si no, el wordmark "Cotimporta"; enlace
"Saltar al contenido" a `<main id="contenido">`. `page.tsx`: `h1` "Cotiza tu importación puesta en
Perú" / "Quote your import landed in Peru", tres bloques, enlaces a `/auth/sign-up` y `/auth/sign-in`.
No uses `next/font/google` (el build no debe depender de la red). Respaldo documentado de TypeScript
(único caso en que un paso toca el manifiesto): si `pnpm typecheck` o `pnpm build` fallan con un error
que emite TypeScript 7 o la integración de tipos de Next.js antes de reportar cualquier error en un
archivo de `src/`, y solo entonces, ejecuta `pnpm add -D -E typescript@6.0.3`, repite el Verify
completo y escribe el commit como `E1-T1: scaffold ejecutable (typescript 6.0.3 fallback)`. Cualquier
otro error de tipos se corrige en el código.

**Files**
- `src/app/globals.css` — nuevo
- `src/i18n/messages.ts` — nuevo
- `src/i18n/request.ts` — nuevo (lo referencia `next.config.ts`)
- `src/app/layout.tsx` — nuevo
- `src/app/page.tsx` — nuevo

**Acceptance**

Copiado del arreglo `acceptance` de esta tarea en `tasks.json` — idéntico tras quitar el énfasis.

1. **WHEN** se ejecuta `pnpm build` sobre el árbol recién preparado por el Bootstrap **THE SYSTEM SHALL** terminar con código 0.
2. **WHEN** `bash scripts/serve-check.sh / 200 Cotimporta` arranca el build de producción **THE SYSTEM SHALL** responder 200 en `/` con un cuerpo que contiene `Cotimporta`.
3. **WHEN** se pide `/` con la cookie `theme=dark` **THE SYSTEM SHALL** devolver HTML de servidor cuyo elemento `<html>` ya trae `class="dark"`.
4. **WHEN** se pide `/` con la cookie `NEXT_LOCALE=en` **THE SYSTEM SHALL** devolver HTML con `lang="en"`, y sin cookie ni `Accept-Language` en inglés SHALL devolver `lang="es"`.
5. **WHEN** se ejecutan `pnpm typecheck`, `pnpm lint` y `pnpm test --passWithNoTests` **THE SYSTEM SHALL** terminar con código 0 en los tres.

**Verify** — todos, en orden, desde la raíz del proyecto.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test --passWithNoTests
pnpm build
bash scripts/serve-check.sh / 200 'Cotimporta'
bash scripts/serve-check.sh / 200 'class="dark"' 'theme=dark'
bash scripts/serve-check.sh / 200 'lang="en"' 'NEXT_LOCALE=en'
bash scripts/serve-check.sh / 200 'lang="es"'
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: scaffold ejecutable"
git tag step-01-scaffold
```

### `E1-T2` — Base de datos: esquema, migración inicial y entorno

**Depends on:** `E1-T1` · **Priority:** p0

`src/db/schema.ts`: copia **literalmente** el bloque de código `src/db/schema.ts` de
`blueprints/cotimporta/blueprint.md` §4 *Esquema* (todas las tablas; solo importa `drizzle-orm`).
`src/lib/env.ts`: Zod con todas las variables (`DATABASE_URL` obligatoria; el resto opcional:
`TEST_DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `VERCEL_ENV`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`ADMIN_EMAILS`, `EMAIL_DRIVER` (`log`), `EMAIL_FROM`, `EMAIL_OUTBOX_DIR`, `LOG_LEVEL`,
`ERROR_REPORT_WEBHOOK_URL`, `CRON_SECRET`, `TARIFF_SOURCE_URL`, `STORAGE_DRIVER` (`local`),
`STORAGE_LOCAL_DIR`, `AI_DRIVER` (`fake|gemini`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_TIMEOUT_MS`,
`PAYMENT_PROVIDER` (`fake|izipay`), `FAKE_PAYMENT_WEBHOOK_SECRET`, `IZIPAY_MODE`, `IZIPAY_SHOP_ID`,
`IZIPAY_API_PASSWORD`, `IZIPAY_HMAC_KEY`, `IZIPAY_PUBLIC_KEY`, `IZIPAY_API_BASE_URL`); exporta
`parseEnv(source)` (pura; error que nombra cada clave inválida o faltante), `getEnv()` memoizada,
`requireEnv(key)` (`"Falta la variable de entorno <KEY>"`); con `VERCEL_ENV === "production"` rechaza
valores `dev-only-…` y drivers `log`/`local`/`fake`. `src/db/client.ts`: cliente `postgres` perezoso
(`max: 5`, `prepare: false`), `db = drizzle(client, { schema })`. Corre `pnpm db:generate` y luego
`pnpm db:migrate`. Test: para cada `PgTable` exportada (`is(value, PgTable)`, `getTableName`) afirma
`to_regclass('public.<name>') is not null` en la base de pruebas, y que `parseEnv({})` lanza con `DATABASE_URL` en el mensaje.

**Files**
- `src/db/schema.ts` — nuevo
- `src/db/client.ts` — nuevo
- `src/lib/env.ts` — nuevo
- `drizzle/**` — la migración que emite `pnpm db:generate` (no se edita a mano)
- `tests/integration/db.test.ts` — nuevo

**Acceptance**

1. **WHEN** se ejecuta `pnpm db:migrate` contra la base local vacía **THE SYSTEM SHALL** terminar con código 0.
2. **WHEN** se ejecuta `pnpm test tests/integration/db.test.ts` **THE SYSTEM SHALL** encontrar en la base de pruebas, vía `to_regclass`, cada tabla exportada por `src/db/schema.ts` y terminar con código 0.
3. **WHEN** `pnpm db:generate` se ejecuta otra vez sin cambios de esquema **THE SYSTEM SHALL** no crear ningún archivo nuevo en `drizzle/`.
4. **WHEN** `parseEnv` recibe un entorno sin `DATABASE_URL` **THE SYSTEM SHALL** lanzar un error cuyo mensaje nombra `DATABASE_URL`.

**Verify**

```bash
pnpm db:up
pnpm db:migrate
pnpm test tests/integration/db.test.ts
n=$(ls drizzle/*.sql | wc -l); pnpm db:generate; test "$(ls drizzle/*.sql | wc -l)" -eq "$n"
pnpm typecheck
pnpm lint
pnpm build
bash scripts/serve-check.sh / 200 'Cotimporta'
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: base de datos"
git tag step-02-database
```

### `E1-T3` — Auth servidor: email verificado, roles y límites

**Depends on:** `E1-T2` · **Priority:** p0

`email.ts`: `EmailProvider { send({ to, subject, text, html }) }`, driver `log` (outbox en memoria con
`readOutbox()`/`clearOutbox()`; si hay `EMAIL_OUTBOX_DIR`, escribe `<dir>/<Date.now()>-<aleatorio>.json`
con `{ to, subject, text, html, createdAt }` — contrato de `tests/e2e/helpers.ts`). `rate-limit.ts`:
`hit(key, limit, windowSeconds)` con un único `insert … on conflict (key) do update` atómico (ventana
fija) → `{ allowed, remaining, retryAfterSeconds }`; `clientIp(headers)`. `auth.ts`: `betterAuth` con
`drizzleAdapter(db, { provider: "pg", usePlural: true, schema })`, `secret`/`baseURL` por `requireEnv`,
`emailAndPassword` (verificación obligatoria, `minPasswordLength: 10`, reset por correo, revoca sesiones
al resetear), `emailVerification` (`sendOnSignUp`, `autoSignInAfterVerification`, expira 24 h),
`user.additionalFields.role` (`"user"` por defecto, `input: false`), hook `user.create.before` que asigna
`admin` si el email está en `ADMIN_EMAILS`, sesión 7 días / renovación 24 h, `rateLimit.enabled: false`
(usamos el nuestro), `plugins: [nextCookies()]`; exporta `auth`, `getSessionUser`, `requireUser`
(redirige a `/auth/sign-in`), `requireActor` (`UNAUTHENTICATED`). Confirma nombres de opciones contra
los tipos instalados; el comportamiento exigido es el de los criterios. Route: `toNextJsHandler(auth)`
con `POST` envuelto por límites `auth:<ip>:sign-in` 10/60 s, `auth:<ip>:sign-up` 5/3600 s, `auth:<ip>:other` 30/60 s → 429 con `Retry-After`.
Test: usa `auth.api.*` y el outbox en memoria; emails `crypto.randomUUID()`; el caso admin usa
`admin@cotimporta.test` (valor de `ADMIN_EMAILS` en `vitest.config.ts`) y borra antes esa fila si existe.

**Files**
- `src/server/email.ts` — nuevo
- `src/server/rate-limit.ts` — nuevo
- `src/lib/auth.ts` — nuevo
- `src/app/api/auth/[...all]/route.ts` — nuevo
- `tests/integration/auth.test.ts` — nuevo

**Acceptance**

1. **WHEN** una cuenta nueva se registra con email y contraseña **THE SYSTEM SHALL** guardar el usuario con `email_verified=false` y escribir exactamente un correo de verificación en el outbox.
2. **WHEN** esa cuenta sin verificar intenta ingresar **THE SYSTEM SHALL** rechazar el ingreso y no crear ninguna fila en `sessions`.
3. **WHEN** se sigue el enlace de verificación del outbox **THE SYSTEM SHALL** marcar `email_verified=true` y el siguiente ingreso SHALL tener éxito.
4. **WHEN** una cuenta se registra con un email listado en `ADMIN_EMAILS` **THE SYSTEM SHALL** guardar `role='admin'`, y cualquier otra cuenta SHALL quedar con `role='user'`.
5. **WHEN** la misma clave de rate limit recibe 11 golpes dentro de una ventana de 60 segundos con límite 10 **THE SYSTEM SHALL** permitir los 10 primeros y rechazar el 11.º.

**Verify**

```bash
pnpm db:up
pnpm test tests/integration/auth.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: auth servidor"
git tag step-03-auth-server
```

### `E1-T4` — UI de acceso y shell protegido de la app

**Depends on:** `E1-T3` · **Priority:** p0

`auth-form.tsx` (`"use client"`, `createAuthClient()` de `better-auth/react`). Etiquetas **exactas**
(contrato con `tests/e2e/helpers.ts`): "Nombre", "Correo electrónico", "Contraseña", "País" (`<select>`
con `PE, AR, BO, BR, CL, CN, CO, EC, ES, MX, US, VE, ZZ`); botones "Crear cuenta", "Ingresar",
"Enviar enlace", "Guardar contraseña"; errores en `<p role="alert">` ("Correo o contraseña
incorrectos", "Verifica tu correo antes de ingresar"). `[mode]/page.tsx`: `sign-in | sign-up | forgot
| reset | check-email` (otro → `notFound()`), con sesión → `/app`; server action de registro (límite
5/h por IP, `auth.api.signUpEmail`, inserta `profiles` con locale de cookie, país y moneda PEN si `PE`
si no USD, redirige a `/auth/check-email` con `h1` "Revisa tu correo"). `(app)/app/layout.tsx`:
`await requireUser()`; nav Cotizaciones `/app/quotes`, Plan `/app/billing`, Ajustes `/app/settings`,
Admin `/admin/charges` solo para admin; selector de idioma y tema (server actions que fijan cookies
`NEXT_LOCALE`/`theme` un año y `revalidatePath("/", "layout")`); botón "Salir" (form POST →
`auth.api.signOut`, `redirect("/")`). `(app)/app/page.tsx`: `h1` "Panel" / "Dashboard". Spec: usa
`signUpAndVerify`, `signIn`, `uniqueEmail`; ancho con
`document.documentElement.scrollWidth === document.documentElement.clientWidth` a 375×800 y 1440×900.

**Files**
- `src/components/auth/auth-form.tsx` — nuevo
- `src/app/(auth)/auth/[mode]/page.tsx` — nuevo
- `src/app/(app)/app/layout.tsx` — nuevo
- `src/app/(app)/app/page.tsx` — nuevo
- `tests/e2e/auth-shell.spec.ts` — nuevo

**Acceptance**

1. **WHEN** un visitante anónimo pide `/app` **THE SYSTEM SHALL** redirigir a `/auth/sign-in`.
2. **WHEN** un visitante se registra en `/auth/sign-up`, sigue el enlace de verificación del outbox e ingresa **THE SYSTEM SHALL** mostrar `/app` con el encabezado `Panel`.
3. **WHEN** `/` y `/auth/sign-in` se renderizan a 375 px y a 1440 px de ancho **THE SYSTEM SHALL** reportar `document.documentElement.scrollWidth` igual a `clientWidth`.
4. **WHEN** un usuario con sesión pulsa `Salir` **THE SYSTEM SHALL** cerrar la sesión y la siguiente petición a `/app` SHALL redirigir a `/auth/sign-in`.
5. **WHEN** se envía una contraseña incorrecta en `/auth/sign-in` **THE SYSTEM SHALL** mostrar el error como texto dentro de un elemento con `role="alert"` y permanecer en la página.

**Verify**

```bash
pnpm db:up
pnpm test:e2e tests/e2e/auth-shell.spec.ts
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: ui de acceso y shell"
git tag step-04-auth-ui
```

### `E1-T5` — Guardia única, errores tipados, cuotas y aislamiento

**Depends on:** `E1-T3` · **Priority:** p0

`errors.ts`: `ErrorCode` = `VALIDATION` 422 · `UNAUTHENTICATED` 401 · `NOT_FOUND` 404 ·
`QUOTA_EXCEEDED` 402 · `RATE_LIMITED` 429 · `CONFLICT` 409 · `INVALID_SIGNATURE` 400 ·
`UPSTREAM_UNAVAILABLE` 503 · `INTERNAL` 500; `AppError`, `httpStatus`, `toResult`, `toJsonResponse`
(sobre `{ ok: false, error: { code, message, requestId } }`); `logger` JSON por línea con `LOG_LEVEL`
y redacción recursiva de claves `/password|token|secret|key|authorization|cookie/i` a `"[REDACTED]"`;
`reportError` (driver `log`, o POST a `ERROR_REPORT_WEBHOOK_URL` con timeout 3 s, nunca lanza).
`authz.ts`: `Actor = { userId, role }`, `ownedQuoteOrThrow(tx, actor, id)` (filtra `user_id` y
`deleted_at is null`), `requireAdmin`. `entitlements.ts`: suscripción `active` (o `past_due` hasta 7
días después de `current_period_end`) → `plans.quota_per_period − quotes_used` del contador
`subscription` del periodo actual; si no, cuenta verificada → `1 − quotes_used` del contador `free`
(`period_start` 1970-01-01T00:00:00Z); si no, 0. `consumeQuote` crea el contador si falta, lo bloquea
con `select … for update`, re-evalúa, lanza `QUOTA_EXCEEDED` o incrementa. `quotes/service.ts`:
`createQuote(actor, { title, locale })` en transacción (límite `quote:<userId>` 30/h, `consumeQuote`,
código `COT-<año UTC>-<NNNN>` vía `reference_counters` upsert `returning last`, inserta `quotes` y
`quote_supplier_terms` por defecto, `audit_events` `quote.created`); `getQuote`, `listQuotes` (cursor
`(created_at, id)` desc, límite 20/máx 50), `renameQuote`, `softDeleteQuote` vía `ownedQuoteOrThrow`.
Test: usuarios verificados insertados directo; plan de prueba con código único y cuota 10; concurrencia con `Promise.all`.

**Files**
- `src/server/errors.ts` — nuevo
- `src/server/authz.ts` — nuevo
- `src/server/billing/entitlements.ts` — nuevo
- `src/server/quotes/service.ts` — nuevo
- `tests/integration/guard.test.ts` — nuevo

**Acceptance**

1. **WHEN** el usuario A pide leer, renombrar o borrar una cotización cuyo dueño es el usuario B **THE SYSTEM SHALL** lanzar `NOT_FOUND` (HTTP 404) en los tres casos y dejar intacta la fila de B.
2. **WHEN** el usuario A lista sus cotizaciones **THE SYSTEM SHALL** devolver solo filas con `user_id` igual a A y `deleted_at` nulo.
3. **WHEN** una cuenta verificada sin suscripción crea su primera cotización **THE SYSTEM SHALL** crearla con un código que cumple `^COT-\d{4}-\d{4}$`, y el segundo intento SHALL lanzar `QUOTA_EXCEEDED` (HTTP 402) sin crear fila.
4. **WHEN** una cuenta con suscripción `active` ya usó en el periodo actual la cuota de su plan **THE SYSTEM SHALL** rechazar la siguiente creación con `QUOTA_EXCEEDED`.
5. **WHEN** dos creaciones concurrentes de la misma cuenta compiten por la última cotización disponible **THE SYSTEM SHALL** crear exactamente una.
6. **WHEN** se registra un log con un campo llamado `password` o `token` **THE SYSTEM SHALL** escribir su valor como `[REDACTED]`.

**Verify**

```bash
pnpm db:up
pnpm test tests/integration/guard.test.ts
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: guardia y aislamiento"
git tag step-05-isolation
```

### `E1-T6` — Reglas: repositorio con vigencias y seed demo

**Depends on:** `E1-T2` · **Priority:** p0

`seed-data.ts`: filas DEMO (`verification_status='unverified'`, `source_url='seed://demo'`):
`tax_rates` igv 1600 y ipm 200 de 2025-01-01 a 2026-01-01, igv 1550 e ipm 250 desde 2026-01-01;
`tariff_headings` `8477300000` "Máquinas para moldear por soplado (DEMO)"/"Blow moulding machines
(DEMO)" y `8418690000` "Demás equipos de refrigeración (DEMO)"/"Other refrigerating equipment (DEMO)"
desde 2026-01-01; `tariff_rates` ad_valorem `cif` 0 bps (`8477300000`) y 600 bps (`8418690000`),
`in_igv_base=true`; `trade_agreements` CN `TLC-PE-CN` "TLC Perú–China (DEMO)" exonera `{ad_valorem}`
con certificado; `perception_rules` `no_aplica` 0, `general` 350, `primera_importacion` 1000;
`default_local_charges` USD desde 2026-01-01: `intl_freight` 90000 (internacional, in_cif, IGV sí),
`intl_insurance` 4000 (internacional, in_cif, IGV sí), `customs_agency` 25000, `warehouse` 12720,
`local_transport` 10000 (locales, IGV sí), `origin_fob_charges` 0 (internacional, fuera de CIF, IGV no),
`management_fee` 150000 (grupo `management_fee`, IGV no); `plans` `mensual` cuota 10, precios 0,
`active=false`. `seed.ts`: `export async function seed(db)` con `on conflict do nothing` en orden
plans → tax_rates → tariff_headings → tariff_rates → trade_agreements → perception_rules →
default_local_charges; si se ejecuta directo (`import.meta.url === pathToFileURL(process.argv[1]).href`)
usa `postgres(process.env.DATABASE_URL)`. Solo importa `drizzle-orm`, `postgres`, `node:url`,
`./schema.ts`, `./seed-data.ts`. `repository.ts`: `resolveRules(tx, { headingCode, at, originCountry,
importerCondition })` → `{ heading, rates, igv, ipm, dispatchFee, agreements, perception }` (forma de
`EngineInput` del epic 02), solo filas vigentes en `at`; partida inexistente → `NOT_FOUND`; sin igv/ipm
→ `CONFLICT` "RULES_INCOMPLETE"; percepción con el `heading_prefix` más largo que prefije la partida.
Cada regla: `{ table, id, effectiveFrom, sourceUrl }`. También `searchHeadings` (máx. 20),
`currentLocalCharges` (último `valid_from <= at` por concepto), `listPerceptionConditions`.

**Files**
- `src/db/seed-data.ts` — nuevo
- `src/db/seed.ts` — nuevo
- `src/server/rules/repository.ts` — nuevo
- `tests/integration/rules.test.ts` — nuevo

**Acceptance**

1. **WHEN** `pnpm db:seed` se ejecuta dos veces sobre la base de desarrollo migrada **THE SYSTEM SHALL** terminar con código 0 ambas veces.
2. **WHEN** la función `seed` se ejecuta dos veces sobre la base de pruebas **THE SYSTEM SHALL** dejar los mismos conteos de filas por tabla tras la segunda ejecución que tras la primera.
3. **WHEN** se resuelven las reglas de la partida `8477300000` para el 2026-06-01 **THE SYSTEM SHALL** devolver las filas de IGV e IPM vigentes ese día y ninguna fila con `effective_to` anterior a esa fecha.
4. **WHEN** se pide una partida que no existe en `tariff_headings` **THE SYSTEM SHALL** lanzar `NOT_FOUND`.
5. **WHEN** `resolveRules` devuelve reglas **THE SYSTEM SHALL** incluir por cada una su tabla, `id`, `effective_from` y `source_url` para el snapshot.

**Verify**

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm db:seed
pnpm test tests/integration/rules.test.ts
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T6: reglas y seed"
git tag step-06-rules-data
```

---

## Epic acceptance

El epic está hecho cuando toda tarea está `done` **y**:

1. **WHEN** `pnpm test` corre completo con Postgres arriba **THE SYSTEM SHALL** terminar con código 0, 0 fallidas y 0 omitidas.
2. **WHEN** `bash scripts/serve-check.sh / 200 'Cotimporta'` corre tras `pnpm build` **THE SYSTEM SHALL** salir 0, como en `E1-T1`.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm build && bash scripts/serve-check.sh / 200 'Cotimporta'
```

## Pitfalls

- **`requireEnv` en import de módulo** — `src/lib/auth.ts` exige `BETTER_AUTH_*` al importarse; `.env` del Bootstrap los trae. Nunca muevas esa exigencia a `parseEnv` (rompería gates anteriores).
- **Imports `@/` en `src/db/seed*.ts`** — Node sin bundler no los resuelve; `pnpm db:seed` muere con `ERR_MODULE_NOT_FOUND`.
- **403 en recursos ajenos** — siempre 404.
- **Truncar tablas en tests** — prohibido; crea usuarios únicos. Las tablas globales de reglas siguen
  la regla de `.claude/rules/testing.md` (valores únicos por corrida, año ≥ 2099, nunca `igv`/`ipm` ni
  `8477300000` ni filas `seed://demo`); `tests/setup/integration.ts` borra las filas no-seed antes de cada archivo.
- **`pnpm test` sin archivos** — falla a propósito (no hay `passWithNoTests` global); solo `E1-T1` usa el flag.

## Antes de seguir

- [ ] Cada tarea de este epic está `done` en `tasks.json`; ninguna `in_progress`.
- [ ] Cada comando `verify` de cada tarea pasó, no solo el primero.
- [ ] Ningún `verify` se editó ni se omitió por un archivo inexistente.
- [ ] Cada tarea tiene su tag (`git tag -l 'step-*'` lista `step-01-scaffold` … `step-06-rules-data`).
- [ ] El gate pasa limpio desde la raíz.
- [ ] Cada contrato "Producido" existe con la firma indicada.
- [ ] Ningún archivo fuera del subárbol fue modificado.
- [ ] `.env.example` no cambia: ya trae todas las variables.
- [ ] Un commit por tarea, con su id, seguido de su tag.
