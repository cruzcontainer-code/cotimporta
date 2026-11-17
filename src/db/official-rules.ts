// Reglas OFICIALES leídas en fuentes primarias (ver docs/verified/tax-rates.md, 2026-11-16).
// Las carga `pnpm db:load-official <email-admin>`; reemplazan a las filas DEMO (seed://demo).
// La tasa de despacho aduanero NO está aquí: sus fuentes se contradicen y la publica el admin.
import type { perceptionRules, tariffHeadings, tariffRates, taxRates } from "./schema.ts";

type Verified = { verificationStatus: "verified" };
const V: Verified = { verificationStatus: "verified" };

// Ley N.º 32387 (El Peruano, 16-06-2025): IPM sube 0,5 puntos por año desde 2026 hasta 4 %;
// el IGV baja en igual medida hasta 14 %. Antes de 2026: IGV 16 % e IPM 2 % (SUNAT).
const LEY_32387 = "https://busquedas.elperuano.pe/dispositivo/EX/2410141-1";
const SUNAT_TRIBUTOS = "https://www.sunat.gob.pe/orientacionaduanera/pagosgarantias/index.html";
const DS_301_2025_EF = "https://busquedas.elperuano.pe/dispositivo/NL/2469116-1";
const SUNAT_PERCEPCION = "https://orientacion.sunat.gob.pe/node/1189";
const ARANCEL_2022 =
  "https://www.sunat.gob.pe/orientacionaduanera/aranceles/2022/arancel-ad-2022.pdf";

const SCHEDULE: [from: string, to: string | null, igvBps: number, ipmBps: number, url: string][] = [
  ["2025-01-01", "2026-01-01", 1600, 200, SUNAT_TRIBUTOS],
  ["2026-01-01", "2027-01-01", 1550, 250, LEY_32387],
  ["2027-01-01", "2028-01-01", 1500, 300, LEY_32387],
  ["2028-01-01", "2029-01-01", 1450, 350, LEY_32387],
  ["2029-01-01", null, 1400, 400, LEY_32387],
];

export const officialTaxRates: (typeof taxRates.$inferInsert)[] = [
  ...SCHEDULE.flatMap(([effectiveFrom, effectiveTo, igv, ipm, sourceUrl]) => [
    { kind: "igv" as const, rateBps: igv, effectiveFrom, effectiveTo, sourceUrl, ...V },
    { kind: "ipm" as const, rateBps: ipm, effectiveFrom, effectiveTo, sourceUrl, ...V },
  ]),
  // D.S. N.º 301-2025-EF, art. 1: UIT 2026 "será de S/ 5 500,00".
  {
    kind: "uit",
    amountMinor: 550_000,
    currency: "PEN",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    sourceUrl: DS_301_2025_EF,
    ...V,
  },
];

// Arancel de Aduanas 2022, p. 362: "8477.30.00.00 - Máquinas de moldear por soplado 0".
export const officialTariffHeadings: (typeof tariffHeadings.$inferInsert)[] = [
  {
    code: "8477300000",
    descriptionEs: "Máquinas de moldear por soplado",
    descriptionEn: "Blow moulding machines",
    effectiveFrom: "2022-01-01",
    sourceUrl: ARANCEL_2022,
    ...V,
  },
];

export const officialTariffRates: (typeof tariffRates.$inferInsert)[] = [
  {
    headingCode: "8477300000",
    kind: "ad_valorem",
    base: "cif",
    rateBps: 0,
    inIgvBase: true,
    effectiveFrom: "2022-01-01",
    sourceUrl: ARANCEL_2022,
    ...V,
  },
];

// Orientación SUNAT, Régimen de percepciones – importaciones: 10 % / 5 % / 3,5 %; no se aplica a
// operaciones de agentes de retención del IGV.
const P = { headingPrefix: "", effectiveFrom: "2026-01-01", sourceUrl: SUNAT_PERCEPCION, ...V };
export const officialPerceptionRules: (typeof perceptionRules.$inferInsert)[] = [
  {
    ...P,
    conditionCode: "general",
    rateBps: 350,
    descriptionEs: "General (3,5 %)",
    descriptionEn: "General (3.5%)",
  },
  {
    ...P,
    conditionCode: "bienes_usados",
    rateBps: 500,
    descriptionEs: "Nacionaliza bienes usados (5 %)",
    descriptionEn: "Imports used goods (5%)",
  },
  {
    ...P,
    conditionCode: "primera_importacion",
    rateBps: 1000,
    descriptionEs: "Primera importación (10 %)",
    descriptionEn: "First import (10%)",
  },
  {
    ...P,
    conditionCode: "riesgo",
    rateBps: 1000,
    descriptionEs: "Sin RUC, no habido, baja o suspensión, omiso u otro supuesto del 10 %",
    descriptionEn: "No RUC, unlocatable, deregistered or other 10% case",
  },
  {
    ...P,
    conditionCode: "no_aplica",
    rateBps: 0,
    descriptionEs: "Agente de retención del IGV (no se aplica)",
    descriptionEn: "VAT withholding agent (not applicable)",
  },
];
