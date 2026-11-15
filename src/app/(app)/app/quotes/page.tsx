import Link from "next/link";
import { getLocale } from "next-intl/server";
import { DeleteQuoteButton } from "@/components/quotes/delete-quote-button";
import { type Copy, isLocale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { formatUsd } from "@/lib/engine/money";
import type { EngineResult } from "@/lib/engine/types";
import { listQuotes } from "@/server/quotes/service";
import { createQuoteAction, deleteQuoteAction } from "./actions";

type ListCopy = {
  title: string;
  empty: string;
  create: string;
  compare: string;
  compareHint: string;
  next: string;
  head: [string, string, string, string, string, string, string];
  status: Record<"draft" | "calculated" | "archived", string>;
  select: (code: string) => string;
  quota: string;
  billing: string;
  createError: string;
};

const copy: Copy<ListCopy> = {
  es: {
    title: "Cotizaciones",
    empty: "Aún no tienes cotizaciones",
    create: "Nueva cotización",
    compare: "Comparar",
    compareHint: "Marca 2 o 3 cotizaciones para compararlas.",
    next: "Siguiente página",
    head: ["", "Código", "Título", "Estado", "Total USD", "Fecha", ""],
    status: { draft: "Borrador", calculated: "Calculada", archived: "Archivada" },
    select: (code) => `Comparar ${code}`,
    quota: "Ya usaste las cotizaciones de tu plan.",
    billing: "Ver planes",
    createError: "No pudimos crear la cotización. Intenta de nuevo.",
  },
  en: {
    title: "Quotes",
    empty: "You don't have any quotes yet",
    create: "New quote",
    compare: "Compare",
    compareHint: "Select 2 or 3 quotes to compare them.",
    next: "Next page",
    head: ["", "Code", "Title", "Status", "Total USD", "Date", ""],
    status: { draft: "Draft", calculated: "Calculated", archived: "Archived" },
    select: (code) => `Compare ${code}`,
    quota: "You have used all the quotes in your plan.",
    billing: "See plans",
    createError: "We couldn't create the quote. Try again.",
  },
};

type Props = { searchParams: Promise<{ cursor?: string; error?: string }> };

export default async function QuotesPage({ searchParams }: Props) {
  const { cursor, error } = await searchParams;
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];
  const actor = await requireActor();
  const page = await listQuotes(actor, { cursor: cursor ?? null });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <form action={createQuoteAction}>
          <button type="submit" className="btn btn-primary">
            {t.create}
          </button>
        </form>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error === "quota" ? (
            <>
              {t.quota} <Link href="/app/billing">{t.billing}</Link>
            </>
          ) : (
            t.createError
          )}
        </p>
      )}
      {page.items.length === 0 && !cursor ? (
        <p className="card text-fg-muted">{t.empty}</p>
      ) : (
        <>
          <form
            id="compare"
            action="/app/quotes/compare"
            className="flex flex-wrap items-center gap-3"
          >
            <button type="submit" className="btn btn-ghost">
              {t.compare}
            </button>
            <span className="text-sm text-fg-muted">{t.compareHint}</span>
          </form>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  {t.head.map((head, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cabeceras fijas, dos vacías
                    <th key={index} className="py-2 text-left">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.items.map((quote) => {
                  const result = quote.result as EngineResult | null;
                  return (
                    <tr key={quote.id} className="border-t border-border">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          name="ids"
                          value={quote.id}
                          form="compare"
                          aria-label={t.select(quote.referenceCode)}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Link href={`/app/quotes/${quote.id}?paso=resultado`}>
                          {quote.referenceCode}
                        </Link>
                      </td>
                      <td className="py-2 pr-2">{quote.title}</td>
                      <td className="py-2 pr-2">
                        <span className="badge">{t.status[quote.status]}</span>
                      </td>
                      <td className="py-2 pr-2">{result ? formatUsd(result.totalMinor) : "—"}</td>
                      <td className="py-2 pr-2">{quote.createdAt.toISOString().slice(0, 10)}</td>
                      <td className="py-2">
                        <DeleteQuoteButton
                          quoteId={quote.id}
                          referenceCode={quote.referenceCode}
                          action={deleteQuoteAction}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {page.nextCursor && (
            <Link
              href={`/app/quotes?cursor=${page.nextCursor}`}
              className="btn btn-ghost self-start"
            >
              {t.next}
            </Link>
          )}
        </>
      )}
    </section>
  );
}
