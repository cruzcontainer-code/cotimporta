import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/engine/calculate";
import { formatMinor, formatPen, formatUsd } from "@/lib/engine/money";
import type { CostLine, EngineInput } from "@/lib/engine/types";

// Contrato: entrada golden de la cotización de referencia BG-880 (blueprint §9 paso 7).
const rule = (table: string, id: string) => ({
  table,
  id,
  effectiveFrom: "2026-01-01",
  sourceUrl: "fixture://golden",
});
const golden: EngineInput = {
  fx: { penPerUsdE4: 35_000, date: "2026-10-29", source: "T.C. referencial COT-2026-BG880" },
  items: [
    {
      id: "item-1",
      description: "Planta BG-880 + set auxiliar + 5 moldes",
      quantity: 1,
      totalMinor: 1_200_000,
    },
  ],
  costLines: [
    {
      id: "l1",
      conceptCode: "intl_freight",
      label: "Flete marítimo internacional",
      group: "origin_freight",
      origin: "international",
      igvApplicable: true,
      inCif: true,
      amountMinor: 90_000,
      currency: "USD",
    },
    {
      id: "l2",
      conceptCode: "intl_insurance",
      label: "Seguro internacional",
      group: "origin_freight",
      origin: "international",
      igvApplicable: true,
      inCif: true,
      amountMinor: 4_000,
      currency: "USD",
    },
    {
      id: "l3",
      conceptCode: "customs_agency",
      label: "Agenciamiento y desaduanaje",
      group: "other_charges",
      origin: "local",
      igvApplicable: true,
      inCif: false,
      amountMinor: 25_000,
      currency: "USD",
    },
    {
      id: "l4",
      conceptCode: "warehouse",
      label: "Almacén y visto bueno",
      group: "other_charges",
      origin: "local",
      igvApplicable: true,
      inCif: false,
      amountMinor: 12_720,
      currency: "USD",
    },
    {
      id: "l5",
      conceptCode: "local_transport",
      label: "Transporte local",
      group: "other_charges",
      origin: "local",
      igvApplicable: true,
      inCif: false,
      amountMinor: 10_000,
      currency: "USD",
    },
    {
      id: "fee",
      conceptCode: "management_fee",
      label: "Gestión comercial y despacho",
      group: "management_fee",
      origin: "local",
      igvApplicable: false,
      inCif: false,
      amountMinor: 150_000,
      currency: "USD",
    },
  ],
  dutiableUnits: 1,
  heading: {
    code: "8477300000",
    rates: [
      {
        ...rule("tariff_rates", "av"),
        kind: "ad_valorem",
        base: "cif",
        rateBps: 0,
        amountPerUnitMinor: null,
        inIgvBase: true,
      },
    ],
  },
  taxes: {
    igv: { ...rule("tax_rates", "igv"), rateBps: 1_550 },
    ipm: { ...rule("tax_rates", "ipm"), rateBps: 250 },
    dispatchFee: null,
  },
  origin: { countryCode: "CN", hasOriginCertificate: false, agreements: [] },
  perception: { ...rule("perception_rules", "no-aplica"), conditionCode: "no_aplica", rateBps: 0 },
  terms: {
    advanceBps: 3_000,
    productionDays: [30, 35],
    shippingCoordinationDays: 7,
    transitDays: [30, 40],
  },
  marginsBps: [1_000, 2_000, 3_500],
};

const taxOf = (result: ReturnType<typeof calculateQuote>, component: string, scope = "dua") =>
  result.taxLines
    .filter((line) => line.component === component && line.scope === scope)
    .reduce((total, line) => total + line.amountMinor, 0);

describe("golden BG-880", () => {
  const result = calculateQuote(golden);

  it("totales en centavos de USD", () => {
    expect(result.fobMinor).toBe(1_200_000);
    expect(result.cifMinor).toBe(1_294_000);
    expect(result.logisticMinor).toBe(141_720);
    expect(taxOf(result, "igv")).toBe(200_570);
    expect(taxOf(result, "ipm")).toBe(32_350);
    expect(result.purchaseTaxesMinor).toBe(241_510);
    expect(result.perceptionMinor).toBe(0);
    expect(result.managementFeeMinor).toBe(150_000);
    expect(result.totalWithoutIgvMinor).toBe(1_491_720);
    expect(result.totalMinor).toBe(1_733_230);
  });

  it("factor, costo unitario y escenarios", () => {
    expect(result.factorPpm).toBe(1_444_358);
    expect(result.items[0]?.unitCostMinor).toBe(1_733_230);
    expect(result.scenarios.map((scenario) => scenario.totalMinor)).toEqual([
      1_906_553, 2_079_876, 2_339_861,
    ]);
  });

  it("etapas en USD y PEN", () => {
    expect(result.stages.map((stage) => stage.amountMinor)).toEqual([
      360_000, 0, 840_000, 0, 383_230, 150_000,
    ]);
    expect(result.pen.totalMinor).toBe(6_066_305);
    expect(result.pen.purchaseTaxesMinor).toBe(845_285);
    const pen = result.stages.map((stage) => stage.amountPenMinor);
    expect([pen[0], pen[2], pen[4], pen[5]]).toEqual([1_260_000, 2_940_000, 1_341_305, 525_000]);
    expect(result.stages[1]).toMatchObject({ daysMin: 30, daysMax: 35 });
    expect(result.stages[2]).toMatchObject({ daysMin: 7, daysMax: 7 });
    expect(result.stages[3]).toMatchObject({ daysMin: 30, daysMax: 40 });
  });

  it("formatos", () => {
    expect(formatMinor(1_733_230)).toBe("17,332.30");
    expect(formatUsd(1_733_230)).toBe("$17,332.30");
    expect(formatPen(6_066_305)).toBe("S/ 60,663.05");
  });

  it("snapshot sin duplicados con las reglas usadas", () => {
    const keys = result.snapshot.map((ref) => `${ref.table}:${ref.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        "tariff_rates:av",
        "tax_rates:igv",
        "tax_rates:ipm",
        "perception_rules:no-aplica",
      ]),
    );
  });
});

describe("golden + gastos FOB en origen (fuera de CIF, sin IGV)", () => {
  const originCharges: CostLine = {
    id: "l6",
    conceptCode: "origin_fob_charges",
    label: "Gastos FOB en origen",
    group: "origin_freight",
    origin: "international",
    igvApplicable: false,
    inCif: false,
    amountMinor: 85_714,
    currency: "USD",
  };
  const result = calculateQuote({ ...golden, costLines: [...golden.costLines, originCharges] });

  it("no cobra IGV a la línea y no cambia los tributos de compra", () => {
    expect(result.purchaseTaxesMinor).toBe(241_510);
    expect(result.taxLines.filter((line) => line.costLineId === "l6")).toEqual([]);
    expect(result.cifMinor).toBe(1_294_000);
    expect(result.logisticMinor).toBe(227_434);
    expect(result.totalMinor).toBe(1_818_944);
    expect(result.stages[4]?.amountMinor).toBe(468_944);
    // Un 18 % plano sobre FOB + logístico daría otro número: el motor no lo usa.
    expect(Math.round(((1_200_000 + 227_434) * 18) / 100)).toBe(256_938);
    expect(result.purchaseTaxesMinor).not.toBe(256_938);
  });
});
