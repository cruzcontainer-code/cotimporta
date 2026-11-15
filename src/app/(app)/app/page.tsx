import Link from "next/link";
import { getLocale } from "next-intl/server";
import { type Copy, isLocale } from "@/i18n/messages";

const copy: Copy<{ title: string; cardTitle: string; cardBody: string; cta: string }> = {
  es: {
    title: "Panel",
    cardTitle: "Tus cotizaciones",
    cardBody: "Crea una cotización nueva o revisa las que ya tienes.",
    cta: "Ir a cotizaciones",
  },
  en: {
    title: "Dashboard",
    cardTitle: "Your quotes",
    cardBody: "Create a new quote or review the ones you already have.",
    cta: "Go to quotes",
  },
};

export default async function DashboardPage() {
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
      <article className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.cardTitle}</h2>
        <p className="text-fg-muted">{t.cardBody}</p>
        <Link href="/app/quotes" className="btn btn-primary self-start">
          {t.cta}
        </Link>
      </article>
    </section>
  );
}
