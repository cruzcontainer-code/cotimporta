"use client";

import { useState } from "react";
import {
  ErrorAlert,
  Field,
  fromInt,
  type Item,
  type Product,
  toInt,
  useCopy,
  useWizardRun,
  type WizardActions,
} from "@/components/quotes/wizard-kit";

const COUNTRIES = ["CN", "US", "DE", "IT", "ES", "BR", "MX", "KR", "JP", "IN", "TW", "TR"];

const copy = {
  es: {
    title: "Título",
    description: "Descripción del producto",
    client: "Cliente",
    origin: "País de origen",
    none: "Sin definir",
    units: "Unidades sujetas a derecho",
    itemDesc: "Descripción del ítem",
    qty: "Cantidad",
    total: "Total USD",
    addItem: "Agregar ítem",
    save: "Guardar y continuar",
  },
  en: {
    title: "Title",
    description: "Product description",
    client: "Client",
    origin: "Country of origin",
    none: "Not set",
    units: "Dutiable units",
    itemDesc: "Item description",
    qty: "Quantity",
    total: "Total USD",
    addItem: "Add item",
    save: "Save and continue",
  },
};

type Props = { quoteId: string; product: Product; items: Item[]; actions: WizardActions };

export function ProductStep({ quoteId, actions, ...props }: Props) {
  const { t } = useCopy(copy);
  const { pending, error, setError, run } = useWizardRun(quoteId);
  const [product, setProduct] = useState(props.product);
  const [items, setItems] = useState(
    props.items.map((i) => ({ ...i, total: fromInt(i.totalMinor, 2), key: crypto.randomUUID() })),
  );
  const setP = (patch: Partial<Product>) => setProduct((current) => ({ ...current, ...patch }));
  const setItem = (index: number, patch: Partial<(typeof items)[number]>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  function save() {
    const parsed = items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      totalMinor: toInt(i.total, 2),
    }));
    if (parsed.some((i) => i.totalMinor === null)) return setError(t.invalidNumber);
    run(
      [
        () => actions.updateProduct(quoteId, product),
        () => actions.saveItems(quoteId, parsed as Item[]),
      ],
      "partida",
    );
  }

  return (
    <div className="card flex flex-col gap-4" aria-busy={pending}>
      <Field label={t.title}>
        <input
          className="input"
          value={product.title}
          onChange={(e) => setP({ title: e.target.value })}
        />
      </Field>
      <Field label={t.description}>
        <textarea
          className="input"
          rows={3}
          value={product.productDescription}
          onChange={(e) => setP({ productDescription: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.client}>
          <input
            className="input"
            value={product.clientName}
            onChange={(e) => setP({ clientName: e.target.value })}
          />
        </Field>
        <Field label={t.origin}>
          <select
            className="input"
            value={product.originCountry ?? ""}
            onChange={(e) => setP({ originCountry: e.target.value || null })}
          >
            <option value="">{t.none}</option>
            {COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.units}>
          <input
            className="input"
            inputMode="numeric"
            value={product.dutiableUnits}
            onChange={(e) => setP({ dutiableUnits: Number(e.target.value) || 1 })}
          />
        </Field>
      </div>
      {items.map((item, index) => (
        <fieldset
          key={item.key}
          className="grid gap-2 sm:grid-cols-[1fr_6rem_9rem_auto] sm:items-end"
        >
          <Field label={t.itemDesc}>
            <input
              className="input"
              value={item.description}
              onChange={(e) => setItem(index, { description: e.target.value })}
            />
          </Field>
          <Field label={t.qty}>
            <input
              className="input"
              inputMode="numeric"
              value={item.quantity}
              onChange={(e) => setItem(index, { quantity: Number(e.target.value) || 1 })}
            />
          </Field>
          <Field label={t.total}>
            <input
              className="input"
              inputMode="decimal"
              value={item.total}
              onChange={(e) => setItem(index, { total: e.target.value })}
            />
          </Field>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setItems(items.filter((_, i) => i !== index))}
          >
            {t.remove}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() =>
          setItems([
            ...items,
            { description: "", quantity: 1, totalMinor: 0, total: "", key: crypto.randomUUID() },
          ])
        }
      >
        {t.addItem}
      </button>
      <button
        type="button"
        className="btn btn-primary self-start"
        disabled={pending}
        onClick={save}
      >
        {t.save}
      </button>
      <ErrorAlert error={error} />
    </div>
  );
}
