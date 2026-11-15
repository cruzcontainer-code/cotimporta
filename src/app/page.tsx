import Link from "next/link";
import { getLocale } from "next-intl/server";
import { type Copy, isLocale } from "@/i18n/messages";

type HomeCopy = {
  title: string;
  lead: string;
  blocks: { title: string; body: string }[];
  signUp: string;
  signIn: string;
};

const copy: Copy<HomeCopy> = {
  es: {
    title: "Cotiza tu importación puesta en Perú",
    lead: "Conoce el costo total de tu proyecto con tributos, etapas de pago y precio de venta.",
    blocks: [
      {
        title: "Cómo funciona",
        body: "Describe tu producto, sube la ficha técnica del proveedor y obtén una cotización formal en PDF.",
      },
      {
        title: "1 cotización gratis",
        body: "Tu primera cotización es completa: costos, tributos, etapas de pago y explicación.",
      },
      {
        title: "Plan mensual",
        body: "Hasta 10 cotizaciones al mes para evaluar en qué negocio invertir.",
      },
    ],
    signUp: "Crear cuenta",
    signIn: "Iniciar sesión",
  },
  en: {
    title: "Quote your import landed in Peru",
    lead: "Know the total cost of your project with taxes, payment stages and selling price.",
    blocks: [
      {
        title: "How it works",
        body: "Describe your product, upload the supplier's technical sheet and get a formal PDF quote.",
      },
      {
        title: "1 free quote",
        body: "Your first quote is complete: costs, taxes, payment stages and explanation.",
      },
      {
        title: "Monthly plan",
        body: "Up to 10 quotes per month to decide which business to invest in.",
      },
    ],
    signUp: "Sign up",
    signIn: "Sign in",
  },
};

export default async function HomePage() {
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];

  return (
    <section className="flex flex-col gap-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-fg-muted">{t.lead}</p>
        <div className="flex gap-3">
          <Link href="/auth/sign-up" className="btn btn-primary">
            {t.signUp}
          </Link>
          <Link href="/auth/sign-in" className="btn btn-ghost">
            {t.signIn}
          </Link>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {t.blocks.map((block) => (
          <article key={block.title} className="card">
            <h2 className="mb-2 text-lg font-semibold">{block.title}</h2>
            <p className="text-fg-muted">{block.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
