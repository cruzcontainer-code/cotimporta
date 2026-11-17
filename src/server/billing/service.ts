import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { paymentEvents, plans, profiles, subscriptions, usageCounters, users } from "@/db/schema";
import { getEnv } from "@/lib/env";
import type { Actor, Tx } from "@/server/authz";
import { getEntitlement } from "@/server/billing/entitlements";
import {
  type Currency,
  getPaymentProvider,
  nextMonth,
  type PaymentProvider,
  signFakeEvent,
  type VerifiedEvent,
} from "@/server/billing/provider";
import { AppError, logger } from "@/server/errors";

// Única escritora de `subscriptions`: el checkout la deja `incomplete` y solo un evento verificado
// del proveedor la activa, la renueva o la marca para cancelar.

const DEFAULT_PLAN = "mensual";

async function profileCurrency(userId: string): Promise<Currency> {
  const [profile] = await db
    .select({ country: profiles.country })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return profile?.country === "PE" ? "PEN" : "USD";
}

async function findPlan(code: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.code, code)).limit(1);
  return plan ?? null;
}

const priceOf = (plan: typeof plans.$inferSelect, currency: Currency) =>
  currency === "PEN" ? plan.pricePenMinor : plan.priceUsdMinor;

/**
 * Inicia el cobro del plan: moneda por país del perfil (PE → PEN, otro → USD); plan inactivo o con
 * precio 0 → CONFLICT. Deja la suscripción `incomplete` (una activa conserva su estado).
 */
export async function startCheckout(
  actor: Actor,
  planCode: string = DEFAULT_PLAN,
): Promise<{ redirectUrl: string }> {
  const currency = await profileCurrency(actor.userId);
  const plan = await findPlan(planCode);
  const amountMinor = plan ? priceOf(plan, currency) : 0;
  if (!plan?.active || amountMinor <= 0) {
    throw new AppError("CONFLICT", "El plan aún no está disponible");
  }
  const provider = getPaymentProvider() as PaymentProvider;
  const baseUrl = getEnv().BETTER_AUTH_URL ?? "http://localhost:3000";
  const checkout = await provider.createCheckout({
    userId: actor.userId,
    planCode: plan.code,
    currency,
    amountMinor,
    orderId: randomUUID(),
    returnUrl: `${baseUrl}/app/billing`,
  });
  await db
    .insert(subscriptions)
    .values({
      userId: actor.userId,
      planCode: plan.code,
      provider: provider.name,
      currency,
      status: "incomplete",
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planCode: plan.code,
        provider: provider.name,
        currency,
        status: sql`case when ${subscriptions.status} = 'active' then ${subscriptions.status} else 'incomplete'::subscription_status end`,
        updatedAt: new Date(),
      },
    });
  return { redirectUrl: checkout.redirectUrl };
}

async function userExists(tx: Tx, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row);
}

/** Pago confirmado: periodo nuevo de un mes calendario desde max(fecha de pago, fin actual). */
async function activate(tx: Tx, event: VerifiedEvent, userId: string, provider: string) {
  const [current] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1)
    .for("update");
  const planCode = event.planCode ?? current?.planCode ?? DEFAULT_PLAN;
  const end = current?.currentPeriodEnd;
  const start = end && end.getTime() > event.occurredAt.getTime() ? end : event.occurredAt;
  const periodEnd = nextMonth(start);
  const values = {
    planCode,
    provider,
    currency: event.currency ?? current?.currency ?? "PEN",
    status: "active" as const,
    currentPeriodStart: start,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    providerRef: event.providerRef ?? current?.providerRef ?? null,
    updatedAt: new Date(),
  };
  if (current) {
    await tx.update(subscriptions).set(values).where(eq(subscriptions.userId, userId));
  } else {
    await tx.insert(subscriptions).values({ userId, ...values });
  }
  await tx
    .insert(usageCounters)
    .values({
      userId,
      kind: "subscription",
      periodStart: start,
      periodEnd,
      quotesUsed: 0,
    })
    .onConflictDoNothing();
}

export type WebhookOutcome = { status: 200 | 400; body: { ok: boolean; duplicate?: boolean } };

/**
 * Procesa un webhook: firma inválida → 400 sin escribir; duplicado → 200 sin cambios.
 * El evento y su efecto en subscriptions se escriben en la misma transacción.
 */
export async function handleWebhook(
  providerName: string,
  rawBody: string,
  headers: Headers,
): Promise<WebhookOutcome> {
  const provider = getPaymentProvider(providerName);
  const event = provider?.verifyWebhook(rawBody, headers) ?? null;
  if (!provider || !event) {
    logger.warn("webhook de pagos rechazado", { provider: providerName });
    return { status: 400, body: { ok: false } };
  }

  const result = await db.transaction(async (tx) => {
    const userId = (await userExists(tx, event.userId)) ? event.userId : null;
    const [inserted] = await tx
      .insert(paymentEvents)
      .values({
        provider: provider.name,
        externalEventId: event.externalEventId,
        type: event.type,
        userId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        payload: event.raw as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });
    if (!inserted) return { duplicate: true, activated: false };

    let activated = false;
    if (userId && event.type === "payment.succeeded") {
      await activate(tx, event, userId, provider.name);
      activated = true;
    } else if (userId && event.type === "payment.failed") {
      await tx
        .update(subscriptions)
        .set({
          status: sql`case when ${subscriptions.status} = 'active' then 'past_due'::subscription_status else ${subscriptions.status} end`,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId));
    } else if (userId && event.type === "subscription.canceled") {
      await tx
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
    } else {
      logger.info("webhook de pagos sin efecto", { provider: provider.name, type: event.type });
    }
    await tx
      .update(paymentEvents)
      .set({ processedAt: new Date() })
      .where(eq(paymentEvents.id, inserted.id));
    return { duplicate: false, activated };
  });

  if (result.duplicate) return { status: 200, body: { ok: true, duplicate: true } };
  if (result.activated && event.userId && provider.startRecurring) {
    // Fuera de la transacción: si falla, el pago ya quedó registrado y se reintenta a mano.
    try {
      const ref = await provider.startRecurring(event);
      if (ref) {
        await db
          .update(subscriptions)
          .set({ providerRef: ref, updatedAt: new Date() })
          .where(eq(subscriptions.userId, event.userId));
      }
    } catch (error) {
      logger.warn("no se pudo programar la renovación", {
        code: error instanceof AppError ? error.code : "INTERNAL",
      });
    }
  }
  return { status: 200, body: { ok: true } };
}

/** Cancela al final del periodo; si el proveedor tiene la suscripción, también allí. */
export async function cancelSubscription(actor: Actor): Promise<void> {
  const [current] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, actor.userId))
    .limit(1);
  if (current?.status !== "active") {
    throw new AppError("CONFLICT", "No tienes una suscripción activa");
  }
  if (current.providerRef) {
    await getPaymentProvider()?.cancel(current.providerRef);
  }
  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(and(eq(subscriptions.userId, actor.userId), eq(subscriptions.id, current.id)));
}

export type BillingView = {
  plan: { code: string; nameEs: string; nameEn: string; quota: number; active: boolean } | null;
  currency: Currency;
  priceMinor: number;
  remaining: number;
  entitlement: "subscription" | "free" | "none";
  subscription: {
    status: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  provider: string;
};

/** Datos de la página de plan: precio en la moneda del perfil, cuota restante y suscripción. */
export async function getBillingView(actor: Actor): Promise<BillingView> {
  const [currency, plan, [subscription], entitlement] = await Promise.all([
    profileCurrency(actor.userId),
    findPlan(DEFAULT_PLAN),
    db.select().from(subscriptions).where(eq(subscriptions.userId, actor.userId)).limit(1),
    getEntitlement(db, actor.userId, new Date()),
  ]);
  return {
    plan: plan
      ? {
          code: plan.code,
          nameEs: plan.nameEs,
          nameEn: plan.nameEn,
          quota: plan.quotaPerPeriod,
          active: plan.active,
        }
      : null,
    currency,
    priceMinor: plan ? priceOf(plan, currency) : 0,
    remaining: entitlement.remaining,
    entitlement: entitlement.kind,
    subscription: subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    provider: getPaymentProvider()?.name ?? "fake",
  };
}

/**
 * Solo desarrollo con el driver falso: "Simular pago" arma y firma el evento que enviaría el
 * proveedor y lo procesa por el mismo camino que el webhook real.
 */
export async function simulateFakePayment(actor: Actor, orderId: string): Promise<WebhookOutcome> {
  // getEnv() rechaza PAYMENT_PROVIDER=fake en producción, así que esto nunca corre allí.
  if (getPaymentProvider()?.name !== "fake") {
    throw new AppError("NOT_FOUND", "No disponible");
  }
  const [current] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, actor.userId))
    .limit(1);
  const currency = current?.currency ?? (await profileCurrency(actor.userId));
  const plan = await findPlan(current?.planCode ?? DEFAULT_PLAN);
  const body = JSON.stringify({
    id: `fake_${orderId}`,
    type: "payment.succeeded",
    userId: actor.userId,
    planCode: plan?.code ?? DEFAULT_PLAN,
    currency,
    amountMinor: plan ? priceOf(plan, currency) : 0,
    occurredAt: new Date().toISOString(),
    providerRef: `fake_${orderId}`,
  });
  return handleWebhook("fake", body, new Headers({ "x-fake-signature": signFakeEvent(body) }));
}
