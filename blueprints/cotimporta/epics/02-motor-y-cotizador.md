# Epic 02: Motor y cotizador

> Al terminar existe el motor de cálculo puro con pruebas golden, el asistente de cotización con cálculo persistido y snapshot de reglas, el listado y la comparación, el panel admin, la compuerta de hechos externos verificados y la importación de reglas con staging y publicación.

| | |
|---|---|
| **Epic id** | `02-motor-y-cotizador` |
| **Tasks** | `E2-T1` … `E2-T6` (pasos 7–12 de `blueprint.md` §9) |
| **Depends on** | `01-fundacion` (`E2-T1` y `E2-T5` solo necesitan `E1-T1`) |
| **Unlocks** | `03-ia-pdf-cobros` |
| **Parallel with** | `E2-T1` y `E2-T5` pueden correr junto a `E1-T2`…`E1-T6`; `E2-T4` junto a `E2-T2`/`E2-T3` (sin archivos en común) |

No necesitas ningún otro archivo para completar este epic. Todo se repite aquí a propósito.

---

## Stack

Next.js 16 (App Router) · TypeScript 7 · Tailwind CSS 4 · next-intl · Postgres 17 (Docker local) ·
Drizzle ORM · better-auth · Vercel. Gestor: `pnpm` 12.18.0. Runtime en `.nvmrc` (Node 24.22.3).
Versiones: `pnpm-lock.yaml`. Cada shell: `export PATH="$HOME/.local/bin:$PATH"`.

| Tarea | Comando |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo o carpeta) | `pnpm test tests/unit/engine` · `pnpm test tests/integration/x.test.ts` |
| E2E (un spec) | `pnpm test:e2e tests/e2e/x.spec.ts` |
| Build | `pnpm build` |
| Migrar / seed | `pnpm db:migrate` · `pnpm db:seed` |
| Servicios locales | `pnpm db:up` / `pnpm db:down` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

Postgres local arranca con `pnpm db:up` (`docker-compose.yml` ya está en la raíz). La base de pruebas
solo trae migraciones: los tests que necesitan reglas llaman `seed(db)` de `@/db/seed` en `beforeAll`.

**Regla de tablas globales de reglas** (`tax_rates`, `tariff_headings`, `tariff_rates`,
`trade_agreements`, `perception_rules`, `default_local_charges`): una prueba que escribe en ellas usa
valores únicos por corrida (partidas `"99"` + 8 dígitos aleatorios, `concept_code` `test_<uuid>`,
fechas `effective_from`/`valid_from` únicas con año ≥ 2099, `source_url` `https://`), nunca escribe
filas `igv`/`ipm` ni de la partida `8477300000`, y nunca actualiza filas `seed://demo`.
`tests/setup/integration.ts` (ya en la raíz) borra antes de cada archivo toda fila de reglas no-seed y
las corridas de importación. Así `E2-T4` y `E2-T6` se re-ejecutan y el golden de `E3-T4` no cambia.

## Subárbol de directorios

```
src/
  lib/engine/types.ts · money.ts · calculate.ts   # NUEVO E2-T1 — motor puro
  server/
    quotes/service.ts                  # existe (E1-T5) — E2-T2 y E2-T3 lo editan
    rules/repository.ts                # existe (E1-T6) — solo lectura
    rules/import.ts                    # NUEVO E2-T6
    admin/service.ts                   # NUEVO E2-T4
    authz.ts · errors.ts · rate-limit.ts · billing/entitlements.ts   # existen, solo lectura
  app/
    (app)/app/quotes/actions.ts        # NUEVO E2-T2, editado E2-T3
    (app)/app/quotes/[id]/page.tsx     # NUEVO E2-T2
    (app)/app/quotes/page.tsx          # NUEVO E2-T3
    (app)/app/quotes/compare/page.tsx  # NUEVO E2-T3
    (admin)/admin/layout.tsx · charges/page.tsx · settings/page.tsx   # NUEVO E2-T4
    (admin)/admin/rules/page.tsx       # NUEVO E2-T6
    api/cron/rules-import/route.ts     # NUEVO E2-T6
  components/quotes/quote-wizard.tsx   # NUEVO E2-T2 (cliente)
docs/verified/gemini-model.md · izipay.md · tariff-source.md   # NUEVO E2-T5
vercel.json                            # NUEVO E2-T6
tests/
  unit/engine/golden.test.ts · rules.test.ts   # E2-T1
  unit/verified-docs.test.ts           # E2-T5
  integration/quotes-calc.test.ts      # E2-T2
  integration/admin.test.ts            # E2-T4
  integration/rules-import.test.ts     # E2-T6
  e2e/quotes.spec.ts                   # E2-T3
  e2e/helpers.ts                       # existe (workspace), solo lectura
```

Fuera de este subárbol no se toca nada. Si una tarea parece requerirlo, detente y reporta.

## Modelo de datos tocado aquí

| Entidad | Campos que este epic agrega o lee | Notas |
|---|---|---|
| `quotes` | producto, `tariff_heading_code`, `origin_country`, `has_origin_certificate`, `importer_condition`, `dutiable_units`, `fx_pen_per_usd_e4`/`fx_date`/`fx_source`, `margins_bps`, `result`, `rule_snapshot`, `rules_as_of`, `status`, `deleted_at` | el esquema ya existe (E1-T2) |
| `quote_lines`, `quote_cost_lines`, `quote_supplier_terms` | escritos por el asistente | `quote_cost_lines.in_cif ⇒ origin='international' ∧ igv_applicable` |
| `quote_stages`, `quote_tax_breakdown` | reemplazados en cada cálculo | 6 etapas; una fila por línea tributaria |
| `default_local_charges`, `tax_rates`, `plans`, `audit_events` | escritos por admin | historial: filas nuevas, nunca updates de importe |
| `rule_import_runs`, `staging_tariff_headings`, `staging_tariff_rates`, `tariff_headings`, `tariff_rates` | importación y publicación | publicar cierra `effective_to` de la versión anterior |

## Contratos

**Consumidos:**

| De | Interfaz | Garantía |
|---|---|---|
| `01-fundacion` | `requireActor`, `ownedQuoteOrThrow`, `requireAdmin`, `AppError`, `logger`, `reportError`, `hit` | ajeno = `NOT_FOUND`; límites en Postgres |
| `01-fundacion` | `resolveRules`, `searchHeadings`, `currentLocalCharges`, `listPerceptionConditions` | reglas vigentes con `{ table, id, effectiveFrom, sourceUrl }` |
| `01-fundacion` | `createQuote`, `getQuote`, `listQuotes`, `softDeleteQuote`; `seed(db)` | cuotas y código `COT-` |
| `01-fundacion` | `Copy<T>`, utilidades CSS `btn`, `input`, `card`, `table-base`, `badge` | tokens |

**Producidos:**

| Export | Firma | Usado por |
|---|---|---|
| `src/lib/engine/calculate.ts` → `calculateQuote` | `(input: EngineInput) => EngineResult` (lanza `EngineInputError`) | E3-T4 (PDF) |
| `src/lib/engine/money.ts` → `roundDiv`, `applyBps`, `toPen`, `toUsd`, `formatMinor`, `formatUsd`, `formatPen` | enteros | UI, PDF |
| `src/server/quotes/service.ts` → `calculateQuote(actor, quoteId)`, `saveCostLines`, `confirmHeading`, `compareQuotes`… | resultado persistido + snapshot | E3 |
| `src/app/(app)/app/quotes/actions.ts` → `suggestHeadingsAction` | hoy devuelve `UPSTREAM_UNAVAILABLE`; E3-T3 lo conecta | E3-T3 |
| `src/server/rules/import.ts` → `runImport`, `csvAdapter`, `officialAdapter`, `publishRun`, `discardRun` | ver E2-T6 | admin |
| `docs/verified/*.md` | front matter definido en E2-T5 | E3-T2, E3-T5, E2-T6 |

## Convenciones que muerden en esta área

- El motor es puro: nada de `@/server`, `@/db`, `node:*`, `fetch`. Ninguna tasa literal: todo llega en `EngineInput`.
- Dinero en enteros (centavos USD), tasas en bps, TC en PEN×10 000, redondeo mitad hacia arriba por línea. Nunca `toFixed`, `Intl` ni flotantes en montos.
- Montos en UI siempre con `formatUsd`/`formatPen` de `src/lib/engine/money.ts`.
- Transporte delgado: actions validan con Zod y llaman al servicio; el servicio usa `ownedQuoteOrThrow`.
- Admin no-admin = `NOT_FOUND`. Ninguna regla se publica sin acción del admin.

Reglas completas: `CLAUDE.md`. Por área: `.claude/rules/engine.md`, `server.md`, `ui.md`, `testing.md`.

---

## Tasks

### `E2-T1` — Motor de cálculo puro con pruebas golden

**Depends on:** `E1-T1` · **Priority:** p0

Contrato en `src/lib/engine/types.ts` (escríbelo tal cual):

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

Reglas (`calculate.ts`, `money.ts`): (1) `roundDiv(a, b) = Math.floor((2a + b) / (2b))` con
`Number.isSafeInteger`; `applyBps(base, bps) = roundDiv(base·bps, 10000)`; `toPen(usd, fx) =
roundDiv(usd·fx, 10000)`; `toUsd(pen, fx) = roundDiv(pen·10000, fx)`; `formatMinor(1733230) =
"17,332.30"` (aritmética entera), `formatUsd` → `"$17,332.30"`, `formatPen` → `"S/ 60,663.05"`.
(2) Líneas PEN → `toUsd` una vez; FOB = Σ ítems; CIF = FOB + Σ `inCif`. (3) DUA: cada tarifa según
`base` (`cif`; `fob`; `cif_plus_duties` = CIF + derechos previos; `per_unit` = `dutiableUnits ×
amountPerUnitMinor`); exonerada si un acuerdo del país incluye el `kind` y (no requiere certificado o
hay certificado) → 0, `exempted=true`, `exemptionReason="agreement:<id>"`; tasa de despacho =
`toUsd(amountMinorPen)`. (4) Base IGV importación = CIF + derechos con `inIgvBase`; IGV e IPM de
importación en líneas separadas. (5) IGV e IPM por cada línea `inCif=false ∧ igvApplicable`.
(6) `logisticMinor` = líneas no `management_fee`; `dutiesMinor` = derechos + tasa de despacho;
`purchaseTaxesMinor` = `dutiesMinor` + IGV/IPM importación + IGV/IPM de líneas no-gestión;
`managementFeeMinor` = líneas de gestión + su IGV/IPM. (7) Percepción = `applyBps(CIF + dutiesMinor
+ IGV/IPM importación, rateBps)`. (8) `totalWithoutIgvMinor` = FOB + logístico + `dutiesMinor` +
líneas de gestión; `totalWithIgvMinor` = + todo IGV/IPM; `totalMinor` = + percepción. (9)
`factorPpm = roundDiv(total·1e6, FOB)`; costo unitario = `roundDiv(item·total, FOB·quantity)`;
escenarios: `roundDiv(unitCost·(10000+m), 10000)`, total = Σ precio·cantidad. (10) Etapas: 1 =
`applyBps(FOB, advanceBps)`; 2 = 0 (días producción); 3 = FOB − etapa 1 (días coordinación); 4 = 0
(días tránsito); 5 = logístico + compra + percepción; 6 = gestión; PEN con `toPen` una vez.
Validaciones → `EngineInputError`: FOB > 0, `advanceBps` en [0, 10000], `penPerUsdE4 > 0`,
`inCif ⇒ origin='international' ∧ igvApplicable`. (11) `snapshot` = `RuleRef` usados sin duplicados.

`golden.test.ts` usa exactamente esta entrada:

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

Aserciones golden: FOB 1200000 · CIF 1294000 · logístico 141720 · IGV importación 200570 · IPM
importación 32350 · compra 241510 · percepción 0 · gestión 150000 · sin IGV 1491720 · total 1733230 ·
factor 1444358 ppm · costo unitario 1733230 · escenarios 1906553 / 2079876 / 2339861 · etapas 360000,
0, 840000, 0, 383230, 150000 · PEN total 6066305, etapa 1 1260000, etapa 3 2940000, etapa 5 1341305,
etapa 6 525000, compra 845285. Caso 2: + línea `{ id: "l6", conceptCode: "origin_fob_charges", label:
"Gastos FOB en origen", group: "origin_freight", origin: "international", igvApplicable: false, inCif:
false, amountMinor: 85_714, currency: "USD" }` → compra 241510, IGV/IPM de `l6` 0, CIF 1294000,
logístico 227434, total 1818944, etapa 5 468944; un 18 % plano sobre FOB + logístico daría 256938.
`rules.test.ts`: (a) ad valorem 600 bps con acuerdo CN que exonera `ad_valorem` y requiere
certificado: con certificado 0 + `exemptionReason="agreement:<id>"`; sin certificado 77640, IGV
importación 212604, IPM importación 34291; (b) percepción 350 bps sobre la golden → 53442; (c) línea
`local_soles` 35000 PEN con TC 35000 → 10000 USD; (d) Σ etapas = total y todo `Number.isInteger`;
(e) `inCif=true` con `origin='local'` → `EngineInputError`. Tres diferencias de un céntimo frente a la
referencia, intencionales: total S/ 60,663.04 vs 60,663.05, IGV compra S/ 8,452.84 vs 8,452.85, etapa 5
S/ 13,413.04 vs 13,413.05. Causa: la referencia convirtió el IGV compra sin redondear (2,415.096 USD ×
3.5); este motor convierte una sola vez al final desde centavos enteros (241510 × 3.5 = 845285).

**Files**
- `src/lib/engine/types.ts` — nuevo
- `src/lib/engine/money.ts` — nuevo
- `src/lib/engine/calculate.ts` — nuevo
- `tests/unit/engine/golden.test.ts` — nuevo
- `tests/unit/engine/rules.test.ts` — nuevo

**Acceptance**

1. **WHEN** `calculateQuote` procesa la entrada golden BG-880 **THE SYSTEM SHALL** devolver en centavos de USD FOB 1200000, logístico 141720, tributos de compra 241510, gestión 150000 y total 1733230.
2. **WHEN** se lee ese mismo resultado golden **THE SYSTEM SHALL** devolver las etapas 1, 3, 5 y 6 iguales a 360000, 840000, 383230 y 150000, y un total en PEN de 6066305 con `penPerUsdE4=35000`.
3. **WHEN** la entrada golden recibe la línea internacional `Gastos FOB en origen` de 85714 con `inCif=false` e `igvApplicable=false` **THE SYSTEM SHALL** mantener los tributos de compra en 241510, cobrar 0 de IGV en esa línea y devolver un total de 1818944.
4. **WHEN** el país de origen tiene un acuerdo que exonera `ad_valorem` y el usuario declara certificado de origen **THE SYSTEM SHALL** fijar el ad valorem en 0 con el id de la regla del acuerdo en su explicación, y sin certificado SHALL cobrar 77640 con una tasa de 600 bps.
5. **WHEN** se calcula cualquier entrada válida de las pruebas **THE SYSTEM SHALL** devolver etapas cuya suma es igual al total y solo montos enteros.
6. **WHEN** `grep` busca en `src/lib/engine` importaciones de `@/server`, `@/db`, `node:` o llamadas a `fetch(` **THE SYSTEM SHALL** no encontrar ninguna.

**Verify**

```bash
pnpm test tests/unit/engine
status=0; grep -rnE 'from "@/(server|db)|from "node:|fetch\(' src/lib/engine || status=$?; test "$status" -eq 1
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: motor de cálculo"
git tag step-07-engine
```

### `E2-T2` — Cotizador: producto, partida, costos y cálculo

**Depends on:** `E1-T4`, `E1-T5`, `E1-T6`, `E2-T1` · **Priority:** p0

Servicio (edita `src/server/quotes/service.ts`): `updateProduct` (título, descripción, cliente, país
de origen, certificado, condición del importador, unidades), `saveItems`, `confirmHeading(code)`
(debe existir vigente en `tariff_headings`; si no `VALIDATION` y conserva la anterior),
`applyDefaultCharges` (copia `currentLocalCharges(hoy)` si no hay líneas), `saveCostLines` (Zod,
enteros ≥ 0; `inCif ⇒ origin='international' ∧ igvApplicable` o `VALIDATION` sin guardar),
`saveSupplierTerms` (`advance_bps + balance_bps = 10000` o `VALIDATION`), `saveFx` (TC > 0, fecha y
fuente), `calculateQuote(actor, quoteId)`: requiere partida, ≥ 1 ítem, TC (sin TC → `VALIDATION` cuyo
mensaje nombra `fx`), términos válidos; resuelve reglas a la fecha UTC de hoy (`CONFLICT` si faltan);
corre el motor; en una transacción escribe `result`, `rule_snapshot`, `rules_as_of`, `calculated_at`,
`status='calculated'` y reemplaza `quote_stages` (6) y `quote_tax_breakdown` (una por `TaxLine`).
Actions (`actions.ts`): `createQuoteAction` llega en E2-T3; aquí `updateProductAction`,
`searchHeadingsAction`, `suggestHeadingsAction` (devuelve `{ ok: false, error: { code:
"UPSTREAM_UNAVAILABLE", message: "IA no disponible" } }` hasta E3-T3), `confirmHeadingAction`,
`saveItemsAction`, `saveCostLinesAction`, `saveSupplierTermsAction`, `saveFxAction`,
`calculateQuoteAction` — Zod, `requireActor()`, resultado tipado, `revalidatePath`. Página `[id]`:
carga la cotización propia (`notFound()` si ajena), `?paso=producto|partida|costos|resultado`.
`quote-wizard.tsx` (`"use client"`): Producto; Partida (búsqueda manual + "Sugerir con IA" con
mensaje de degradación); Costos y términos (líneas con `origin`, `igv_applicable`, `in_cif`, moneda;
TC con fecha y fuente; adelanto/saldo y plazos; condición del importador; certificado); Resultado
(Factura FOB, Monto logístico + destino, IGV compra, Percepción, Gestión, Total en USD y PEN; factor;
costo unitario; escenarios 10/20/35 % rotulados "margen sobre el costo"; 6 etapas; desglose con regla,
vigencia, fuente y motivo de exoneración; badge "tasa no verificada" si alguna regla es `unverified`;
aviso "Estimación referencial. No es una liquidación oficial de aduanas. Reglas vigentes al
AAAA-MM-DD." / "Reference estimate. Not an official customs assessment. Rules in force as of
YYYY-MM-DD."). Test: `seed(db)` en `beforeAll`, usuario verificado, actor directo.

**Files**
- `src/server/quotes/service.ts` — edición
- `src/app/(app)/app/quotes/actions.ts` — nuevo
- `src/app/(app)/app/quotes/[id]/page.tsx` — nuevo
- `src/components/quotes/quote-wizard.tsx` — nuevo
- `tests/integration/quotes-calc.test.ts` — nuevo

**Acceptance**

1. **WHEN** se calcula una cotización con las reglas demo sembradas **THE SYSTEM SHALL** persistir `result`, una fila de `quote_stages` por cada etapa 1–6 y una fila de `quote_tax_breakdown` por cada componente tributario, todas del dueño de la cotización.
2. **WHEN** se relee una cotización calculada **THE SYSTEM SHALL** devolver un snapshot de reglas con tabla, `id`, `effective_from` y `source_url` de cada regla usada.
3. **WHEN** se guarda una línea de costo con `inCif=true` y `origin='local'` **THE SYSTEM SHALL** devolver `VALIDATION` (HTTP 422) y no guardar nada.
4. **WHEN** se guardan términos del proveedor cuyo adelanto y saldo no suman 10000 bps **THE SYSTEM SHALL** devolver `VALIDATION`.
5. **WHEN** se confirma una partida ausente de `tariff_headings` **THE SYSTEM SHALL** devolver `VALIDATION` y conservar la partida anterior.
6. **WHEN** se calcula sin tipo de cambio **THE SYSTEM SHALL** devolver `VALIDATION` con un mensaje que nombra `fx`.

**Verify**

```bash
pnpm db:up
pnpm test tests/integration/quotes-calc.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: cotizador"
git tag step-08-quote-wizard
```

### `E2-T3` — Listado, comparación y borrado lógico

**Depends on:** `E2-T2` · **Priority:** p1

Servicio: `compareQuotes(actor, ids)` (2–3 ids propios). Actions: `createQuoteAction` (redirige a
`/app/quotes/<id>?paso=producto`; `QUOTA_EXCEEDED` → mensaje con enlace a `/app/billing`) y
`deleteQuoteAction` (confirmación en `<dialog>`). `/app/quotes`: `h1` "Cotizaciones", tabla (código
`COT-`, título, estado, total USD, fecha), paginación por cursor, estado vacío exacto "Aún no tienes
cotizaciones", botón "Nueva cotización", casillas + botón "Comparar". `/app/quotes/compare?ids=`: una
columna por cotización (total, factor, tributos de compra); id ajeno → `notFound()`. Spec: usa
`signUpAndVerify`, `grantActiveSubscription` (para la segunda cotización), `quoteDeletedAt`; en costos
fija TC 3.50 con fecha y fuente.

**Files**
- `src/server/quotes/service.ts` — edición
- `src/app/(app)/app/quotes/page.tsx` — nuevo
- `src/app/(app)/app/quotes/compare/page.tsx` — nuevo
- `src/app/(app)/app/quotes/actions.ts` — edición
- `tests/e2e/quotes.spec.ts` — nuevo

**Acceptance**

1. **WHEN** una cuenta nueva verificada abre `/app/quotes` **THE SYSTEM SHALL** mostrar el texto `Aún no tienes cotizaciones` y un botón `Nueva cotización`.
2. **WHEN** esa cuenta crea una cotización, ingresa un ítem de factura de 12000.00 USD, confirma la partida `8477300000`, fija el tipo de cambio 3.50 y calcula **THE SYSTEM SHALL** mostrar el resultado con el total en USD y en PEN.
3. **WHEN** la cuenta vuelve a `/app/quotes` **THE SYSTEM SHALL** listar esa cotización con su código `COT-`.
4. **WHEN** la cuenta borra la cotización **THE SYSTEM SHALL** quitarla del listado y conservar la fila con `deleted_at` informado.
5. **WHEN** se abren dos cotizaciones propias en `/app/quotes/compare?ids=<a>,<b>` **THE SYSTEM SHALL** mostrar una columna por cotización con total, factor y tributos de compra.

**Verify**

```bash
pnpm db:up
pnpm test:e2e tests/e2e/quotes.spec.ts
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: listado y comparación"
git tag step-09-quote-list
```

### `E2-T4` — Panel admin: gastos locales, tasas y plan

**Depends on:** `E1-T5`, `E1-T6` · **Priority:** p1

`admin/service.ts` (todo empieza con `requireAdmin(actor)`): `saveLocalCharge` (fila nueva con
`valid_from`; nunca actualiza la anterior), `listLocalCharges`, `saveTaxRate` (exige `source_url` y
`effective_from`; en transacción cierra `effective_to` de la vigente anterior del mismo `kind`;
`reviewed_by` = admin), `markVerified(table, id)` (solo si `source_url` empieza con `https://`, si no
`VALIDATION`), `savePlan` (precios PEN/USD, cuota, activo; `audit_events` `plan.updated`). Layout
admin: `requireUser()` + `requireAdmin` → `notFound()`; nav Gastos / Tasas y plan / Reglas. Páginas:
gasto vigente por concepto + "Nueva semana"; tasas por `kind` con historial y verificación; plan.
Test (regla de tablas globales): gastos con `concept_code` `test_<uuid>` y `valid_from` únicos con año
≥ 2099; tasas solo de `kind` `uit` o `tasa_despacho` con dos `effective_from` únicos con año ≥ 2099 y
`source_url` `https://`; `markVerified` sobre sus propias filas, nunca sobre filas `seed://demo`.

**Files**
- `src/server/admin/service.ts` — nuevo
- `src/app/(admin)/admin/layout.tsx` — nuevo
- `src/app/(admin)/admin/charges/page.tsx` — nuevo
- `src/app/(admin)/admin/settings/page.tsx` — nuevo
- `tests/integration/admin.test.ts` — nuevo

**Acceptance**

1. **WHEN** `requireAdmin` se ejecuta para un actor con `role='user'` **THE SYSTEM SHALL** lanzar `NOT_FOUND`.
2. **WHEN** un admin guarda un gasto local con un `valid_from` nuevo **THE SYSTEM SHALL** insertar una fila nueva, conservar la anterior, y `currentLocalCharges` en esa fecha SHALL devolver el monto nuevo.
3. **WHEN** un admin guarda una tasa tributaria **THE SYSTEM SHALL** exigir `source_url` y `effective_from`, cerrar el `effective_to` de la fila anterior en el nuevo `effective_from` y fijar `reviewed_by` con el id del admin.
4. **WHEN** un admin edita el precio o la cuota del plan **THE SYSTEM SHALL** persistir el cambio y escribir una fila en `audit_events` con el admin como actor.
5. **WHEN** un admin marca una tasa como verificada **THE SYSTEM SHALL** guardar `verification_status='verified'` solo si `source_url` empieza con `https://`.

**Verify**

```bash
pnpm db:up
pnpm test tests/integration/admin.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: panel admin"
git tag step-10-admin
```

### `E2-T5` — Compuerta de hechos externos: Gemini, Izipay, arancel

**Depends on:** `E1-T1` · **Priority:** p0

Lee las fuentes oficiales (WebFetch) y escribe un archivo por hecho. Formato exacto: primera línea
`---`; una línea `clave: valor` por cada clave común (`topic`, `status`, `checked_on`, `source_url`)
y por cada clave extra de la tabla; una línea `---`; después, citas textuales cortas de la fuente que
respaldan cada valor. `checked_on` es la fecha real de lectura (`AAAA-MM-DD`); `status` es `verified`
o `deferred`. No inventes nada. `.claude/settings.json` ya autoriza `WebFetch` para `ai.google.dev`,
`secure.micuentaweb.pe`, `developers.izipay.pe`, `www.sunat.gob.pe`, `www.aduanet.gob.pe` y `www.gob.pe`.

| Archivo | `topic` | Fuente (verificar antes de usar: si no responde, buscar desde la portada del mismo dominio) | Claves extra si `status: verified` |
|---|---|---|---|
| `docs/verified/gemini-model.md` | `gemini-model` | https://ai.google.dev/gemini-api/docs/models | `model_id`, `supports_pdf_input: yes`, `supports_json_schema: yes`, `decision` |
| `docs/verified/izipay.md` | `izipay` | https://secure.micuentaweb.pe/doc/es-PE/ y https://developers.izipay.pe/ | `recurring_supported` (yes/no), `usd_supported` (yes/no), `ipn_signature` (algoritmo, campos y clave), `integration: hosted_redirect`, `mode` (`recurring` o `manual_renewal`), `decision` |
| `docs/verified/tariff-source.md` | `tariff-source` | https://www.aduanet.gob.pe/itarancel/arancelS01Alias ; https://www.sunat.gob.pe/ ; https://www.gob.pe/mef | `machine_readable` (yes/no), `format` (csv, xlsx, html, pdf o none), `fallback: csv_upload`, `decision` |

**Si una fuente no se puede leer, la compuerta no pasa sola:** detente y reporta al dueño. Solo con su
aceptación explícita escribe `status: deferred`, `next_action` (qué hacer y quién) y `owner_ack` con la
fecha ISO de esa aceptación. `deferred` bloquea a los dependientes: `E3-T2` (y con él `E3-T3`) exige
`status: verified` en `gemini-model.md` y `E3-T5` lo exige en `izipay.md` (primera línea de su
`Verify`); `tariff-source` puede quedar `deferred` y `E2-T6` usa solo el CSV manual. Si Izipay no
soporta recurrencia, `mode: manual_renewal`. Test (`node:fs`, parser propio, Zod): comunes `topic`,
`status` (`verified|deferred`; cualquier otro valor falla), `checked_on` (`^\d{4}-\d{2}-\d{2}$`),
`source_url` (`^https://`); por topic según la tabla; `deferred` exige `next_action` y `owner_ack`
(`^\d{4}-\d{2}-\d{2}$`).

**Files**
- `docs/verified/gemini-model.md` — nuevo
- `docs/verified/izipay.md` — nuevo
- `docs/verified/tariff-source.md` — nuevo
- `tests/unit/verified-docs.test.ts` — nuevo

**Acceptance**

1. **WHEN** se ejecuta `pnpm test tests/unit/verified-docs.test.ts` **THE SYSTEM SHALL** encontrar los tres archivos de `docs/verified/` con las claves de front matter `topic`, `status`, `checked_on` (fecha ISO) y `source_url` (URL https) y terminar con código 0.
2. **WHEN** `docs/verified/gemini-model.md` tiene `status: verified` **THE SYSTEM SHALL** exigir un `model_id` no vacío junto con `supports_pdf_input: yes` y `supports_json_schema: yes`.
3. **WHEN** `docs/verified/izipay.md` tiene `status: verified` **THE SYSTEM SHALL** exigir `recurring_supported`, `usd_supported`, `ipn_signature` y `mode`, con `mode` igual a `recurring` o `manual_renewal`.
4. **WHEN** `docs/verified/tariff-source.md` tiene `status: verified` **THE SYSTEM SHALL** exigir `machine_readable` y `format`.
5. **WHEN** alguno de los tres archivos no tiene `status: verified` **THE SYSTEM SHALL** fallar la prueba salvo que tenga `status: deferred` con un `next_action` no vacío y `owner_ack` con la fecha ISO en que el dueño aceptó el aplazamiento.

**Verify**

```bash
pnpm test tests/unit/verified-docs.test.ts
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: compuerta de hechos externos"
git tag step-11-external-facts
git ls-files --error-unmatch docs/verified/gemini-model.md
git ls-files --error-unmatch docs/verified/izipay.md
git ls-files --error-unmatch docs/verified/tariff-source.md
```

### `E2-T6` — Importación de reglas: staging, diff, CSV y cron

**Depends on:** `E2-T4`, `E2-T5` · **Priority:** p1

Formato CSV (UTF-8, coma, cabecera obligatoria, comillas RFC 4180; una fila por derecho):

```csv
heading_code,description_es,description_en,kind,base,rate_bps,amount_per_unit_minor,unit,in_igv_base,effective_from,source_url
8477300000,"Máquinas para moldear por soplado","Blow moulding machines",ad_valorem,cif,0,,,true,2026-01-01,https://example.gob.pe/arancel
```

Validación: `heading_code` `^\d{10}$`; descripciones no vacías; `kind` ∈ `ad_valorem, sobretasa,
antidumping, derecho_especifico, isc`; `base` ∈ `cif, fob, cif_plus_duties, per_unit`; `rate_bps`
entero ≥ 0 (obligatorio salvo `per_unit`); `amount_per_unit_minor` y `unit` obligatorios con
`per_unit`; `in_igv_base` `true|false`; `effective_from` `YYYY-MM-DD`; `source_url` `https://`.
`import.ts`: `TariffSourceAdapter.fetchRows()` → `{ status: "ok", rows, sourceUrl } | { status:
"unavailable", reason }`; `csvAdapter(text, label)` (parser propio); `officialAdapter()` según
`docs/verified/tariff-source.md` (`machine_readable: yes` → descarga `TARIFF_SOURCE_URL` y normaliza;
si no → `unavailable`). `runImport({ adapter, source, triggeredBy, reportError, now })`: crea corrida;
cualquier fila inválida → `failed`, `error="línea N: …"`, nada en staging; diff de cada (partida,
derecho) contra su versión publicada más reciente, sea cual sea su vigencia (`added`, `changed`, `unchanged`; `removed` solo en fuentes `official` completas); `diff_summary`;
`staged`. `unavailable` → `failed` + `logger.error` + `reportError` una vez. `publishRun(actor, runId)`
(admin, transacción: inserta con `reviewed_by`, cierra `effective_to` previo, `published`),
`discardRun`. Cron `GET`: `Authorization: Bearer ${requireEnv("CRON_SECRET")}` en tiempo constante o
401 sin corrida. Página admin: corridas, diff, Publicar/Descartar, subida CSV. `vercel.json`:
`{ "regions": ["gru1"], "crons": [{ "path": "/api/cron/rules-import", "schedule": "0 6 * * *" }] }`.
Test re-ejecutable (regla de tablas globales, abajo): genera por corrida dos partidas `"99"` + 8
dígitos aleatorios (H1, H2) y fechas `effective_from` únicas con año ≥ 2099; nunca toca `8477300000`
ni filas `seed://demo`. Primero pone en staging y publica un CSV con H1 (criterio 2); luego un CSV con
H2 (→ `added`) y H1 con otra tasa (→ `changed`) y verifica que las tablas publicadas no cambian
(criterio 1); CSV inválido; adaptador `unavailable` con `reportError` espía; `GET` sin cabecera;
`vercel.json` leído con `node:fs`.

**Files**
- `src/server/rules/import.ts` — nuevo
- `src/app/api/cron/rules-import/route.ts` — nuevo
- `src/app/(admin)/admin/rules/page.tsx` — nuevo
- `vercel.json` — nuevo
- `tests/integration/rules-import.test.ts` — nuevo

**Acceptance**

1. **WHEN** se pone en staging un CSV con cabecera `heading_code,description_es,description_en,kind,base,rate_bps,amount_per_unit_minor,unit,in_igv_base,effective_from,source_url` que trae una partida nueva y una tasa cambiada **THE SYSTEM SHALL** crear una fila en `rule_import_runs` con estado `staged`, filas de staging marcadas `added` y `changed`, y no modificar `tariff_headings` ni `tariff_rates`.
2. **WHEN** un admin publica esa corrida **THE SYSTEM SHALL** copiar las filas de staging a las tablas publicadas con `reviewed_by` igual al id del admin y marcar la corrida como `published`.
3. **WHEN** una fila del CSV trae un código de partida mal formado o una tasa negativa **THE SYSTEM SHALL** marcar la corrida `failed` con el número de línea en `error` y no poner nada en staging.
4. **WHEN** se llama `GET /api/cron/rules-import` sin `Authorization: Bearer <CRON_SECRET>` **THE SYSTEM SHALL** responder 401 y no crear ninguna corrida.
5. **WHEN** el adaptador oficial reporta la fuente no disponible **THE SYSTEM SHALL** marcar la corrida `failed`, registrar un log de nivel `error` y llamar una vez al reporte de errores.
6. **WHEN** se lee `vercel.json` **THE SYSTEM SHALL** contener un cron con `path` igual a `/api/cron/rules-import`.

**Verify**

```bash
pnpm db:up
pnpm test tests/integration/rules-import.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T6: importación de reglas"
git tag step-12-rules-import
```

---

## Epic acceptance

El epic está hecho cuando toda tarea está `done` **y**:

1. **WHEN** `pnpm test` corre completo con Postgres arriba **THE SYSTEM SHALL** terminar con código 0, incluidas las pruebas golden del motor.
2. **WHEN** `pnpm test:e2e tests/e2e/quotes.spec.ts` corre **THE SYSTEM SHALL** completar crear → calcular → listar → comparar → borrar con código 0.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e tests/e2e/quotes.spec.ts
```

## Pitfalls

- **18 % plano** — el IGV es por línea; el caso de `Gastos FOB en origen` lo detecta.
- **Ajustar el golden para que pase** — los números son el contrato; corrige el motor.
- **Leer reglas fuera de `resolveRules`** — rompe el snapshot y la vigencia.
- **Publicar automáticamente** — el cron solo pone en staging; publica un humano.
- **Inventar el id de Gemini o el algoritmo de Izipay** — si la fuente no se lee, detente; `deferred` solo con `owner_ack` del dueño.

## Antes de seguir

- [ ] Cada tarea de este epic está `done` en `tasks.json`; ninguna `in_progress`.
- [ ] Cada comando `verify` de cada tarea pasó, no solo el primero.
- [ ] Ningún `verify` se editó ni se omitió por un archivo inexistente.
- [ ] Cada tarea tiene su tag (`step-07-engine` … `step-12-rules-import`).
- [ ] El gate pasa limpio desde la raíz.
- [ ] Cada contrato "Producido" existe con la firma indicada.
- [ ] Ningún archivo fuera del subárbol fue modificado.
- [ ] `.env.example` no cambia: `CRON_SECRET` y `TARIFF_SOURCE_URL` ya están.
- [ ] Un commit por tarea, con su id, seguido de su tag.
