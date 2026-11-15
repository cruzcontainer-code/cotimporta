import { getLocale } from "next-intl/server";
import { type Copy, isLocale } from "@/i18n/messages";
import { formatPen, formatUsd } from "@/lib/engine/money";
import type { EngineResult, Stage } from "@/lib/engine/types";

type ResultCopy = {
  summary: [string, string, string];
  rows: [string, string, string, string, string, string];
  factor: string;
  unitCost: string;
  scenarios: string;
  stagesTitle: string;
  stages: Record<Stage["kind"], string>;
  days: string;
  breakdown: [string, string, string, string, string, string];
  exempted: string;
  unverified: string;
  missingTitle: string;
  missing: { heading: string; items: string; fx: string; terms: string };
  disclaimer: (date: string) => string;
};

const copy: Copy<ResultCopy> = {
  es: {
    summary: ["Concepto", "USD", "PEN"],
    rows: [
      "Factura FOB",
      "Monto logístico + destino",
      "IGV compra",
      "Percepción",
      "Gestión",
      "Total",
    ],
    factor: "Factor de importación",
    unitCost: "Costo unitario",
    scenarios: "Precio de venta (margen sobre el costo)",
    stagesTitle: "Etapas de pago",
    stages: {
      advance: "Adelanto al proveedor",
      production: "Producción",
      balance: "Saldo al proveedor",
      transit: "Tránsito",
      logistics_taxes: "Logística y tributos",
      management: "Gestión",
    },
    days: "días",
    breakdown: ["Componente", "Base", "Tasa", "Monto", "Regla y vigencia", "Fuente"],
    exempted: "Exonerado",
    unverified: "tasa no verificada",
    missingTitle: "Para calcular falta:",
    missing: {
      heading: "Confirmar la partida arancelaria",
      items: "Agregar al menos un ítem",
      fx: "Fijar el tipo de cambio con fecha y fuente",
      terms: "Guardar los términos del proveedor",
    },
    disclaimer: (date) =>
      `Estimación referencial. No es una liquidación oficial de aduanas. Reglas vigentes al ${date}.`,
  },
  en: {
    summary: ["Item", "USD", "PEN"],
    rows: [
      "FOB invoice",
      "Logistics + destination",
      "Purchase VAT",
      "Perception",
      "Management",
      "Total",
    ],
    factor: "Import factor",
    unitCost: "Unit cost",
    scenarios: "Selling price (margin on cost)",
    stagesTitle: "Payment stages",
    stages: {
      advance: "Supplier advance",
      production: "Production",
      balance: "Supplier balance",
      transit: "Transit",
      logistics_taxes: "Logistics and taxes",
      management: "Management",
    },
    days: "days",
    breakdown: ["Component", "Base", "Rate", "Amount", "Rule and effective date", "Source"],
    exempted: "Exempt",
    unverified: "unverified rate",
    missingTitle: "To calculate you still need to:",
    missing: {
      heading: "Confirm the tariff heading",
      items: "Add at least one item",
      fx: "Set the exchange rate with date and source",
      terms: "Save the supplier terms",
    },
    disclaimer: (date) =>
      `Reference estimate. Not an official customs assessment. Rules in force as of ${date}.`,
  },
};

/** 1550 bps → "15.50 %" y 1444358 ppm → "1.444358" (aritmética entera). */
const pct = (bps: number) => `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, "0")} %`;
const ppm = (value: number) => `${Math.floor(value / 1e6)}.${String(value % 1e6).padStart(6, "0")}`;

type Props = {
  result: EngineResult | null;
  rulesAsOf: string | null;
  unverifiedRules: boolean;
  missing: { heading: boolean; items: boolean; fx: boolean; terms: boolean };
};

/** Paso Resultado: tabla resumen (igual a la del PDF), etapas, escenarios y desglose con reglas. */
export async function QuoteResult({ result, rulesAsOf, unverifiedRules, missing }: Props) {
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];

  if (!result) {
    const pending = (Object.keys(missing) as (keyof Props["missing"])[]).filter(
      (key) => missing[key],
    );
    return (
      <div className="card flex flex-col gap-2">
        <p className="font-medium">{t.missingTitle}</p>
        <ul className="list-disc pl-6">
          {pending.map((key) => (
            <li key={key}>{t.missing[key]}</li>
          ))}
        </ul>
      </div>
    );
  }

  const usd = [
    result.fobMinor,
    result.logisticMinor,
    result.purchaseTaxesMinor,
    result.perceptionMinor,
    result.managementFeeMinor,
    result.totalMinor,
  ];
  const pen = [
    result.pen.fobMinor,
    result.pen.logisticMinor,
    result.pen.purchaseTaxesMinor,
    result.pen.perceptionMinor,
    result.pen.managementFeeMinor,
    result.pen.totalMinor,
  ];

  return (
    <div className="flex flex-col gap-6">
      {unverifiedRules && <span className="badge self-start text-warning">{t.unverified}</span>}
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              {t.summary.map((head) => (
                <th key={head} className="py-2 text-left">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((label, index) => (
              <tr key={label} className="border-t border-border">
                <td className="py-2">{label}</td>
                <td className="py-2">{formatUsd(usd[index] ?? 0)}</td>
                <td className="py-2">{formatPen(pen[index] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <dt className="text-fg-muted">{t.factor}</dt>
        <dd>{ppm(result.factorPpm)}</dd>
        {result.items.map((item) => (
          <div key={item.id} className="contents">
            <dt className="text-fg-muted">{t.unitCost}</dt>
            <dd>{formatUsd(item.unitCostMinor)}</dd>
          </div>
        ))}
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t.scenarios}</h2>
        <ul className="grid gap-2 sm:grid-cols-3">
          {result.scenarios.map((scenario) => (
            <li key={scenario.marginBps} className="card">
              <p className="text-fg-muted">{pct(scenario.marginBps)}</p>
              <p className="text-lg font-semibold">{formatUsd(scenario.totalMinor)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t.stagesTitle}</h2>
        <ol className="flex flex-col gap-1">
          {result.stages.map((stage) => (
            <li
              key={stage.stageNo}
              className="flex flex-wrap justify-between gap-2 border-t border-border py-2"
            >
              <span>
                {stage.stageNo}. {t.stages[stage.kind]}
                {stage.daysMin !== null && ` (${stage.daysMin}–${stage.daysMax} ${t.days})`}
              </span>
              <span>
                {formatUsd(stage.amountMinor)} · {formatPen(stage.amountPenMinor)}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <div className="overflow-x-auto">
        <table className="table-base text-sm">
          <thead>
            <tr>
              {t.breakdown.map((head) => (
                <th key={head} className="py-2 text-left">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.taxLines.map((line) => (
              <tr
                key={`${line.component}-${line.scope}-${line.costLineId ?? ""}`}
                className="border-t border-border"
              >
                <td className="py-2">
                  {line.component}
                  {line.conceptCode ? ` · ${line.conceptCode}` : ""}
                </td>
                <td className="py-2">{formatUsd(line.baseMinor)}</td>
                <td className="py-2">{line.rateBps === null ? "—" : pct(line.rateBps)}</td>
                <td className="py-2">
                  {formatUsd(line.amountMinor)}
                  {line.exempted && ` · ${t.exempted} (${line.exemptionReason})`}
                </td>
                <td className="py-2">
                  {line.rule ? `${line.rule.table} · ${line.rule.effectiveFrom}` : "—"}
                </td>
                <td className="break-all py-2">{line.rule?.sourceUrl ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-fg-muted">{t.disclaimer(rulesAsOf ?? "—")}</p>
    </div>
  );
}
