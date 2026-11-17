import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { type Copy, isLocale, type Locale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { formatPen, formatUsd } from "@/lib/engine/money";
import {
  cancelSubscription,
  getBillingView,
  simulateFakePayment,
  startCheckout,
} from "@/server/billing/service";
import { toResult } from "@/server/errors";

export const dynamic = "force-dynamic";

type Texts = {
  title: string;
  perMonth: string;
  quota: (n: number) => string;
  remaining: (n: number) => string;
  status: Record<string, string>;
  free: string;
  until: string;
  cancelAtEnd: string;
  subscribe: string;
  cancel: string;
  unavailable: string;
  checkoutError: string;
  cancelError: string;
  canceled: string;
  paid: string;
  fakeTitle: string;
  simulate: string;
};

const copy: Copy<Texts> = {
  es: {
    title: "Plan",
    perMonth: "al mes",
    quota: (n) => `${n} cotizaciones por mes`,
    remaining: (n) => `Te quedan ${n} cotizaciones en este periodo.`,
    status: {
      incomplete: "Pago pendiente",
      active: "Activa",
      past_due: "Pago vencido",
      canceled: "Cancelada",
      expired: "Vencida",
    },
    free: "Estás en el plan gratuito.",
    until: "Periodo actual hasta",
    cancelAtEnd: "Se cancelará al terminar el periodo.",
    subscribe: "Suscribirme",
    cancel: "Cancelar suscripción",
    unavailable: "El plan aún no está disponible",
    checkoutError: "No pudimos iniciar el pago. Intenta de nuevo.",
    cancelError: "No pudimos cancelar la suscripción.",
    canceled: "Tu suscripción se cancelará al terminar el periodo.",
    paid: "Pago registrado. Tu plan está activo.",
    fakeTitle: "Pago de prueba (solo desarrollo)",
    simulate: "Simular pago",
  },
  en: {
    title: "Plan",
    perMonth: "per month",
    quota: (n) => `${n} quotes per month`,
    remaining: (n) => `You have ${n} quotes left in this period.`,
    status: {
      incomplete: "Payment pending",
      active: "Active",
      past_due: "Past due",
      canceled: "Canceled",
      expired: "Expired",
    },
    free: "You are on the free plan.",
    until: "Current period until",
    cancelAtEnd: "It will be canceled at the end of the period.",
    subscribe: "Subscribe",
    cancel: "Cancel subscription",
    unavailable: "The plan is not available yet",
    checkoutError: "We could not start the payment. Try again.",
    cancelError: "We could not cancel the subscription.",
    canceled: "Your subscription will be canceled at the end of the period.",
    paid: "Payment recorded. Your plan is active.",
    fakeTitle: "Test payment (development only)",
    simulate: "Simulate payment",
  },
};

async function subscribeAction(): Promise<void> {
  "use server";
  const result = await toResult(async () => startCheckout(await requireActor()));
  // redirect() fuera de toResult: lanza una excepción interna que toResult atraparía.
  if (!result.ok) {
    redirect(`/app/billing?error=${result.error.code === "CONFLICT" ? "unavailable" : "checkout"}`);
  }
  redirect(result.data.redirectUrl);
}

async function cancelAction(): Promise<void> {
  "use server";
  const result = await toResult(async () => cancelSubscription(await requireActor()));
  revalidatePath("/app/billing");
  redirect(result.ok ? "/app/billing?canceled=1" : "/app/billing?error=cancel");
}

async function simulateAction(formData: FormData): Promise<void> {
  "use server";
  const orderId = String(formData.get("orderId") ?? "").slice(0, 100);
  const result = await toResult(async () => simulateFakePayment(await requireActor(), orderId));
  revalidatePath("/app/billing");
  redirect(
    result.ok && result.data.status === 200 ? "/app/billing?paid=1" : "/app/billing?error=checkout",
  );
}

type Props = {
  searchParams: Promise<{
    error?: string;
    canceled?: string;
    paid?: string;
    fake_checkout?: string;
  }>;
};

export default async function BillingPage({ searchParams }: Props) {
  const params = await searchParams;
  const view = await getBillingView(await requireActor());
  const localeValue = await getLocale();
  const locale: Locale = isLocale(localeValue) ? localeValue : "es";
  const t = copy[locale];
  const price = view.currency === "PEN" ? formatPen(view.priceMinor) : formatUsd(view.priceMinor);
  const sub = view.subscription;
  const active = sub?.status === "active";
  const message =
    params.error === "unavailable"
      ? t.unavailable
      : params.error === "checkout"
        ? t.checkoutError
        : params.error === "cancel"
          ? t.cancelError
          : null;
  const notice = params.paid ? t.paid : params.canceled ? t.canceled : null;
  const date = (value: Date) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-PE" : "en-US", {
      dateStyle: "long",
      timeZone: "America/Lima",
    }).format(value);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
      {message && (
        <p role="alert" className="text-danger">
          {message}
        </p>
      )}
      {notice && (
        <p aria-live="polite" className="text-success">
          {notice}
        </p>
      )}
      <article className="card flex flex-col gap-3">
        {view.plan && (
          <>
            <h2 className="text-lg font-semibold">
              {locale === "es" ? view.plan.nameEs : view.plan.nameEn}
            </h2>
            <p>
              <strong>{price}</strong> {t.perMonth} · {t.quota(view.plan.quota)}
            </p>
          </>
        )}
        <p>{view.entitlement === "subscription" ? t.remaining(view.remaining) : t.free}</p>
        {view.entitlement === "free" && (
          <p className="text-fg-muted">{t.remaining(view.remaining)}</p>
        )}
        {sub && (
          <p>
            <span className="badge">{t.status[sub.status] ?? sub.status}</span>
            {sub.currentPeriodEnd && (
              <>
                {" "}
                {t.until} {date(sub.currentPeriodEnd)}
              </>
            )}
          </p>
        )}
        {sub?.cancelAtPeriodEnd && <p className="text-fg-muted">{t.cancelAtEnd}</p>}
        <div className="flex flex-wrap gap-2">
          {!active && (
            <form action={subscribeAction}>
              <button type="submit" className="btn btn-primary">
                {t.subscribe}
              </button>
            </form>
          )}
          {active && !sub?.cancelAtPeriodEnd && (
            <form action={cancelAction}>
              <button type="submit" className="btn btn-ghost">
                {t.cancel}
              </button>
            </form>
          )}
        </div>
      </article>
      {view.provider === "fake" && params.fake_checkout && (
        <article className="card flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.fakeTitle}</h2>
          <form action={simulateAction}>
            <input type="hidden" name="orderId" value={params.fake_checkout} />
            <button type="submit" className="btn btn-primary">
              {t.simulate}
            </button>
          </form>
        </article>
      )}
    </section>
  );
}
