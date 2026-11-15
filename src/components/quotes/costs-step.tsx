"use client";

import { useState } from "react";
import { CostLinesTable, type EditableLine } from "@/components/quotes/cost-lines-table";
import {
  ErrorAlert,
  Field,
  type Fx,
  fromInt,
  type Line,
  type Product,
  type Terms,
  toInt,
  useCopy,
  useWizardRun,
  type WizardActions,
} from "@/components/quotes/wizard-kit";

const copy = {
  es: {
    fx: "Tipo de cambio (S/ por US$)",
    fxDate: "Fecha del tipo de cambio",
    fxSource: "Fuente del tipo de cambio",
    advance: "Adelanto %",
    balance: "Saldo %",
    prodMin: "Producción mín. (días)",
    prodMax: "Producción máx. (días)",
    coord: "Coordinación de embarque (días)",
    transitMin: "Tránsito mín. (días)",
    transitMax: "Tránsito máx. (días)",
    condition: "Condición del importador",
    certificate: "Tengo certificado de origen",
    calc: "Guardar y calcular",
  },
  en: {
    fx: "Exchange rate (PEN per USD)",
    fxDate: "Exchange rate date",
    fxSource: "Exchange rate source",
    advance: "Advance %",
    balance: "Balance %",
    prodMin: "Production min (days)",
    prodMax: "Production max (days)",
    coord: "Shipping coordination (days)",
    transitMin: "Transit min (days)",
    transitMax: "Transit max (days)",
    condition: "Importer condition",
    certificate: "I have a certificate of origin",
    calc: "Save and calculate",
  },
};

const DEFAULT_TERMS: Terms = {
  advanceBps: 3000,
  balanceBps: 7000,
  productionDaysMin: 30,
  productionDaysMax: 35,
  shippingCoordinationDays: 7,
  transitDaysMin: 30,
  transitDaysMax: 40,
};

type Props = {
  quoteId: string;
  product: Product;
  costLines: Line[];
  terms: Terms | null;
  fx: Fx | null;
  conditions: { code: string; label: string }[];
  actions: WizardActions;
};

export function CostsStep({ quoteId, actions, conditions, ...props }: Props) {
  const { t } = useCopy(copy);
  const { pending, error, setError, run } = useWizardRun(quoteId);
  const [product, setProduct] = useState(props.product);
  const [lines, setLines] = useState<EditableLine[]>(
    props.costLines.map((l) => ({
      ...l,
      amount: fromInt(l.amountMinor, 2),
      key: crypto.randomUUID(),
    })),
  );
  const [fx, setFx] = useState({
    rate: props.fx ? fromInt(props.fx.penPerUsdE4, 4) : "",
    date: props.fx?.date ?? "",
    source: props.fx?.source ?? "",
  });
  const start = props.terms ?? DEFAULT_TERMS;
  const [terms, setTerms] = useState({
    ...start,
    advance: fromInt(start.advanceBps, 2),
    balance: fromInt(start.balanceBps, 2),
  });

  function save() {
    const parsed = lines.map(({ amount, key: _key, ...line }) => ({
      ...line,
      amountMinor: toInt(amount, 2),
    }));
    const rate = toInt(fx.rate, 4);
    const advanceBps = toInt(terms.advance, 2);
    const balanceBps = toInt(terms.balance, 2);
    if (
      parsed.some((l) => l.amountMinor === null) ||
      !rate ||
      advanceBps === null ||
      balanceBps === null
    ) {
      return setError(t.invalidNumber);
    }
    const { advance: _a, balance: _b, ...days } = terms;
    run(
      [
        () => actions.updateProduct(quoteId, product),
        () => actions.saveCostLines(quoteId, parsed as Line[]),
        () => actions.saveFx(quoteId, { penPerUsdE4: rate, date: fx.date, source: fx.source }),
        () => actions.saveSupplierTerms(quoteId, { ...days, advanceBps, balanceBps }),
        () => actions.calculate(quoteId),
      ],
      "resultado",
    );
  }

  const daysField = (key: keyof Terms, label: string) => (
    <Field key={key} label={label}>
      <input
        className="input"
        inputMode="numeric"
        value={terms[key]}
        onChange={(e) => setTerms({ ...terms, [key]: Number(e.target.value) || 0 })}
      />
    </Field>
  );

  return (
    <div className="card flex flex-col gap-4" aria-busy={pending}>
      <CostLinesTable lines={lines} onChange={setLines} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.fx}>
          <input
            className="input"
            inputMode="decimal"
            value={fx.rate}
            onChange={(e) => setFx({ ...fx, rate: e.target.value })}
          />
        </Field>
        <Field label={t.fxDate}>
          <input
            className="input"
            type="date"
            value={fx.date}
            onChange={(e) => setFx({ ...fx, date: e.target.value })}
          />
        </Field>
        <Field label={t.fxSource}>
          <input
            className="input"
            value={fx.source}
            onChange={(e) => setFx({ ...fx, source: e.target.value })}
          />
        </Field>
        <Field label={t.advance}>
          <input
            className="input"
            inputMode="decimal"
            value={terms.advance}
            onChange={(e) => setTerms({ ...terms, advance: e.target.value })}
          />
        </Field>
        <Field label={t.balance}>
          <input
            className="input"
            inputMode="decimal"
            value={terms.balance}
            onChange={(e) => setTerms({ ...terms, balance: e.target.value })}
          />
        </Field>
        {daysField("productionDaysMin", t.prodMin)}
        {daysField("productionDaysMax", t.prodMax)}
        {daysField("shippingCoordinationDays", t.coord)}
        {daysField("transitDaysMin", t.transitMin)}
        {daysField("transitDaysMax", t.transitMax)}
        <Field label={t.condition}>
          <select
            className="input"
            value={product.importerCondition}
            onChange={(e) => setProduct({ ...product, importerCondition: e.target.value })}
          >
            {conditions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={product.hasOriginCertificate}
          onChange={(e) => setProduct({ ...product, hasOriginCertificate: e.target.checked })}
        />
        {t.certificate}
      </label>
      <button
        type="button"
        className="btn btn-primary self-start"
        disabled={pending}
        onClick={save}
      >
        {t.calc}
      </button>
      <ErrorAlert error={error} />
    </div>
  );
}
