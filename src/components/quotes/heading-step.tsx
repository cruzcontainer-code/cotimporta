"use client";

import { type FormEvent, useState } from "react";
import {
  ErrorAlert,
  Field,
  type Heading,
  useCopy,
  useWizardRun,
  type WizardActions,
} from "@/components/quotes/wizard-kit";

const copy = {
  es: {
    current: "Partida confirmada",
    search: "Buscar partida",
    searchBtn: "Buscar",
    suggest: "Sugerir con IA",
    noResults: "Sin resultados",
    confirm: "Confirmar",
  },
  en: {
    current: "Confirmed heading",
    search: "Search heading",
    searchBtn: "Search",
    suggest: "Suggest with AI",
    noResults: "No results",
    confirm: "Confirm",
  },
};

type Props = { quoteId: string; headingCode: string | null; actions: WizardActions };

export function HeadingStep({ quoteId, headingCode, actions }: Props) {
  const { locale, t } = useCopy(copy);
  const { pending, error, run, startTransition } = useWizardRun(quoteId);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Heading[] | null>(null);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await actions.searchHeadings(query);
      setFound(result.ok ? result.data : []);
    });
  }

  return (
    <div className="card flex flex-col gap-4" aria-busy={pending}>
      {headingCode && (
        <p>
          {t.current}: <strong>{headingCode}</strong>
        </p>
      )}
      <form className="flex flex-wrap items-end gap-2" onSubmit={search}>
        <Field label={t.search}>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {t.searchBtn}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() =>
            // La sugerencia solo llena la lista; la partida cambia al pulsar "Confirmar".
            run([
              async () => {
                const result = await actions.suggestHeadings(quoteId);
                if (result.ok) setFound(result.data);
                return result;
              },
            ])
          }
        >
          {t.suggest}
        </button>
      </form>
      {found?.length === 0 && <p className="text-fg-muted">{t.noResults}</p>}
      <ul className="flex flex-col gap-2">
        {found?.map((heading) => (
          <li
            key={heading.code}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2"
          >
            <span>
              <strong>{heading.code}</strong> ·{" "}
              {locale === "en" ? heading.descriptionEn : heading.descriptionEs}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => run([() => actions.confirmHeading(quoteId, heading.code)], "costos")}
            >
              {t.confirm} {heading.code}
            </button>
          </li>
        ))}
      </ul>
      <ErrorAlert error={error} />
    </div>
  );
}
