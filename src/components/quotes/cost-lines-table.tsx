"use client";

import { type Line, useCopy } from "@/components/quotes/wizard-kit";

const copy = {
  es: {
    concept: "Concepto",
    lineOrigin: "Origen",
    intl: "Internacional",
    local: "Local",
    igv: "IGV",
    cif: "En CIF",
    currency: "Moneda",
    amount: "Monto",
    addLine: "Agregar gasto",
  },
  en: {
    concept: "Concept",
    lineOrigin: "Origin",
    intl: "International",
    local: "Local",
    igv: "VAT",
    cif: "In CIF",
    currency: "Currency",
    amount: "Amount",
    addLine: "Add cost",
  },
};

export type EditableLine = Line & { amount: string; key: string };

type Props = { lines: EditableLine[]; onChange: (lines: EditableLine[]) => void };

/** Tabla editable de gastos: origen, IGV, CIF, moneda y monto por línea. */
export function CostLinesTable({ lines, onChange: setLines }: Props) {
  const { t } = useCopy(copy);
  const patch = (index: number, p: Partial<EditableLine>) =>
    setLines(lines.map((line, i) => (i === index ? { ...line, ...p } : line)));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="table-base text-sm">
          <thead>
            <tr>
              {[t.concept, t.lineOrigin, t.igv, t.cif, t.currency, t.amount, ""].map((h) => (
                <th key={h} className="py-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.key} className="border-t border-border">
                <td className="py-1 pr-2">
                  <input
                    aria-label={t.concept}
                    className="input"
                    value={line.label}
                    onChange={(e) => patch(index, { label: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    aria-label={t.lineOrigin}
                    className="input"
                    value={line.origin}
                    onChange={(e) => patch(index, { origin: e.target.value as Line["origin"] })}
                  >
                    <option value="international">{t.intl}</option>
                    <option value="local">{t.local}</option>
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={`${t.igv} ${line.label}`}
                    type="checkbox"
                    checked={line.igvApplicable}
                    onChange={(e) => patch(index, { igvApplicable: e.target.checked })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={`${t.cif} ${line.label}`}
                    type="checkbox"
                    checked={line.inCif}
                    onChange={(e) => patch(index, { inCif: e.target.checked })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    aria-label={t.currency}
                    className="input"
                    value={line.currency}
                    onChange={(e) => patch(index, { currency: e.target.value as Line["currency"] })}
                  >
                    <option>USD</option>
                    <option>PEN</option>
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={`${t.amount} ${line.label}`}
                    className="input"
                    inputMode="decimal"
                    value={line.amount}
                    onChange={(e) => patch(index, { amount: e.target.value })}
                  />
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setLines(lines.filter((_, i) => i !== index))}
                  >
                    {t.remove}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() =>
          setLines([
            ...lines,
            {
              conceptCode: `custom_${lines.length + 1}`,
              label: "",
              group: "other_charges",
              origin: "local",
              igvApplicable: true,
              inCif: false,
              amountMinor: 0,
              currency: "USD",
              amount: "",
              key: crypto.randomUUID(),
            },
          ])
        }
      >
        {t.addLine}
      </button>
    </>
  );
}
