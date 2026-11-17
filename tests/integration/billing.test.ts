import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/payments/[provider]/route";
import { requireEnv } from "@/lib/env";
import type { Actor } from "@/server/authz";
import { fakeCheckouts, nextMonth, signFakeEvent } from "@/server/billing/provider";
import { startCheckout } from "@/server/billing/service";
import { AppError } from "@/server/errors";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
// Planes propios de este archivo: nunca se tocan las filas del seed.
const ACTIVE = `test-${randomUUID()}`;
const INACTIVE = `test-${randomUUID()}`;
const FREE = `test-${randomUUID()}`;

beforeAll(async () => {
  await sql`
    insert into plans (code, name_es, name_en, price_pen_minor, price_usd_minor, quota_per_period, active)
    values
      (${ACTIVE}, 'Plan prueba', 'Test plan', 4900, 1500, 10, true),
      (${INACTIVE}, 'Plan inactivo', 'Inactive plan', 4900, 1500, 10, false),
      (${FREE}, 'Plan sin precio', 'Free plan', 0, 0, 10, true)
  `;
});

afterAll(async () => {
  await sql.end();
});

async function user(country = "PE"): Promise<Actor> {
  const id = randomUUID();
  await sql`
    insert into users (id, name, email, email_verified)
    values (${id}, 'Prueba', ${`${id}@cotimporta.test`}, true)
  `;
  await sql`insert into profiles (user_id, country) values (${id}, ${country})`;
  return { userId: id, role: "user" };
}

function event(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${randomUUID()}`,
    type: "payment.succeeded",
    userId,
    planCode: ACTIVE,
    currency: "PEN",
    amountMinor: 4900,
    occurredAt: "2026-03-15T12:00:00Z",
    providerRef: `fake_${randomUUID()}`,
    ...overrides,
  };
}

function post(body: unknown, signature?: string, provider = "fake") {
  const raw = JSON.stringify(body);
  return POST(
    new Request(`http://localhost/api/webhooks/payments/${provider}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fake-signature": signature ?? signFakeEvent(raw),
      },
      body: raw,
    }),
    { params: Promise.resolve({ provider }) },
  );
}

const subscription = async (userId: string) =>
  (
    await sql<
      {
        status: string;
        current_period_start: Date | null;
        current_period_end: Date | null;
        cancel_at_period_end: boolean;
      }[]
    >`
      select status, current_period_start, current_period_end, cancel_at_period_end
      from subscriptions where user_id = ${userId}
    `
  )[0];
const counts = async () =>
  (
    await sql<{ events: number; subs: number }[]>`
      select (select count(*)::int from payment_events) as events,
             (select count(*)::int from subscriptions) as subs
    `
  )[0];

async function expectCode(promise: Promise<unknown>, code: AppError["code"]) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

describe("webhook del proveedor falso", () => {
  it("payment.succeeded firmado → evento guardado, suscripción activa un mes y contador en 0", async () => {
    const actor = await user();
    const body = event(actor.userId);
    const response = await post(body);
    expect(response.status).toBe(200);

    const [row] = await sql<{ n: number; processed: boolean }[]>`
      select count(*)::int as n, bool_and(processed_at is not null) as processed
      from payment_events where provider = 'fake' and external_event_id = ${body.id}
    `;
    expect(row).toEqual({ n: 1, processed: true });
    const sub = await subscription(actor.userId);
    expect(sub?.status).toBe("active");
    expect(sub?.current_period_start?.toISOString()).toBe("2026-03-15T12:00:00.000Z");
    expect(sub?.current_period_end?.toISOString()).toBe("2026-04-15T12:00:00.000Z");

    const counters = await sql<{ quotes_used: number; period_start: Date }[]>`
      select quotes_used, period_start from usage_counters
      where user_id = ${actor.userId} and kind = 'subscription'
    `;
    expect(counters).toHaveLength(1);
    expect(counters[0]?.quotes_used).toBe(0);
    expect(counters[0]?.period_start.toISOString()).toBe("2026-03-15T12:00:00.000Z");
  });

  it("el mismo id otra vez → 200 sin cambiar los conteos", async () => {
    const actor = await user();
    const body = event(actor.userId);
    expect((await post(body)).status).toBe(200);
    const before = await counts();
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, duplicate: true });
    expect(await counts()).toEqual(before);
  });

  it("firma incorrecta → 400 sin escribir nada", async () => {
    const actor = await user();
    const before = await counts();
    const body = event(actor.userId);
    expect((await post(body, "0".repeat(64))).status).toBe(400);
    expect((await post(body, "")).status).toBe(400);
    expect(await counts()).toEqual(before);
    expect(await subscription(actor.userId)).toBeUndefined();
  });

  it("un proveedor distinto del configurado → 400", async () => {
    const actor = await user();
    expect((await post(event(actor.userId), undefined, "izipay")).status).toBe(400);
  });

  it("un pago nuevo inicia el periodo siguiente al fin actual con su propio contador en 0", async () => {
    const actor = await user();
    await post(event(actor.userId));
    await sql`
      update usage_counters set quotes_used = 4
      where user_id = ${actor.userId} and kind = 'subscription'
    `;
    await post(event(actor.userId, { occurredAt: "2026-04-10T09:00:00Z" }));
    const sub = await subscription(actor.userId);
    expect(sub?.current_period_start?.toISOString()).toBe("2026-04-15T12:00:00.000Z");
    expect(sub?.current_period_end?.toISOString()).toBe("2026-05-15T12:00:00.000Z");
    const counters = await sql<{ quotes_used: number; period_start: Date }[]>`
      select quotes_used, period_start from usage_counters
      where user_id = ${actor.userId} and kind = 'subscription' order by period_start
    `;
    expect(counters.map((c) => [c.period_start.toISOString(), c.quotes_used])).toEqual([
      ["2026-03-15T12:00:00.000Z", 4],
      ["2026-04-15T12:00:00.000Z", 0],
    ]);
  });

  it("subscription.canceled marca cancel_at_period_end y un tipo desconocido responde 200", async () => {
    const actor = await user();
    await post(event(actor.userId));
    expect((await post(event(actor.userId, { type: "subscription.canceled" }))).status).toBe(200);
    expect((await subscription(actor.userId))?.cancel_at_period_end).toBe(true);
    expect((await post(event(actor.userId, { type: "algo.nuevo" }))).status).toBe(200);
    expect((await subscription(actor.userId))?.status).toBe("active");
  });
});

describe("checkout", () => {
  it("perfil PE cobra en PEN, otro país en USD, y la suscripción queda incomplete", async () => {
    expect(readFileSync("docs/verified/izipay.md", "utf8").split(/\r?\n/)).toContain(
      "status: verified",
    );
    const peru = await user("PE");
    const { redirectUrl } = await startCheckout(peru, ACTIVE);
    expect(redirectUrl).toMatch(/^\/app\/billing\?fake_checkout=/);
    expect(fakeCheckouts.at(-1)).toMatchObject({
      userId: peru.userId,
      planCode: ACTIVE,
      currency: "PEN",
      amountMinor: 4900,
    });
    expect((await subscription(peru.userId))?.status).toBe("incomplete");

    const chile = await user("CL");
    await startCheckout(chile, ACTIVE);
    expect(fakeCheckouts.at(-1)).toMatchObject({
      userId: chile.userId,
      currency: "USD",
      amountMinor: 1500,
    });
  });

  it("plan inactivo, con precio 0 o inexistente → CONFLICT sin pedir cobro", async () => {
    const actor = await user();
    const before = fakeCheckouts.length;
    await expectCode(startCheckout(actor, INACTIVE), "CONFLICT");
    await expectCode(startCheckout(actor, FREE), "CONFLICT");
    await expectCode(startCheckout(actor, `test-${randomUUID()}`), "CONFLICT");
    expect(fakeCheckouts.length).toBe(before);
    expect(await subscription(actor.userId)).toBeUndefined();
  });
});

describe("mes calendario", () => {
  it("suma un mes en UTC y ajusta al último día cuando el día no existe", () => {
    expect(nextMonth(new Date("2026-03-15T12:00:00Z")).toISOString()).toBe(
      "2026-04-15T12:00:00.000Z",
    );
    expect(nextMonth(new Date("2026-01-31T08:00:00Z")).toISOString()).toBe(
      "2026-02-28T08:00:00.000Z",
    );
    expect(nextMonth(new Date("2026-12-31T00:00:00Z")).toISOString()).toBe(
      "2027-01-31T00:00:00.000Z",
    );
  });
});
