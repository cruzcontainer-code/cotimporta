# Epic 03: IA, PDF y cobros

> Al terminar existe la subida privada del PDF del proveedor con extracción de fotos, la IA (ficha técnica traducida, partida validada, narrativa) con degradación a manual, el PDF formal descargable en ES/EN, el cobro por `PaymentProvider` con webhooks idempotentes, la exportación y el borrado de cuenta, y el health de producción.

| | |
|---|---|
| **Epic id** | `03-ia-pdf-cobros` |
| **Tasks** | `E3-T1` … `E3-T6` (pasos 13–18 de `blueprint.md` §9) |
| **Depends on** | `01-fundacion`, `02-motor-y-cotizador` |
| **Unlocks** | nada — es el último epic; luego, §20.1 de `blueprint.md` |
| **Parallel with** | `E3-T5` (cobros) puede correr junto a `E3-T1`…`E3-T4` (sin archivos en común) |

No necesitas ningún otro archivo para completar este epic. Todo se repite aquí a propósito.

---

## Stack

Next.js 16 (App Router) · TypeScript 7 · Tailwind CSS 4 · next-intl · Postgres 17 (Docker local) ·
Drizzle ORM · better-auth · `@google/genai` · `@react-pdf/renderer` · `pdfjs-dist` · Vercel.
Gestor: `pnpm` 12.18.0. Runtime en `.nvmrc` (Node 24.22.3). Versiones: `pnpm-lock.yaml`.
Cada shell: `export PATH="$HOME/.local/bin:$PATH"`.

| Tarea | Comando |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test tests/integration/x.test.ts` |
| E2E | `pnpm test:e2e` |
| Build + servidor | `pnpm build` · `bash scripts/serve-check.sh <ruta> <estado> [patrón] [cookie]` |
| Migrar | `pnpm db:migrate` |
| Servicios locales | `pnpm db:up` / `pnpm db:down` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

Drivers locales (ya en `vitest.config.ts` y `.env`): `STORAGE_DRIVER=local`, `AI_DRIVER=fake`,
`PAYMENT_PROVIDER=fake`, `EMAIL_DRIVER=log`. Ninguna prueba sale a la red. Tests que necesitan reglas
llaman `seed(db)` de `@/db/seed` en `beforeAll`.

## Subárbol de directorios

```
src/
  server/
    storage/index.ts                   # NUEVO E3-T1
    documents/service.ts               # NUEVO E3-T1
    ai/gateway.ts · ai/extract-specs.ts       # NUEVO E3-T2
    ai/suggest-heading.ts · ai/narrative.ts   # NUEVO E3-T3
    pdf/quote-document.ts · pdf/render.ts     # NUEVO E3-T4
    billing/provider.ts · billing/service.ts  # NUEVO E3-T5
    account/service.ts                 # NUEVO E3-T6
    quotes/service.ts · authz.ts · errors.ts · rate-limit.ts · email.ts · billing/entitlements.ts   # existen, solo lectura
  app/
    api/v1/quotes/[id]/documents/route.ts     # NUEVO E3-T1
    api/v1/quotes/[id]/pdf/route.ts           # NUEVO E3-T4
    api/webhooks/payments/[provider]/route.ts # NUEVO E3-T5
    api/v1/account/export/route.ts            # NUEVO E3-T6
    api/health/route.ts                       # NUEVO E3-T6
    (app)/app/quotes/[id]/page.tsx            # existe (E2-T2) — E3-T2 y E3-T4 lo editan
    (app)/app/quotes/actions.ts               # existe — E3-T3 lo edita
    (app)/app/billing/page.tsx                # NUEVO E3-T5
    (app)/app/settings/page.tsx               # NUEVO E3-T6
  components/quotes/document-step.tsx         # NUEVO E3-T2 (cliente)
tests/
  helpers/session.ts                   # NUEVO E3-T1
  integration/{documents,ai-extract,ai-heading,quote-pdf,billing,account}.test.ts
docs/verified/*.md                     # existen (E2-T5), solo lectura
```

Fuera de este subárbol no se toca nada. Si una tarea parece requerirlo, detente y reporta.

## Modelo de datos tocado aquí

| Entidad | Campos | Notas |
|---|---|---|
| `supplier_documents`, `document_images` | clave de storage, SHA-256, estado y JSON de extracción; fotos con `position`, `included` | E3-T1, E3-T2 |
| `quotes.specs`, `quotes.narrative`, `quotes.tariff_heading_code` | ficha revisada, narrativa; la partida solo cambia al confirmar | E3-T2, E3-T3 |
| `ai_calls` | una fila por intento (`ok`, `error`, `timeout`, `invalid_output`) | E3-T2 |
| `generated_documents` | versión por (cotización, locale) y `result_calculated_at` | E3-T4 |
| `subscriptions`, `payment_events`, `usage_counters`, `plans` | webhook idempotente; periodo de un mes calendario | E3-T5 |
| `data_export_requests`, `audit_events`, todas las de usuario | exportar y borrar | E3-T6 |

## Contratos

**Consumidos:**

| De | Interfaz | Garantía |
|---|---|---|
| `01-fundacion` | `auth`, `requireActor`, `readOutbox`, `hit`, `ownedQuoteOrThrow`, `AppError`, `logger`, `reportError`, `getEntitlement`, `seed` | ver epic 01 |
| `02-motor-y-cotizador` | `calculateQuote` (motor y servicio), `formatUsd`, `formatPen`, `EngineResult` | enteros; snapshot de reglas |
| `02-motor-y-cotizador` | `suggestHeadingsAction` (stub) | E3-T3 lo conecta sin cambiar su firma |
| `02-motor-y-cotizador` | `docs/verified/gemini-model.md`, `docs/verified/izipay.md` | `model_id`, `ipn_signature`, `mode` |

**Producidos:**

| Export | Firma | Usado por |
|---|---|---|
| `src/server/storage/index.ts` → `getStorage`, `StorageProvider` | `put/get/delete/deletePrefix/list` | E3-T4, E3-T6 |
| `tests/helpers/session.ts` → `createVerifiedSession` | `(prefix) → { userId, cookie }` | E3-T4, E3-T6 |
| `src/server/ai/gateway.ts` → `generateJson`, `setFakeResponse` | ver E3-T2 | E3-T3 |
| `src/server/pdf/render.ts` → `renderQuotePdf`, `getOrCreateQuotePdf` | `Uint8Array` | E3-T6 (archivos) |
| `src/server/billing/provider.ts` → `PaymentProvider`, `getPaymentProvider` | `createCheckout`, `verifyWebhook`, `cancel` | E3-T6 |
| `src/app/api/health/route.ts` → `checkHealth` | `(sql) → { status: 200 \| 503, body }` | CI, monitor |

## Convenciones que muerden en esta área

- `@google/genai` se importa solo en `src/server/ai/gateway.ts`; el id de modelo viene de `GEMINI_MODEL`.
- Sin PII en prompts (ni email, ni nombre, ni id). El PDF del proveedor se delimita como datos.
- Webhooks: firma sobre el cuerpo crudo (`await request.text()`) antes de parsear; idempotencia por `payment_events` único.
- Archivos privados: los route handlers sirven bytes solo tras `requireActor` + propiedad; ajeno = 404.
- Montos del PDF siempre del motor (`formatUsd`/`formatPen`), nunca de la IA.

Reglas completas: `CLAUDE.md`. Por área: `.claude/rules/ai-billing.md`, `server.md`, `ui.md`, `testing.md`.

---

## Tasks

### `E3-T1` — Almacenamiento privado, subida de PDF y fotos

**Depends on:** `E2-T2` · **Priority:** p0

`storage/index.ts`: `StorageProvider = { put(key, bytes: Uint8Array, contentType); get(key) →
Uint8Array | null; delete(key); deletePrefix(prefix) → number; list(prefix) → string[] }`; driver
`local` sobre `requireEnv("STORAGE_LOCAL_DIR")` (rechaza `..` y rutas absolutas); claves
`users/<userId>/quotes/<quoteId>/{uploads,images,generated}/…`. `documents/service.ts`:
`uploadSupplierDocument(actor, quoteId, file)` — dueño; ≤ 20 971 520 bytes; primeros 5 bytes `%PDF-`
(si no, `VALIDATION` 422 sin guardar); guarda en `…/uploads/<uuid>.pdf`; inserta `supplier_documents`
(SHA-256, `pending`); extrae imágenes con `pdfjs-dist/legacy/build/pdf.mjs`
(`getDocument({ data, isEvalSupported: false, useSystemFonts: false })`, `page.getOperatorList()` →
`OPS.paintImageXObject` → `page.objs.get(name)`, RGB/RGBA/gris → RGBA; si la versión exige
`GlobalWorkerOptions.workerSrc`, apúntalo a `pdfjs-dist/legacy/build/pdf.worker.mjs`) y las guarda
como PNG con un `encodePng(width, height, rgba)` propio (`node:zlib` `deflateSync` + CRC32; firma
`89 50 4E 47 0D 0A 1A 0A`) en `…/images/<uuid>.png` + filas `document_images` en orden de aparición;
omite imágenes de menos de 2 px por lado. También `listImages`, `setImageIncluded`, `moveImage`,
`readImage`. Route: `POST` multipart `file` (límite 30/h por usuario) → 201 `{ ok: true, data: {
documentId, images } }`; `GET ?image=<id>` → `image/png`, `Cache-Control: private, no-store`; ambos con
`requireActor(request.headers)`. `tests/helpers/session.ts`: `createVerifiedSession(prefix)` registra
(`auth.api.signUpEmail`), verifica con el token del outbox en memoria (`readOutbox()`), ingresa
(`auth.api.signInEmail` pidiendo cabeceras) y devuelve `{ userId, cookie }`. Test: PDF construido en
el test con `encodePng(4, 4, …)` → `React.createElement(Document, …)` con un `Image` → `renderToBuffer`
de `@react-pdf/renderer`; llama `POST`/`GET` exportados con `new Request(…, { headers: { cookie } })`
y `{ params: Promise.resolve({ id }) }`; archivo grande = `new Uint8Array(20_971_521)` que empieza con `%PDF-`.

**Files**
- `src/server/storage/index.ts` — nuevo
- `src/server/documents/service.ts` — nuevo
- `src/app/api/v1/quotes/[id]/documents/route.ts` — nuevo
- `tests/helpers/session.ts` — nuevo
- `tests/integration/documents.test.ts` — nuevo

**Acceptance**

1. **WHEN** el dueño sube a su cotización un PDF de menos de 20 MB **THE SYSTEM SHALL** guardarlo bajo `users/<userId>/quotes/<quoteId>/uploads/`, insertar una fila en `supplier_documents` con su SHA-256 y responder 201.
2. **WHEN** se sube un PDF generado en la prueba con una imagen PNG incrustada de 4×4 **THE SYSTEM SHALL** insertar al menos una fila en `document_images` con ancho 4 y alto 4 y un PNG guardado cuyos primeros bytes son la firma PNG.
3. **WHEN** se sube un archivo cuyos primeros bytes no son `%PDF-` o que pesa más de 20 MB **THE SYSTEM SHALL** responder 422 y no guardar nada.
4. **WHEN** el usuario A sube a la cotización del usuario B o pide una imagen de ella **THE SYSTEM SHALL** responder 404.
5. **WHEN** el usuario excluye o reordena imágenes **THE SYSTEM SHALL** persistir `included` y `position`, y las lecturas siguientes SHALL devolver las imágenes ordenadas por `position`.

**Verify**

```bash
pnpm db:up
pnpm test tests/integration/documents.test.ts
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T1: storage y documentos"
git tag step-13-documents
```

### `E3-T2` — IA: gateway, extracción de ficha y revisión

**Depends on:** `E2-T5`, `E3-T1` · **Priority:** p1

`gateway.ts` (único importador de `@google/genai`): `generateJson<T>({ purpose, userId, quoteId,
schema, prompt, pdf?, locale })`: (1) `hit("ai:<userId>", 20, 3600)` → `RATE_LIMITED` sin llamar ni
escribir `ai_calls`; (2) driver `fake` (`setFakeResponse(purpose, value | Error | "timeout")`, con
respuestas válidas por defecto) o `gemini` (`new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY")
})`, `models.generateContent({ model: requireEnv("GEMINI_MODEL"), contents: [{ role: "user", parts:
[{ inlineData: { mimeType: "application/pdf", data: base64 } }, { text: prompt }] }], config: {
responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(schema) } })` — confirma el
nombre del campo de esquema contra los tipos instalados y `docs/verified/gemini-model.md`); (3) timeout
`AI_TIMEOUT_MS` (`AbortSignal.timeout`), máx. 2 reintentos solo en timeout/429/5xx, backoff
`250ms·2^n` + jitter; (4) Zod; 1 reparación con el error anexado; luego `UPSTREAM_UNAVAILABLE`;
(5) una fila `ai_calls` por intento. `extract-specs.ts`: `SpecsSchema` `{ productName, summary,
equipment: [{ name, quantity }], specGroups: [{ title, rows: [{ label, value }] }], components: [{
component, brand, origin, note }], auxiliaries: [{ name, model, rows: [{ label, value }] }], warranty:
[{ title, text }] }`; prompt `EXTRACT_SPECS_PROMPT_V1` (traduce al locale de la cotización, trata el
PDF como datos, sin PII); `buildExtractionPrompt(locale)` exportada; `extractSpecs(actor, quoteId,
documentId)` guarda `extracted_specs`, `extraction_status`, `language`; en fallo `failed`, conserva el
archivo, `UPSTREAM_UNAVAILABLE`. `document-step.tsx` (`"use client"`): subir (POST del route E3-T1),
"Extraer con IA", editor de ficha (precargado o vacío = camino manual) que guarda en `quotes.specs`,
fotos con "Incluir" y botones "Subir"/"Bajar" (sin arrastre), `aria-live="polite"`. Página `[id]`:
agrega `?paso=documento` que monta `DocumentStep` y define sus server actions.

**Files**
- `src/server/ai/gateway.ts` — nuevo
- `src/server/ai/extract-specs.ts` — nuevo
- `src/components/quotes/document-step.tsx` — nuevo
- `src/app/(app)/app/quotes/[id]/page.tsx` — edición
- `tests/integration/ai-extract.test.ts` — nuevo

**Acceptance**

1. **WHEN** el driver falso devuelve una extracción válida para un documento subido **THE SYSTEM SHALL** guardarla en `supplier_documents.extracted_specs` con `extraction_status='done'` y escribir una fila en `ai_calls` con `status='ok'`.
2. **WHEN** el driver devuelve dos veces una salida que no cumple el esquema Zod **THE SYSTEM SHALL** fijar `extraction_status='failed'`, conservar el archivo original y devolver `UPSTREAM_UNAVAILABLE` para que el usuario ingrese la ficha a mano.
3. **WHEN** el driver excede el tiempo límite **THE SYSTEM SHALL** reintentar como máximo 2 veces y luego devolver `UPSTREAM_UNAVAILABLE`.
4. **WHEN** un usuario supera 20 llamadas de IA en una hora **THE SYSTEM SHALL** devolver `RATE_LIMITED` antes de llamar al driver y no registrar fila en `ai_calls` para la llamada rechazada.
5. **WHEN** `grep` lista los archivos de `src` que importan `@google/genai` **THE SYSTEM SHALL** encontrar exactamente `src/server/ai/gateway.ts`, y `docs/verified/gemini-model.md` SHALL tener la línea `status: verified`.
6. **WHEN** se arma el prompt de extracción **THE SYSTEM SHALL** no incluir el email, el nombre ni el id de la cuenta.

**Verify**

```bash
grep -qx 'status: verified' docs/verified/gemini-model.md
pnpm db:up
pnpm test tests/integration/ai-extract.test.ts
test "$(grep -rl '@google/genai' src)" = "src/server/ai/gateway.ts"
pnpm typecheck
pnpm lint
pnpm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T2: extracción con IA"
git tag step-14-ai-extraction
```

### `E3-T3` — IA: partida validada y narrativa

**Depends on:** `E3-T2` · **Priority:** p1

`suggest-heading.ts`: esquema `{ candidates: [{ code (^\d{10}$), rationale, confidence 0..1 }] }`
(máx. 3); prompt con descripción del producto y `quotes.specs`, sin PII; filtra contra
`tariff_headings` vigentes; sin válidos → `{ candidates: [], reason: "NO_VALID_CANDIDATES" }`;
`audit_events` `heading.suggested`; **no** toca `quotes.tariff_heading_code`. `narrative.ts`: esquema
Zod estricto `{ concepts: Record<conceptCode, string>, stages: { "1"…"6": string } }` con exactamente
los `conceptCode` de la cotización y las 6 etapas (claves extra → rechazo); prompt con montos ya
formateados (`formatUsd`) y el locale; guarda `quotes.narrative = { locale, … }`; si el driver falla,
`narrative` queda nulo y `result` intacto. `actions.ts`: conecta `suggestHeadingsAction`;
`calculateQuoteAction` genera la narrativa tras calcular sin bloquear el resultado si la IA falla.

**Files**
- `src/server/ai/suggest-heading.ts` — nuevo
- `src/server/ai/narrative.ts` — nuevo
- `src/app/(app)/app/quotes/actions.ts` — edición
- `tests/integration/ai-heading.test.ts` — nuevo

**Acceptance**

1. **WHEN** el driver falso sugiere tres partidas y una no existe en `tariff_headings` **THE SYSTEM SHALL** devolver solo las dos publicadas, cada una con justificación y confianza entre 0 y 1.
2. **WHEN** ninguna partida sugerida existe en `tariff_headings` **THE SYSTEM SHALL** devolver una lista vacía con el motivo `NO_VALID_CANDIDATES`.
3. **WHEN** se devuelve una sugerencia **THE SYSTEM SHALL** no cambiar `quotes.tariff_heading_code` hasta que el usuario confirme una.
4. **WHEN** la salida de la narrativa trae claves distintas de los ids de concepto y de etapa esperados **THE SYSTEM SHALL** rechazarla con el esquema Zod y dejar `quotes.narrative` sin cambios.
5. **WHEN** el driver falla al generar la narrativa **THE SYSTEM SHALL** dejar `quotes.narrative` en nulo y el `result` del cálculo sin cambios.

**Verify**

```bash
pnpm db:up
pnpm test tests/integration/ai-heading.test.ts
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T3: partida y narrativa"
git tag step-15-ai-heading-narrative
```

### `E3-T4` — PDF formal de la cotización y descarga

**Depends on:** `E3-T1`, `E3-T3` · **Priority:** p0

`quote-document.ts`: documento `@react-pdf/renderer` con `React.createElement` (sin JSX), A4,
Helvetica, que replica `reference/cotizacion-bg880-ejemplo.pdf`: cabecera (logo
`public/brand/logo.png` si existe, si no el wordmark "Cotimporta"), título "PROPUESTA DE INVERSIÓN" /
"INVESTMENT PROPOSAL", producto, código `COT-`, fecha, validez ("15 días calendarios" / "15 calendar
days" desde `validity_days`), T.C. con fecha y fuente, regla navy `#0F172A`; 1. resumen (Factura FOB,
Monto logístico + destino, IGV compra, Percepción, Gestión, Inversión total en USD y PEN con
`formatUsd`/`formatPen`); 2. equipamiento (`specs.equipment`); 3. cronograma de 6 etapas en tarjetas
numeradas + nota; 4. especificaciones; 5. componentes y marcas; 6. fichas auxiliares; 7. fotos
incluidas en orden; 8. términos y garantía; firmas; partida y ad valorem aplicados; desglose con
fuentes; narrativa si existe; aviso "Estimación referencial. No es una liquidación oficial de aduanas.
Reglas vigentes al <rules_as_of ISO>." / "Reference estimate. Not an official customs assessment.
Rules in force as of <rules_as_of ISO>."; pie "Página N de M"; textos en `copy: Copy<…>`.
`render.ts`: `renderQuotePdf(quote, locale)`; `getOrCreateQuotePdf(actor, quoteId, locale)` — dueño,
`status='calculated'`; si no hay `generated_documents` para (cotización, locale) con
`result_calculated_at = quotes.calculated_at`, renderiza, guarda `…/generated/<locale>-v<n>.pdf` e
inserta versión `max+1`. Route `GET ?locale=es|en`, `runtime = "nodejs"`, `Content-Disposition:
attachment; filename="<COT-…>-<locale>.pdf"`. Página `[id]`: enlaces "Descargar PDF (ES)" y "Download
PDF (EN)". Test: no depende de filas mutables — `tests/setup/integration.ts` ya borró toda regla
no-seed y el test afirma que cada regla del `rule_snapshot` de su cotización tiene `sourceUrl`
`seed://demo` (IGV 1550, IPM 250, ad valorem 0 de `8477300000`, percepción `no_aplica`, filas que
ninguna prueba puede modificar). `seed(db)` en `beforeAll`; cotización con la entrada golden vía servicios (ítem
1200000, líneas `intl_freight` 90000, `intl_insurance` 4000, `customs_agency` 25000, `warehouse`
12720, `local_transport` 10000, `management_fee` 150000, partida `8477300000`, TC 35000, percepción
`no_aplica`); texto con `pdfjs-dist/legacy/build/pdf.mjs` (`getTextContent` → `items.map(i =>
i.str).join("")` → `replace(/\s+/g, "")`); route con `createVerifiedSession` para dueño y ajeno.

**Files**
- `src/server/pdf/quote-document.ts` — nuevo
- `src/server/pdf/render.ts` — nuevo
- `src/app/api/v1/quotes/[id]/pdf/route.ts` — nuevo
- `src/app/(app)/app/quotes/[id]/page.tsx` — edición
- `tests/integration/quote-pdf.test.ts` — nuevo

**Acceptance**

1. **WHEN** se genera el PDF de la cotización golden BG-880 **THE SYSTEM SHALL** producir bytes que empiezan con `%PDF-` y cuyo texto, extraído con pdfjs-dist y sin espacios, contiene `17,332.30`, `60,663.05` y el código `COT-` de la cotización.
2. **WHEN** el PDF se genera con locale `en` **THE SYSTEM SHALL** contener `INVESTMENTPROPOSAL`, y con locale `es` SHALL contener `PROPUESTADEINVERSIÓN`, ambos en el texto sin espacios.
3. **WHEN** se genera el PDF **THE SYSTEM SHALL** contener `Estimaciónreferencial` en el texto sin espacios del locale `es` y la fecha ISO `rules_as_of` del snapshot de reglas.
4. **WHEN** el dueño pide `GET /api/v1/quotes/<id>/pdf?locale=es` **THE SYSTEM SHALL** responder 200 con `content-type: application/pdf` y guardar una fila en `generated_documents` con versión 1, y un segundo pedido tras recalcular SHALL guardar la versión 2.
5. **WHEN** otro usuario pide esa URL **THE SYSTEM SHALL** responder 404.
6. **WHEN** no existe `public/brand/logo.png` **THE SYSTEM SHALL** dibujar en la cabecera del PDF la marca de texto `Cotimporta`.

**Verify**

```bash
pnpm db:up
pnpm test tests/integration/quote-pdf.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T4: pdf formal"
git tag step-16-quote-pdf
```

### `E3-T5` — Cobros: PaymentProvider, webhooks y plan

**Depends on:** `E1-T5`, `E2-T5` · **Priority:** p0

`provider.ts`: `PaymentProvider = { name: "fake" | "izipay"; createCheckout({ userId, planCode,
currency: "PEN" | "USD", amountMinor, orderId, returnUrl }) → { redirectUrl, providerRef };
verifyWebhook(rawBody, headers) → VerifiedEvent | null; cancel(providerRef) }`; `VerifiedEvent = {
externalEventId, type ("payment.succeeded" | "payment.failed" | "subscription.canceled" | otro),
userId, planCode, currency, amountMinor, occurredAt: Date, providerRef, raw }`. Driver `fake`: HMAC-SHA256
hex del cuerpo con `FAKE_PAYMENT_WEBHOOK_SECRET` en `x-fake-signature` (comparación en tiempo
constante); checkout → `/app/billing?fake_checkout=<orderId>` (en dev, "Simular pago" firma y envía el
evento). Driver `izipay`: checkout alojado (redirect) y verificación IPN **exactamente** según
`docs/verified/izipay.md` (`ipn_signature`, `mode`) con `IZIPAY_*`. Esta tarea no empieza si ese
archivo no dice `status: verified` (primera línea de su `Verify`). `service.ts`: `startCheckout(actor, planCode =
"mensual")` — moneda `PEN` si el país del perfil es `PE`, si no `USD`; plan inactivo o precio 0 →
`CONFLICT`; crea/actualiza `subscriptions` `incomplete`. `handleWebhook(provider, rawBody, headers)`:
firma inválida → 400 sin escribir; en transacción inserta `payment_events` (duplicado → 200 sin
cambios); `payment.succeeded` → `active`, `current_period_start = max(now, current_period_end)`,
`current_period_end` = +1 mes calendario UTC (31 → último día del mes siguiente), contador
`subscription` del nuevo periodo con `quotes_used=0`; `subscription.canceled` →
`cancel_at_period_end=true`; tipo desconocido → 200 + log `info`. `cancelSubscription(actor)`. Route:
`POST`, `await request.text()` primero. Página `/app/billing`: plan, precio en la moneda del perfil,
cuota restante, "Suscribirme", "El plan aún no está disponible" si `CONFLICT`, cancelar. Test: planes
propios `test-<uuid>` (activo con precio > 0 e inactivo) pasados a `startCheckout`; evento con
`occurredAt` 2026-03-15T12:00:00Z → `current_period_end` 2026-04-15T12:00:00Z.

**Files**
- `src/server/billing/provider.ts` — nuevo
- `src/server/billing/service.ts` — nuevo
- `src/app/api/webhooks/payments/[provider]/route.ts` — nuevo
- `src/app/(app)/app/billing/page.tsx` — nuevo
- `tests/integration/billing.test.ts` — nuevo

**Acceptance**

1. **WHEN** llega un evento falso `payment.succeeded` con firma correcta **THE SYSTEM SHALL** insertar una fila en `payment_events` y dejar la suscripción de la cuenta en `active` con `current_period_end` un mes después de la fecha de pago.
2. **WHEN** el mismo id de evento llega otra vez **THE SYSTEM SHALL** responder 200 y no cambiar los conteos de filas de `payment_events` ni de `subscriptions`.
3. **WHEN** llega un evento con firma incorrecta **THE SYSTEM SHALL** responder 400 y no escribir ninguna fila.
4. **WHEN** un perfil con país `PE` inicia el checkout **THE SYSTEM SHALL** pedir el cobro al proveedor en `PEN`, cualquier otro país SHALL usar `USD`, y `docs/verified/izipay.md` SHALL tener la línea `status: verified`.
5. **WHEN** el plan está inactivo o tiene precio 0 **THE SYSTEM SHALL** rechazar el checkout con `CONFLICT`.
6. **WHEN** una suscripción pasa a `active` en un periodo nuevo **THE SYSTEM SHALL** iniciar un contador de uso de ese periodo con `quotes_used=0`.

**Verify**

```bash
grep -qx 'status: verified' docs/verified/izipay.md
pnpm db:up
pnpm test tests/integration/billing.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T5: cobros"
git tag step-17-billing
```

### `E3-T6` — Cuenta (exportar/borrar) y health de producción

**Depends on:** `E3-T1`, `E3-T4`, `E3-T5` · **Priority:** p0

`account/service.ts`: `exportAccount(actor)` (límite 5/día) → JSON `{ exportedAt, profile, user: {
email, name, createdAt }, quotes: [... con quote_lines, quote_cost_lines, quote_supplier_terms,
quote_stages, quote_tax_breakdown, supplier_documents (metadatos + extracted_specs),
document_images, generated_documents], files: [claves], subscription, usage }` incluidas las
borradas lógicamente; inserta `data_export_requests` (`ready`). `deleteAccount(actor, confirmEmail)`:
el email debe coincidir; si hay `providerRef`, `provider.cancel`; `storage.deletePrefix("users/<userId>/")`;
en transacción: `payment_events` del usuario → `user_id=null`, `payload = { redacted: true, type,
amountMinor, currency }`; `audit_events` `account.deleted` con `metadata.userHash` (SHA-256 del id) y
`actor_user_id` nulo; `delete from users` (cascadas; `set null` en auditoría y pagos). Página
`/app/settings`: idioma y país; "Exportar mis datos"; "Borrar mi cuenta" en `<dialog>` pidiendo el
email. Route export: `GET`, `Content-Disposition: attachment; filename="cotimporta-export.json"`.
Health: `checkHealth(sql)` exportada — `select 1` (timeout 2 s) y filas de
`drizzle.__drizzle_migrations` = entradas de `drizzle/meta/_journal.json` (import JSON); 200 `{ ok:
true, data: { db: "up", migrations: "current" } }` o 503 `{ ok: false, error: { code:
"UPSTREAM_UNAVAILABLE", … } }`; `GET` con el cliente de la app; `dynamic = "force-dynamic"`. Test:
`createVerifiedSession`, documentos y PDF de prueba, borrado y verificación de archivos, filas,
sesiones y reingreso fallido; `checkHealth` contra
`postgres("postgres://cotimporta:cotimporta@127.0.0.1:1/x", { connect_timeout: 1 })`.

**Files**
- `src/server/account/service.ts` — nuevo
- `src/app/(app)/app/settings/page.tsx` — nuevo
- `src/app/api/v1/account/export/route.ts` — nuevo
- `src/app/api/health/route.ts` — nuevo
- `tests/integration/account.test.ts` — nuevo

**Acceptance**

1. **WHEN** un usuario pide la exportación de datos **THE SYSTEM SHALL** devolver un JSON con el perfil, todas sus cotizaciones (incluidas las borradas lógicamente) con ítems, líneas de costo, etapas y desglose tributario, y la lista de archivos guardados, y registrar una fila en `data_export_requests`.
2. **WHEN** un usuario borra su cuenta **THE SYSTEM SHALL** eliminar todos los archivos bajo `users/<userId>/`, eliminar toda fila ligada a ese usuario sin dejar filas en `sessions`, y un ingreso posterior con las mismas credenciales SHALL fallar.
3. **WHEN** se borra la cuenta **THE SYSTEM SHALL** conservar las filas de `audit_events` y `payment_events` del usuario solo con `user_id` en nulo.
4. **WHEN** `bash scripts/serve-check.sh /api/health 200 '"ok":true'` corre con la base alcanzable y las migraciones aplicadas **THE SYSTEM SHALL** responder 200 con `"ok":true`.
5. **WHEN** `checkHealth` corre contra una base inalcanzable **THE SYSTEM SHALL** devolver estado 503 con `"ok":false`.
6. **WHEN** se ejecutan `pnpm test` y `pnpm test:e2e` completos **THE SYSTEM SHALL** terminar con código 0, 0 fallidas y 0 omitidas.

**Verify**

```bash
pnpm db:up
pnpm db:migrate
pnpm test tests/integration/account.test.ts
pnpm build
bash scripts/serve-check.sh /api/health 200 '"ok":true'
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T6: cuenta y health"
git tag step-18-account-health
```

---

## Epic acceptance

El epic está hecho cuando toda tarea está `done` **y**:

1. **WHEN** el gate global (`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm db:migrate`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `serve-check` de `/` y de `/api/health`) corre desde la raíz con el bundle presente **THE SYSTEM SHALL** salir 0 en cada comando.
2. **WHEN** la IA o el proveedor de pagos fallan (drivers falsos configurados para error) **THE SYSTEM SHALL** seguir permitiendo calcular y descargar la cotización por el camino manual, como prueban `E3-T2`, `E3-T3` y `E3-T4`.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
pnpm build && bash scripts/serve-check.sh /api/health 200 '"ok":true'
```

## Pitfalls

- **Parsear el cuerpo antes de verificar la firma** — el webhook falla abierto.
- **Un segundo import de `@google/genai`** — el gate de `E3-T2` lo detecta.
- **Inventar el algoritmo IPN de Izipay** — se implementa solo lo de `docs/verified/izipay.md`.
- **JSX en `src/server/pdf/quote-document.ts`** — Vitest no lo transforma sin configuración; usa `createElement`.
- **Borrar la cuenta sin borrar archivos** — `deletePrefix` primero, luego filas.

## Antes de terminar

- [ ] Cada tarea de este epic está `done` en `tasks.json`; ninguna `in_progress`.
- [ ] Cada comando `verify` de cada tarea pasó, no solo el primero.
- [ ] Ningún `verify` se editó ni se omitió por un archivo inexistente.
- [ ] Cada tarea tiene su tag (`step-13-documents` … `step-18-account-health`).
- [ ] El gate pasa limpio desde la raíz.
- [ ] Cada contrato "Producido" existe con la firma indicada.
- [ ] Ningún archivo fuera del subárbol fue modificado.
- [ ] `.env.example` no cambia: las variables de IA, pagos y storage ya están.
- [ ] Un commit por tarea, con su id, seguido de su tag.
- [ ] Siguiente: checklist manual de §20.1 de `blueprint.md`.
