import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { type Copy, isLocale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { formatUsd } from "@/lib/engine/money";
import type { EngineResult } from "@/lib/engine/types";
import { AppError } from "@/server/errors";
import { compareQuotes } from "@/server/quotes/service";

const copy: Copy<{
  title: string;
  total: string;
  factor: string;
  purchase: string;
  notCalculated: string;
  invalid: string;
  back: string;
}> = {
  es: {
    title: "Comparar cotizaciones",
    total: "Total",
    factor: "Factor de importación",
    purchase: "Tributos de compra",
    notCalculated: "Sin calcular",
    invalid: "Elige entre 2 y 3 cotizaciones para comparar.",
    back: "Volver a cotizaciones",
  },
  en: {
    title: "Compare quotes",
    total: "Total",
    factor: "Import factor",
    purchase: "Purchase taxes",
    notCalculated: "Not calculated",
    invalid: "Select between 2 and 3 quotes to compare.",
    back: "Back to quotes",
  },
};

const ppm = (value: number) => `${Math.floor(value / 1e6)}.${String(value % 1e6).padStart(6, "0")}`;

type Props = { searchParams: Promise<{ ids?: string | string[] }> };

export default async function ComparePage({ searchParams }: Props) {
  const { ids } = await searchParams;
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];
  // Acepta ?ids=a,b y también ?ids=a&ids=b (lo que envía el formulario del listado).
  const list = (Array.isArray(ids) ? ids : [ids ?? ""])
    .flatMap((value) => value.split(","))
    .filter(Boolean);
  const actor = await requireActor();
  const quotes = await compareQuotes(actor, list).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    if (error instanceof AppError && error.code === "VALIDATION") return null;
    throw error;
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
      {quotes === null ? (
        <p role="alert" className="text-sm text-destructive">
          {t.invalid}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="py-2 text-left" />
                {quotes.map((quote) => (
                  <th key={quote.id} scope="col" className="py-2 pr-4 text-left">
                    <Link href={`/app/quotes/${quote.id}?paso=resultado`}>
                      {quote.referenceCode}
                    </Link>
                    <span className="block text-sm font-normal text-fg-muted">{quote.title}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [t.total, (r) => formatUsd(r.totalMinor)],
                  [t.factor, (r) => ppm(r.factorPpm)],
                  [t.purchase, (r) => formatUsd(r.purchaseTaxesMinor)],
                ] satisfies [string, (r: EngineResult) => string][]
              ).map(([label, show]) => (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="py-2 pr-4 text-left font-medium">
                    {label}
                  </th>
                  {quotes.map((quote) => (
                    <td key={quote.id} className="py-2 pr-4">
                      {quote.result ? show(quote.result) : t.notCalculated}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link href="/app/quotes" className="text-sm">
        {t.back}
      </Link>
    </section>
  );
}
