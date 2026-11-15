import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { type Copy, isLocale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { formatPen, formatUsd } from "@/lib/engine/money";
import { listLocalCharges, saveLocalCharge } from "@/server/admin/service";
import { toResult } from "@/server/errors";

const GROUPS = ["origin_freight", "other_charges", "local_soles", "management_fee"] as const;

/** Nueva semana: fila nueva con su valid_from; la anterior se conserva. */
async function addWeek(formData: FormData): Promise<void> {
  "use server";
  const text = (key: string) => String(formData.get(key) ?? "");
  const result = await toResult(async () =>
    saveLocalCharge(await requireActor(), {
      conceptCode: text("conceptCode"),
      labelEs: text("labelEs"),
      labelEn: text("labelEn"),
      group: text("group") as (typeof GROUPS)[number],
      origin: text("origin") === "international" ? "international" : "local",
      igvApplicable: formData.get("igvApplicable") === "on",
      inCif: formData.get("inCif") === "on",
      amount: text("amount"),
      currency: text("currency") === "PEN" ? "PEN" : "USD",
      validFrom: text("validFrom"),
    }),
  );
  redirect(
    result.ok
      ? "/admin/charges?ok=1"
      : `/admin/charges?error=${encodeURIComponent(result.error.message)}`,
  );
}

type ChargesCopy = {
  title: string;
  head: [string, string, string, string, string, string, string];
  yes: string;
  no: string;
  newWeek: string;
  fields: Record<
    | "conceptCode"
    | "labelEs"
    | "labelEn"
    | "group"
    | "origin"
    | "amount"
    | "currency"
    | "validFrom"
    | "igvApplicable"
    | "inCif",
    string
  >;
  origins: { international: string; local: string };
  save: string;
  saved: string;
  hint: string;
};

const copy: Copy<ChargesCopy> = {
  es: {
    title: "Gastos locales",
    head: ["Concepto", "Grupo", "Origen", "IGV", "En CIF", "Monto vigente", "Desde"],
    yes: "Sí",
    no: "No",
    newWeek: "Nueva semana",
    fields: {
      conceptCode: "Código del concepto",
      labelEs: "Nombre (ES)",
      labelEn: "Nombre (EN)",
      group: "Grupo",
      origin: "Origen",
      amount: "Monto",
      currency: "Moneda",
      validFrom: "Vigente desde",
      igvApplicable: "Aplica IGV",
      inCif: "Forma parte del CIF",
    },
    origins: { international: "Internacional", local: "Local" },
    save: "Guardar nueva semana",
    saved: "Gasto guardado. La fila anterior se conserva en el historial.",
    hint: "Para actualizar un gasto usa su mismo código con una fecha nueva.",
  },
  en: {
    title: "Local charges",
    head: ["Concept", "Group", "Origin", "VAT", "In CIF", "Current amount", "Since"],
    yes: "Yes",
    no: "No",
    newWeek: "New week",
    fields: {
      conceptCode: "Concept code",
      labelEs: "Name (ES)",
      labelEn: "Name (EN)",
      group: "Group",
      origin: "Origin",
      amount: "Amount",
      currency: "Currency",
      validFrom: "Valid from",
      igvApplicable: "VAT applies",
      inCif: "Part of CIF",
    },
    origins: { international: "International", local: "Local" },
    save: "Save new week",
    saved: "Charge saved. The previous row stays in the history.",
    hint: "To update a charge use the same code with a new date.",
  },
};

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function ChargesPage({ searchParams }: Props) {
  const { ok, error } = await searchParams;
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];
  const charges = await listLocalCharges(await requireActor());
  const f = t.fields;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
      {ok && (
        <p role="status" className="text-sm text-success">
          {t.saved}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="table-base text-sm">
          <thead>
            <tr>
              {t.head.map((head) => (
                <th key={head} className="py-2 pr-3 text-left">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {charges.map((charge) => (
              <tr key={charge.id} className="border-t border-border">
                <td className="py-2 pr-3">
                  {locale === "en" ? charge.labelEn : charge.labelEs}
                  <span className="block text-xs text-fg-muted">{charge.conceptCode}</span>
                </td>
                <td className="py-2 pr-3">{charge.group}</td>
                <td className="py-2 pr-3">{t.origins[charge.origin]}</td>
                <td className="py-2 pr-3">{charge.igvApplicable ? t.yes : t.no}</td>
                <td className="py-2 pr-3">{charge.inCif ? t.yes : t.no}</td>
                <td className="py-2 pr-3">
                  {charge.currency === "PEN"
                    ? formatPen(charge.amountMinor)
                    : formatUsd(charge.amountMinor)}
                </td>
                <td className="py-2 pr-3">{charge.validFrom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={addWeek} className="card flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t.newWeek}</h2>
        <p className="text-sm text-fg-muted">{t.hint}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="conceptCode" label={f.conceptCode}>
            <input id="conceptCode" name="conceptCode" className="input" list="concepts" required />
            <datalist id="concepts">
              {charges.map((charge) => (
                <option key={charge.conceptCode} value={charge.conceptCode} />
              ))}
            </datalist>
          </Field>
          <Field id="labelEs" label={f.labelEs}>
            <input id="labelEs" name="labelEs" className="input" required />
          </Field>
          <Field id="labelEn" label={f.labelEn}>
            <input id="labelEn" name="labelEn" className="input" required />
          </Field>
          <Field id="group" label={f.group}>
            <select id="group" name="group" className="input" defaultValue="other_charges">
              {GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </Field>
          <Field id="origin" label={f.origin}>
            <select id="origin" name="origin" className="input" defaultValue="local">
              <option value="international">{t.origins.international}</option>
              <option value="local">{t.origins.local}</option>
            </select>
          </Field>
          <Field id="amount" label={f.amount}>
            <input id="amount" name="amount" className="input" inputMode="decimal" required />
          </Field>
          <Field id="currency" label={f.currency}>
            <select id="currency" name="currency" className="input" defaultValue="USD">
              <option>USD</option>
              <option>PEN</option>
            </select>
          </Field>
          <Field id="validFrom" label={f.validFrom}>
            <input id="validFrom" name="validFrom" type="date" className="input" required />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="igvApplicable" defaultChecked />
            {f.igvApplicable}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="inCif" />
            {f.inCif}
          </label>
        </div>
        <button type="submit" className="btn btn-primary self-start">
          {t.save}
        </button>
      </form>
    </section>
  );
}
