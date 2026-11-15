import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requireEnv } from "@/lib/env";
import type { Actor } from "@/server/authz";
import { AppError, logger } from "@/server/errors";
import {
  createQuote,
  getQuote,
  listQuotes,
  renameQuote,
  softDeleteQuote,
} from "@/server/quotes/service";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
const planCode = `test_${randomUUID()}`;

beforeAll(async () => {
  await sql`
    insert into plans (code, name_es, name_en, quota_per_period, active)
    values (${planCode}, 'Plan de prueba', 'Test plan', 10, true)
  `;
});

afterAll(async () => {
  await sql.end();
});

async function verifiedUser(): Promise<Actor> {
  const id = randomUUID();
  await sql`
    insert into users (id, name, email, email_verified)
    values (${id}, 'Prueba', ${`${id}@cotimporta.test`}, true)
  `;
  return { userId: id, role: "user" };
}

async function subscribe(actor: Actor): Promise<Date> {
  const [row] = await sql<{ start: Date }[]>`
    insert into subscriptions
      (user_id, plan_code, provider, currency, status, current_period_start, current_period_end)
    values (${actor.userId}, ${planCode}, 'fake', 'USD', 'active',
            now() - interval '1 day', now() + interval '29 days')
    returning current_period_start as start
  `;
  if (!row) throw new Error("no se creó la suscripción");
  return row.start;
}

async function quoteCount(actor: Actor): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from quotes where user_id = ${actor.userId}
  `;
  return row?.n ?? 0;
}

async function expectCode(promise: Promise<unknown>, code: AppError["code"], status: number) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  expect((error as AppError).status).toBe(status);
}

describe("aislamiento por dueño", () => {
  it("leer, renombrar o borrar una cotización ajena lanza NOT_FOUND y no la toca", async () => {
    const a = await verifiedUser();
    const b = await verifiedUser();
    const bQuote = await createQuote(b, { title: "De B", locale: "es" });

    await expectCode(getQuote(a, bQuote.id), "NOT_FOUND", 404);
    await expectCode(renameQuote(a, bQuote.id, "Robada"), "NOT_FOUND", 404);
    await expectCode(softDeleteQuote(a, bQuote.id), "NOT_FOUND", 404);

    const [row] = await sql<{ title: string; deleted_at: Date | null }[]>`
      select title, deleted_at from quotes where id = ${bQuote.id}
    `;
    expect(row).toEqual({ title: "De B", deleted_at: null });
  });

  it("la lista solo trae cotizaciones propias y no borradas", async () => {
    const a = await verifiedUser();
    const b = await verifiedUser();
    await subscribe(a);
    const kept = [
      await createQuote(a, { title: "A1", locale: "es" }),
      await createQuote(a, { title: "A2", locale: "es" }),
    ];
    const deleted = await createQuote(a, { title: "A3", locale: "es" });
    await softDeleteQuote(a, deleted.id);
    await createQuote(b, { title: "B1", locale: "es" });

    const page = await listQuotes(a);
    expect(page.items.map((quote) => quote.id).sort()).toEqual(
      kept.map((quote) => quote.id).sort(),
    );
    expect(page.items.every((quote) => quote.userId === a.userId && quote.deletedAt === null)).toBe(
      true,
    );

    const first = await listQuotes(a, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await listQuotes(a, { limit: 1, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(second.nextCursor).toBeNull();
  });
});

describe("cuotas", () => {
  it("una cuenta verificada sin plan crea 1 cotización y la segunda lanza QUOTA_EXCEEDED", async () => {
    const actor = await verifiedUser();
    const quote = await createQuote(actor, { title: "Gratis", locale: "es" });
    expect(quote.referenceCode).toMatch(/^COT-\d{4}-\d{4}$/);

    await expectCode(createQuote(actor, { title: "Otra", locale: "es" }), "QUOTA_EXCEEDED", 402);
    expect(await quoteCount(actor)).toBe(1);
  });

  it("una suscripción activa con la cuota usada rechaza la siguiente", async () => {
    const actor = await verifiedUser();
    const periodStart = await subscribe(actor);
    await sql`
      insert into usage_counters (user_id, kind, period_start, quotes_used)
      values (${actor.userId}, 'subscription', ${periodStart}, 10)
    `;
    await expectCode(createQuote(actor, { title: "Once", locale: "es" }), "QUOTA_EXCEEDED", 402);
    expect(await quoteCount(actor)).toBe(0);
  });

  it("dos creaciones concurrentes por la última cotización crean exactamente una", async () => {
    const actor = await verifiedUser();
    const results = await Promise.allSettled([
      createQuote(actor, { title: "Carrera 1", locale: "es" }),
      createQuote(actor, { title: "Carrera 2", locale: "es" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(await quoteCount(actor)).toBe(1);
  });
});

describe("logger", () => {
  it("redacta password y token, también anidados", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((line: string) => {
      lines.push(line);
    });
    try {
      logger.error("prueba", { password: "secreto-1", nested: { token: "t-2" }, ok: "visible" });
    } finally {
      spy.mockRestore();
    }
    const entry = JSON.parse(lines[0] ?? "{}");
    expect(entry.password).toBe("[REDACTED]");
    expect(entry.nested.token).toBe("[REDACTED]");
    expect(entry.ok).toBe("visible");
    expect(lines[0]).not.toContain("secreto-1");
  });
});
