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
    agreements: (RuleRef & {
      agreementCode: string;
      exemptKinds: TariffRateRule["kind"][];
      requiresOriginCertificate: boolean;
    })[];
  };
  perception: RuleRef & { conditionCode: string; rateBps: Bps };
  terms: {
    advanceBps: Bps;
    productionDays: [number, number];
    shippingCoordinationDays: number;
    transitDays: [number, number];
  };
  marginsBps: Bps[];
};
export type TaxLine = {
  component:
    | "ad_valorem"
    | "sobretasa"
    | "antidumping"
    | "derecho_especifico"
    | "isc"
    | "igv"
    | "ipm"
    | "tasa_despacho"
    | "percepcion";
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
  fobMinor: Minor;
  cifMinor: Minor;
  logisticMinor: Minor;
  dutiesMinor: Minor;
  purchaseTaxesMinor: Minor;
  perceptionMinor: Minor;
  managementFeeMinor: Minor;
  totalWithoutIgvMinor: Minor;
  totalWithIgvMinor: Minor;
  totalMinor: Minor;
  factorPpm: number;
  pen: {
    fobMinor: Minor;
    logisticMinor: Minor;
    purchaseTaxesMinor: Minor;
    perceptionMinor: Minor;
    managementFeeMinor: Minor;
    totalMinor: Minor;
  };
  taxLines: TaxLine[];
  items: { id: string; unitCostMinor: Minor; totalCostMinor: Minor }[];
  scenarios: {
    marginBps: Bps;
    totalMinor: Minor;
    items: { id: string; unitPriceMinor: Minor }[];
  }[];
  stages: Stage[];
  snapshot: RuleRef[];
  fx: EngineInput["fx"];
};
