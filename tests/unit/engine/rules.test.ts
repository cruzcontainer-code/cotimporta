import { describe, expect, it } from "vitest";
import { calculateQuote, EngineInputError } from "@/lib/engine/calculate";
import type { EngineInput, EngineResult } from "@/lib/engine/types";

// Copia de la entrada golden de golden.test.ts (importarla duplicaría sus pruebas en este archivo).
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

const agreement = {
  table: "trade_agreements",
  id: "tlc-cn",
  effectiveFrom: "2026-01-01",
  sourceUrl: "fixture://rules",
  agreementCode: "TLC-PE-CN",
  exemptKinds: ["ad_valorem" as const],
  requiresOriginCertificate: true,
};

function withAdValorem600(hasOriginCertificate: boolean): EngineInput {
  const [adValorem] = golden.heading.rates;
  if (!adValorem) throw new Error("golden sin ad valorem");
  return {
    ...golden,
    heading: { ...golden.heading, rates: [{ ...adValorem, rateBps: 600 }] },
    origin: { countryCode: "CN", hasOriginCertificate, agreements: [agreement] },
  };
}

const dua = (result: EngineResult, component: string) =>
  result.taxLines.find((line) => line.component === component && line.scope === "dua");

function expectIntegersAndStagesSum(result: EngineResult): void {
  expect(result.stages.reduce((total, stage) => total + stage.amountMinor, 0)).toBe(
    result.totalMinor,
  );
  const amounts = [
    result.fobMinor,
    result.cifMinor,
    result.logisticMinor,
    result.dutiesMinor,
    result.purchaseTaxesMinor,
    result.perceptionMinor,
    result.managementFeeMinor,
    result.totalMinor,
    result.factorPpm,
    ...Object.values(result.pen),
    ...result.taxLines.flatMap((line) => [line.baseMinor, line.amountMinor]),
    ...result.stages.flatMap((stage) => [stage.amountMinor, stage.amountPenMinor]),
    ...result.items.flatMap((item) => [item.unitCostMinor, item.totalCostMinor]),
    ...result.scenarios.flatMap((s) => [s.totalMinor, ...s.items.map((i) => i.unitPriceMinor)]),
  ];
  expect(amounts.every(Number.isInteger)).toBe(true);
}

describe("acuerdos comerciales", () => {
  it("con certificado exonera el ad valorem y explica la regla del acuerdo", () => {
    const result = calculateQuote(withAdValorem600(true));
    expect(dua(result, "ad_valorem")).toMatchObject({
      amountMinor: 0,
      exempted: true,
      exemptionReason: "agreement:tlc-cn",
    });
    expect(result.snapshot.map((ref) => ref.id)).toContain("tlc-cn");
    expectIntegersAndStagesSum(result);
  });

  it("sin certificado cobra 600 bps sobre CIF y lo suma a la base del IGV", () => {
    const result = calculateQuote(withAdValorem600(false));
    expect(dua(result, "ad_valorem")).toMatchObject({
      amountMinor: 77_640,
      rateBps: 600,
      exempted: false,
    });
    expect(dua(result, "igv")?.amountMinor).toBe(212_604);
    expect(dua(result, "ipm")?.amountMinor).toBe(34_291);
    expectIntegersAndStagesSum(result);
  });
});

describe("percepción y moneda", () => {
  it("percepción de 350 bps sobre la golden da 53442", () => {
    const result = calculateQuote({
      ...golden,
      perception: { ...golden.perception, conditionCode: "general", rateBps: 350 },
    });
    expect(result.perceptionMinor).toBe(53_442);
    expect(result.totalMinor).toBe(1_733_230 + 53_442);
    expectIntegersAndStagesSum(result);
  });

  it("una línea local_soles de 35000 PEN con TC 35000 entra como 10000 USD", () => {
    const result = calculateQuote({
      ...golden,
      costLines: [
        ...golden.costLines,
        {
          id: "soles",
          conceptCode: "local_soles",
          label: "Gasto en soles",
          group: "local_soles",
          origin: "local",
          igvApplicable: false,
          inCif: false,
          amountMinor: 35_000,
          currency: "PEN",
        },
      ],
    });
    expect(result.logisticMinor).toBe(141_720 + 10_000);
    expectIntegersAndStagesSum(result);
  });
});

describe("invariantes y validación", () => {
  it("la golden y sus variantes suman etapas = total con solo enteros", () => {
    expectIntegersAndStagesSum(calculateQuote(golden));
    expectIntegersAndStagesSum(
      calculateQuote({
        ...golden,
        items: [
          { id: "a", description: "A", quantity: 3, totalMinor: 333_333 },
          { id: "b", description: "B", quantity: 7, totalMinor: 123_457 },
        ],
        terms: { ...golden.terms, advanceBps: 3_333 },
        taxes: {
          ...golden.taxes,
          dispatchFee: {
            table: "tax_rates",
            id: "despacho",
            effectiveFrom: "2026-01-01",
            sourceUrl: "fixture://rules",
            amountMinorPen: 12_345,
          },
        },
      }),
    );
  });

  it("inCif con origen local lanza EngineInputError", () => {
    const [freight] = golden.costLines;
    if (!freight) throw new Error("golden sin flete");
    expect(() =>
      calculateQuote({ ...golden, costLines: [{ ...freight, origin: "local" }] }),
    ).toThrow(EngineInputError);
  });

  it("rechaza FOB 0, anticipo fuera de rango y TC no positivo", () => {
    expect(() =>
      calculateQuote({
        ...golden,
        items: [{ id: "x", description: "x", quantity: 1, totalMinor: 0 }],
      }),
    ).toThrow(EngineInputError);
    expect(() =>
      calculateQuote({ ...golden, terms: { ...golden.terms, advanceBps: 10_001 } }),
    ).toThrow(EngineInputError);
    expect(() => calculateQuote({ ...golden, fx: { ...golden.fx, penPerUsdE4: 0 } })).toThrow(
      EngineInputError,
    );
  });
});
