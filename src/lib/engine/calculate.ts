import { applyBps, roundDiv, toPen, toUsd } from "@/lib/engine/money";
import type {
  CostLine,
  EngineInput,
  EngineResult,
  Minor,
  RuleRef,
  Stage,
  TaxLine,
} from "@/lib/engine/types";

/** Entrada inválida; `field` indica qué parte de EngineInput falló. */
export class EngineInputError extends Error {
  readonly field: string;

  constructor(field: string, message = `Entrada inválida: ${field}`) {
    super(message);
    this.name = "EngineInputError";
    this.field = field;
  }
}

const sum = (values: Minor[]): Minor => values.reduce((total, value) => total + value, 0);

const isNonNegativeInt = (value: number) => Number.isSafeInteger(value) && value >= 0;

function validate(input: EngineInput): void {
  if (!Number.isSafeInteger(input.fx.penPerUsdE4) || input.fx.penPerUsdE4 <= 0) {
    throw new EngineInputError("fx.penPerUsdE4");
  }
  const { advanceBps } = input.terms;
  if (!Number.isSafeInteger(advanceBps) || advanceBps < 0 || advanceBps > 10_000) {
    throw new EngineInputError("terms.advanceBps");
  }
  if (input.items.length === 0) {
    throw new EngineInputError("items");
  }
  for (const item of input.items) {
    if (
      !isNonNegativeInt(item.totalMinor) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new EngineInputError(`items.${item.id}`);
    }
  }
  for (const line of input.costLines) {
    if (!isNonNegativeInt(line.amountMinor)) {
      throw new EngineInputError(`costLines.${line.id}.amountMinor`);
    }
    if (line.inCif && (line.origin !== "international" || !line.igvApplicable)) {
      throw new EngineInputError(`costLines.${line.id}.inCif`);
    }
  }
  if (!isNonNegativeInt(input.dutiableUnits)) {
    throw new EngineInputError("dutiableUnits");
  }
  for (const rate of input.heading.rates) {
    const valid =
      rate.base === "per_unit"
        ? rate.amountPerUnitMinor !== null && isNonNegativeInt(rate.amountPerUnitMinor)
        : rate.rateBps !== null && isNonNegativeInt(rate.rateBps);
    if (!valid) {
      throw new EngineInputError(`heading.rates.${rate.id}`);
    }
  }
  for (const margin of input.marginsBps) {
    if (!isNonNegativeInt(margin)) {
      throw new EngineInputError("marginsBps");
    }
  }
}

const ruleOf = (rule: RuleRef): RuleRef => ({
  table: rule.table,
  id: rule.id,
  effectiveFrom: rule.effectiveFrom,
  sourceUrl: rule.sourceUrl,
});

export function calculateQuote(input: EngineInput): EngineResult {
  validate(input);
  const fx = input.fx.penPerUsdE4;
  const snapshot = new Map<string, RuleRef>();
  const use = (rule: RuleRef): RuleRef => {
    const ref = ruleOf(rule);
    snapshot.set(`${ref.table}:${ref.id}`, ref);
    return ref;
  };

  // (2) Líneas PEN → USD una sola vez; FOB y CIF.
  const lines: (CostLine & { usdMinor: Minor })[] = input.costLines.map((line) => ({
    ...line,
    usdMinor: line.currency === "PEN" ? toUsd(line.amountMinor, fx) : line.amountMinor,
  }));
  const fobMinor = sum(input.items.map((item) => item.totalMinor));
  if (fobMinor <= 0) {
    throw new EngineInputError("items", "El FOB debe ser mayor que 0");
  }
  const cifMinor = fobMinor + sum(lines.filter((line) => line.inCif).map((line) => line.usdMinor));

  // (3) DUA: derechos por tarifa, exoneraciones por acuerdo y tasa de despacho.
  const taxLines: TaxLine[] = [];
  let previousDuties = 0;
  let igvBaseDuties = 0;
  for (const rate of input.heading.rates) {
    const base =
      rate.base === "cif"
        ? cifMinor
        : rate.base === "fob"
          ? fobMinor
          : rate.base === "cif_plus_duties"
            ? cifMinor + previousDuties
            : input.dutiableUnits * (rate.amountPerUnitMinor ?? 0);
    const agreement = input.origin.agreements.find(
      (candidate) =>
        candidate.exemptKinds.includes(rate.kind) &&
        (!candidate.requiresOriginCertificate || input.origin.hasOriginCertificate),
    );
    const computed = rate.base === "per_unit" ? base : applyBps(base, rate.rateBps ?? 0);
    const amountMinor = agreement ? 0 : computed;
    if (agreement) {
      use(agreement);
    }
    taxLines.push({
      component: rate.kind,
      scope: "dua",
      costLineId: null,
      conceptCode: null,
      baseMinor: base,
      rateBps: rate.base === "per_unit" ? null : rate.rateBps,
      amountMinor,
      exempted: Boolean(agreement),
      exemptionReason: agreement ? `agreement:${agreement.id}` : null,
      rule: use(rate),
    });
    previousDuties += amountMinor;
    if (rate.inIgvBase) {
      igvBaseDuties += amountMinor;
    }
  }
  const dispatch = input.taxes.dispatchFee;
  const dispatchMinor = dispatch ? toUsd(dispatch.amountMinorPen, fx) : 0;
  if (dispatch) {
    taxLines.push({
      component: "tasa_despacho",
      scope: "dua",
      costLineId: null,
      conceptCode: null,
      baseMinor: dispatchMinor,
      rateBps: null,
      amountMinor: dispatchMinor,
      exempted: false,
      exemptionReason: null,
      rule: use(dispatch),
    });
  }
  const dutiesMinor = previousDuties + dispatchMinor;

  // (4) IGV e IPM de importación sobre CIF + derechos con inIgvBase.
  const { igv, ipm } = input.taxes;
  const importBase = cifMinor + igvBaseDuties;
  const igvImport = applyBps(importBase, igv.rateBps);
  const ipmImport = applyBps(importBase, ipm.rateBps);
  for (const [component, rule, amount] of [
    ["igv", igv, igvImport],
    ["ipm", ipm, ipmImport],
  ] as const) {
    taxLines.push({
      component,
      scope: "dua",
      costLineId: null,
      conceptCode: null,
      baseMinor: importBase,
      rateBps: rule.rateBps,
      amountMinor: amount,
      exempted: false,
      exemptionReason: null,
      rule: use(rule),
    });
  }

  // (5) IGV e IPM por línea local (fuera de CIF) que los soporta.
  let lineTaxesNonManagement = 0;
  let lineTaxesManagement = 0;
  for (const line of lines) {
    if (line.inCif || !line.igvApplicable) {
      continue;
    }
    for (const rule of [igv, ipm]) {
      const amount = applyBps(line.usdMinor, rule.rateBps);
      taxLines.push({
        component: rule === igv ? "igv" : "ipm",
        scope: "cost_line",
        costLineId: line.id,
        conceptCode: line.conceptCode,
        baseMinor: line.usdMinor,
        rateBps: rule.rateBps,
        amountMinor: amount,
        exempted: false,
        exemptionReason: null,
        rule: use(rule),
      });
      if (line.group === "management_fee") {
        lineTaxesManagement += amount;
      } else {
        lineTaxesNonManagement += amount;
      }
    }
  }

  // (6)–(8) Agregados.
  const managementLines = sum(
    lines.filter((l) => l.group === "management_fee").map((l) => l.usdMinor),
  );
  const logisticMinor = sum(
    lines.filter((l) => l.group !== "management_fee").map((l) => l.usdMinor),
  );
  const purchaseTaxesMinor = dutiesMinor + igvImport + ipmImport + lineTaxesNonManagement;
  const managementFeeMinor = managementLines + lineTaxesManagement;

  const perceptionBase = cifMinor + dutiesMinor + igvImport + ipmImport;
  const perceptionMinor = applyBps(perceptionBase, input.perception.rateBps);
  taxLines.push({
    component: "percepcion",
    scope: "dua",
    costLineId: null,
    conceptCode: null,
    baseMinor: perceptionBase,
    rateBps: input.perception.rateBps,
    amountMinor: perceptionMinor,
    exempted: false,
    exemptionReason: null,
    rule: use(input.perception),
  });

  const allIgvIpm = igvImport + ipmImport + lineTaxesNonManagement + lineTaxesManagement;
  const totalWithoutIgvMinor = fobMinor + logisticMinor + dutiesMinor + managementLines;
  const totalWithIgvMinor = totalWithoutIgvMinor + allIgvIpm;
  const totalMinor = totalWithIgvMinor + perceptionMinor;

  // (9) Factor, costos unitarios y escenarios de precio.
  const factorPpm = roundDiv(totalMinor * 1_000_000, fobMinor);
  const items = input.items.map((item) => {
    const unitCostMinor = roundDiv(item.totalMinor * totalMinor, fobMinor * item.quantity);
    return { id: item.id, unitCostMinor, totalCostMinor: unitCostMinor * item.quantity };
  });
  const scenarios = input.marginsBps.map((marginBps) => {
    const priced = input.items.map((item, index) => ({
      id: item.id,
      quantity: item.quantity,
      unitPriceMinor: roundDiv((items[index]?.unitCostMinor ?? 0) * (10_000 + marginBps), 10_000),
    }));
    return {
      marginBps,
      totalMinor: sum(priced.map((item) => item.unitPriceMinor * item.quantity)),
      items: priced.map(({ id, unitPriceMinor }) => ({ id, unitPriceMinor })),
    };
  });

  // (10) Etapas de pago; la suma siempre es el total.
  const advance = applyBps(fobMinor, input.terms.advanceBps);
  const { productionDays, shippingCoordinationDays, transitDays } = input.terms;
  const stage = (
    stageNo: Stage["stageNo"],
    kind: Stage["kind"],
    amountMinor: Minor,
    days: [number, number] | null,
  ): Stage => ({
    stageNo,
    kind,
    amountMinor,
    amountPenMinor: toPen(amountMinor, fx),
    daysMin: days?.[0] ?? null,
    daysMax: days?.[1] ?? null,
  });
  const stages: Stage[] = [
    stage(1, "advance", advance, null),
    stage(2, "production", 0, productionDays),
    stage(3, "balance", fobMinor - advance, [shippingCoordinationDays, shippingCoordinationDays]),
    stage(4, "transit", 0, transitDays),
    stage(5, "logistics_taxes", logisticMinor + purchaseTaxesMinor + perceptionMinor, null),
    stage(6, "management", managementFeeMinor, null),
  ];

  return {
    fobMinor,
    cifMinor,
    logisticMinor,
    dutiesMinor,
    purchaseTaxesMinor,
    perceptionMinor,
    managementFeeMinor,
    totalWithoutIgvMinor,
    totalWithIgvMinor,
    totalMinor,
    factorPpm,
    pen: {
      fobMinor: toPen(fobMinor, fx),
      logisticMinor: toPen(logisticMinor, fx),
      purchaseTaxesMinor: toPen(purchaseTaxesMinor, fx),
      perceptionMinor: toPen(perceptionMinor, fx),
      managementFeeMinor: toPen(managementFeeMinor, fx),
      totalMinor: toPen(totalMinor, fx),
    },
    taxLines,
    items,
    scenarios,
    stages,
    snapshot: [...snapshot.values()],
    fx: input.fx,
  };
}
