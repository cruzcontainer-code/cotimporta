// Filas DEMO (blueprint §4 "Datos semilla"): verification_status='unverified', source_url='seed://demo'.
// Nada de esto es oficial; el admin publica los valores reales. Solo importa tipos de ./schema.ts.
import type {
  defaultLocalCharges,
  perceptionRules,
  plans,
  tariffHeadings,
  tariffRates,
  taxRates,
  tradeAgreements,
} from "./schema.ts";

const SOURCE = "seed://demo";
const FROM_2026 = "2026-01-01";

export const seedPlans: (typeof plans.$inferInsert)[] = [
  {
    code: "mensual",
    nameEs: "Plan mensual",
    nameEn: "Monthly plan",
    pricePenMinor: 0,
    priceUsdMinor: 0,
    quotaPerPeriod: 10,
    active: false,
  },
];

export const seedTaxRates: (typeof taxRates.$inferInsert)[] = [
  {
    kind: "igv",
    rateBps: 1600,
    effectiveFrom: "2025-01-01",
    effectiveTo: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
  {
    kind: "ipm",
    rateBps: 200,
    effectiveFrom: "2025-01-01",
    effectiveTo: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
  {
    kind: "igv",
    rateBps: 1550,
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
  {
    kind: "ipm",
    rateBps: 250,
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
];

export const seedTariffHeadings: (typeof tariffHeadings.$inferInsert)[] = [
  {
    code: "8477300000",
    descriptionEs: "Máquinas para moldear por soplado (DEMO)",
    descriptionEn: "Blow moulding machines (DEMO)",
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
  {
    code: "8418690000",
    descriptionEs: "Demás equipos de refrigeración (DEMO)",
    descriptionEn: "Other refrigerating equipment (DEMO)",
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
];

export const seedTariffRates: (typeof tariffRates.$inferInsert)[] = [
  {
    headingCode: "8477300000",
    kind: "ad_valorem",
    base: "cif",
    rateBps: 0,
    inIgvBase: true,
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
  {
    headingCode: "8418690000",
    kind: "ad_valorem",
    base: "cif",
    rateBps: 600,
    inIgvBase: true,
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
];

export const seedTradeAgreements: (typeof tradeAgreements.$inferInsert)[] = [
  {
    countryCode: "CN",
    agreementCode: "TLC-PE-CN",
    nameEs: "TLC Perú–China (DEMO)",
    nameEn: "Peru–China FTA (DEMO)",
    exemptKinds: ["ad_valorem"],
    requiresOriginCertificate: true,
    headingPrefix: "",
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
];

export const seedPerceptionRules: (typeof perceptionRules.$inferInsert)[] = [
  {
    conditionCode: "no_aplica",
    headingPrefix: "",
    rateBps: 0,
    descriptionEs: "No aplica",
    descriptionEn: "Not applicable",
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
  {
    conditionCode: "general",
    headingPrefix: "",
    rateBps: 350,
    descriptionEs: "Percepción general",
    descriptionEn: "General perception",
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
  {
    conditionCode: "primera_importacion",
    headingPrefix: "",
    rateBps: 1000,
    descriptionEs: "Primera importación",
    descriptionEn: "First import",
    effectiveFrom: FROM_2026,
    sourceUrl: SOURCE,
    verificationStatus: "unverified",
  },
];

export const seedDefaultLocalCharges: (typeof defaultLocalCharges.$inferInsert)[] = [
  {
    conceptCode: "intl_freight",
    labelEs: "Flete marítimo internacional",
    labelEn: "International ocean freight",
    group: "origin_freight",
    origin: "international",
    igvApplicable: true,
    inCif: true,
    amountMinor: 90_000,
    currency: "USD",
    validFrom: FROM_2026,
  },
  {
    conceptCode: "intl_insurance",
    labelEs: "Seguro internacional",
    labelEn: "International insurance",
    group: "origin_freight",
    origin: "international",
    igvApplicable: true,
    inCif: true,
    amountMinor: 4_000,
    currency: "USD",
    validFrom: FROM_2026,
  },
  {
    conceptCode: "customs_agency",
    labelEs: "Agenciamiento y desaduanaje",
    labelEn: "Customs brokerage and clearance",
    group: "other_charges",
    origin: "local",
    igvApplicable: true,
    inCif: false,
    amountMinor: 25_000,
    currency: "USD",
    validFrom: FROM_2026,
  },
  {
    conceptCode: "warehouse",
    labelEs: "Almacén y visto bueno",
    labelEn: "Warehouse and release",
    group: "other_charges",
    origin: "local",
    igvApplicable: true,
    inCif: false,
    amountMinor: 12_720,
    currency: "USD",
    validFrom: FROM_2026,
  },
  {
    conceptCode: "local_transport",
    labelEs: "Transporte local",
    labelEn: "Local transport",
    group: "other_charges",
    origin: "local",
    igvApplicable: true,
    inCif: false,
    amountMinor: 10_000,
    currency: "USD",
    validFrom: FROM_2026,
  },
  {
    conceptCode: "origin_fob_charges",
    labelEs: "Gastos FOB en origen",
    labelEn: "Origin FOB charges",
    group: "origin_freight",
    origin: "international",
    igvApplicable: false,
    inCif: false,
    amountMinor: 0,
    currency: "USD",
    validFrom: FROM_2026,
  },
  {
    conceptCode: "management_fee",
    labelEs: "Gestión comercial y despacho",
    labelEn: "Commercial management and clearance",
    group: "management_fee",
    origin: "local",
    igvApplicable: false,
    inCif: false,
    amountMinor: 150_000,
    currency: "USD",
    validFrom: FROM_2026,
  },
];
