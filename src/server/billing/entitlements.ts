import { and, eq, sql } from "drizzle-orm";
import { plans, subscriptions, usageCounters, users } from "@/db/schema";
import type { Tx } from "@/server/authz";
import { AppError } from "@/server/errors";

export type CounterKey = {
  kind: "free" | "subscription";
  periodStart: Date;
  periodEnd: Date | null;
};
export type Entitlement = {
  kind: "subscription" | "free" | "none";
  remaining: number;
  counterKey: CounterKey | null;
};

const FREE_PERIOD_START = new Date("1970-01-01T00:00:00Z");
const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_QUOTA = 1;

async function quotesUsed(tx: Tx, userId: string, key: CounterKey, lock: boolean): Promise<number> {
  const query = tx
    .select({ used: usageCounters.quotesUsed })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.kind, key.kind),
        eq(usageCounters.periodStart, key.periodStart),
      ),
    );
  const [row] = lock ? await query.for("update") : await query;
  return row?.used ?? 0;
}

async function resolveKey(
  tx: Tx,
  userId: string,
  now: Date,
): Promise<{ kind: Entitlement["kind"]; quota: number; counterKey: CounterKey | null }> {
  const [sub] = await tx
    .select({
      status: subscriptions.status,
      start: subscriptions.currentPeriodStart,
      end: subscriptions.currentPeriodEnd,
      quota: plans.quotaPerPeriod,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.code, subscriptions.planCode))
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (sub?.start && sub.end) {
    const inPeriod = sub.status === "active" && sub.end.getTime() > now.getTime();
    const inGrace =
      sub.status === "past_due" && sub.end.getTime() + PAST_DUE_GRACE_MS > now.getTime();
    if (inPeriod || inGrace) {
      return {
        kind: "subscription",
        quota: sub.quota,
        counterKey: { kind: "subscription", periodStart: sub.start, periodEnd: sub.end },
      };
    }
  }

  const [user] = await tx
    .select({ verified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user?.verified) {
    return {
      kind: "free",
      quota: FREE_QUOTA,
      counterKey: { kind: "free", periodStart: FREE_PERIOD_START, periodEnd: null },
    };
  }
  return { kind: "none", quota: 0, counterKey: null };
}

/** Cuántas cotizaciones puede crear ahora el usuario y con qué contador. */
export async function getEntitlement(tx: Tx, userId: string, now: Date): Promise<Entitlement> {
  const { kind, quota, counterKey } = await resolveKey(tx, userId, now);
  if (!counterKey) {
    return { kind, remaining: 0, counterKey };
  }
  const used = await quotesUsed(tx, userId, counterKey, false);
  return { kind, remaining: Math.max(0, quota - used), counterKey };
}

/**
 * Consume una cotización dentro de la transacción del llamador: crea el contador si falta,
 * lo bloquea (select … for update), re-evalúa y lanza QUOTA_EXCEEDED o incrementa.
 */
export async function consumeQuote(tx: Tx, userId: string, now: Date): Promise<Entitlement> {
  const { kind, quota, counterKey } = await resolveKey(tx, userId, now);
  if (!counterKey) {
    throw new AppError("QUOTA_EXCEEDED", "Necesitas verificar tu correo o un plan para cotizar");
  }
  await tx
    .insert(usageCounters)
    .values({
      userId,
      kind: counterKey.kind,
      periodStart: counterKey.periodStart,
      periodEnd: counterKey.periodEnd,
    })
    .onConflictDoNothing();
  const used = await quotesUsed(tx, userId, counterKey, true);
  if (quota - used <= 0) {
    throw new AppError(
      "QUOTA_EXCEEDED",
      "Ya usaste todas las cotizaciones de tu plan en este periodo",
    );
  }
  await tx
    .update(usageCounters)
    .set({ quotesUsed: sql`${usageCounters.quotesUsed} + 1` })
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.kind, counterKey.kind),
        eq(usageCounters.periodStart, counterKey.periodStart),
      ),
    );
  return { kind, remaining: quota - used - 1, counterKey };
}
