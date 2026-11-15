import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { type Copy, isLocale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { formatMinor } from "@/lib/engine/money";
import { getPlan, listTaxRates, markVerified, savePlan, saveTaxRate } from "@/server/admin/service";
import { toResult } from "@/server/errors";

const PLAN_CODE = "mensual";
const KINDS = ["igv", "ipm", "uit", "tasa_despacho"] as const;

function back(result: { ok: boolean; error?: { message: string } }): never {
  redirect(
    result.ok
      ? "/admin/settings?ok=1"
      : `/admin/settings?error=${encodeURIComponent(result.error?.message ?? "")}`,
  );
}

async function addRate(formData: FormData): Promise<void> {
  "use server";
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const isAmount = text("valueType") === "amount";
  back(
    await toResult(async () =>
      saveTaxRate(await requireActor(), {
        kind: text("kind") as (typeof KINDS)[number],
        rate: isAmount ? null : text("value"),
        amount: isAmount ? text("value") : null,
        currency: text("currency") === "USD" ? "USD" : "PEN",
        effectiveFrom: text("effectiveFrom"),
        sourceUrl: text("sourceUrl"),
      }),
    ),
  );
}

async function verifyRate(formData: FormData): Promise<void> {
  "use server";
  back(
    await toResult(async () =>
      markVerified(await requireActor(), "tax_rates", String(formData.get("id"))),
    ),
  );
}

async function updatePlan(formData: FormData): Promise<void> {
  "use server";
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  back(
    await toResult(async () =>
      savePlan(await requireActor(), PLAN_CODE, {
        pricePen: text("pricePen"),
        priceUsd: text("priceUsd"),
        quotaPerPeriod: Number(text("quota")),
        active: formData.get("active") === "on",
      }),
    ),
  );
}

type SettingsCopy = {
  title: string;
  saved: string;
  rates: string;
  head: [string, string, string, string, string];
  verified: string;
  unverified: string;
  verify: string;
  newRate: string;
  kind: string;
  valueType: string;
  percent: string;
  amount: string;
  value: string;
  currency: string;
  effectiveFrom: string;
  sourceUrl: string;
  addRate: string;
  plan: string;
  pricePen: string;
  priceUsd: string;
  quota: string;
  active: string;
  savePlan: string;
};

const copy: Copy<SettingsCopy> = {
  es: {
    title: "Tasas y plan",
    saved: "Cambios guardados.",
    rates: "Tasas tributarias",
    head: ["Tipo", "Valor", "Vigencia", "Fuente", "Estado"],
    verified: "verificada",
    unverified: "tasa no verificada",
    verify: "Marcar verificada",
    newRate: "Nueva tasa",
    kind: "Tipo",
    valueType: "Expresada como",
    percent: "Porcentaje",
    amount: "Monto",
    value: "Valor",
    currency: "Moneda del monto",
    effectiveFrom: "Vigente desde",
    sourceUrl: "Fuente (URL https://)",
    addRate: "Guardar tasa",
    plan: "Plan mensual",
    pricePen: "Precio en soles",
    priceUsd: "Precio en dólares",
    quota: "Cotizaciones por mes",
    active: "Plan activo (visible para comprar)",
    savePlan: "Guardar plan",
  },
  en: {
    title: "Rates and plan",
    saved: "Changes saved.",
    rates: "Tax rates",
    head: ["Kind", "Value", "Effective", "Source", "Status"],
    verified: "verified",
    unverified: "unverified rate",
    verify: "Mark verified",
    newRate: "New rate",
    kind: "Kind",
    valueType: "Expressed as",
    percent: "Percentage",
    amount: "Amount",
    value: "Value",
    currency: "Amount currency",
    effectiveFrom: "Valid from",
    sourceUrl: "Source (https:// URL)",
    addRate: "Save rate",
    plan: "Monthly plan",
    pricePen: "Price in PEN",
    priceUsd: "Price in USD",
    quota: "Quotes per month",
    active: "Active plan (available to buy)",
    savePlan: "Save plan",
  },
};

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
  const { ok, error } = await searchParams;
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];
  const actor = await requireActor();
  const [rates, plan] = await Promise.all([listTaxRates(actor), getPlan(actor, PLAN_CODE)]);

  return (
    <section className="flex flex-col gap-8">
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.rates}</h2>
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
              {rates.map((rate) => (
                <tr key={rate.id} className="border-t border-border">
                  <td className="py-2 pr-3">{rate.kind}</td>
                  <td className="py-2 pr-3">
                    {rate.rateBps !== null
                      ? `${formatMinor(rate.rateBps)} %`
                      : `${rate.currency} ${formatMinor(rate.amountMinor ?? 0)}`}
                  </td>
                  <td className="py-2 pr-3">
                    {rate.effectiveFrom} → {rate.effectiveTo ?? "…"}
                  </td>
                  <td className="break-all py-2 pr-3">{rate.sourceUrl}</td>
                  <td className="py-2 pr-3">
                    {rate.verificationStatus === "verified" ? (
                      <span className="badge text-success">{t.verified}</span>
                    ) : (
                      <form action={verifyRate} className="flex flex-wrap items-center gap-2">
                        <span className="badge text-warning">{t.unverified}</span>
                        <input type="hidden" name="id" value={rate.id} />
                        <button type="submit" className="btn btn-ghost">
                          {t.verify}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <form action={addRate} className="card grid gap-4 sm:grid-cols-3">
        <h2 className="text-lg font-semibold sm:col-span-3">{t.newRate}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.kind}</span>
          <select name="kind" className="input">
            {KINDS.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.valueType}</span>
          <select name="valueType" className="input">
            <option value="percent">{t.percent}</option>
            <option value="amount">{t.amount}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.value}</span>
          <input name="value" className="input" inputMode="decimal" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.currency}</span>
          <select name="currency" className="input" defaultValue="PEN">
            <option>PEN</option>
            <option>USD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.effectiveFrom}</span>
          <input name="effectiveFrom" type="date" className="input" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.sourceUrl}</span>
          <input name="sourceUrl" type="url" className="input" required />
        </label>
        <button type="submit" className="btn btn-primary self-start">
          {t.addRate}
        </button>
      </form>

      <form action={updatePlan} className="card grid gap-4 sm:grid-cols-3">
        <h2 className="text-lg font-semibold sm:col-span-3">{t.plan}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.pricePen}</span>
          <input
            name="pricePen"
            className="input"
            inputMode="decimal"
            defaultValue={formatMinor(plan.pricePenMinor).replaceAll(",", "")}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.priceUsd}</span>
          <input
            name="priceUsd"
            className="input"
            inputMode="decimal"
            defaultValue={formatMinor(plan.priceUsdMinor).replaceAll(",", "")}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.quota}</span>
          <input
            name="quota"
            className="input"
            inputMode="numeric"
            defaultValue={plan.quotaPerPeriod}
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="active" defaultChecked={plan.active} />
          {t.active}
        </label>
        <button type="submit" className="btn btn-primary self-start">
          {t.savePlan}
        </button>
      </form>
    </section>
  );
}
