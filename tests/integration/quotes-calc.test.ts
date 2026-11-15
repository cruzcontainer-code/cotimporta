import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { seed } from "@/db/seed";
import { requireEnv } from "@/lib/env";
import type { Actor } from "@/server/authz";
import { AppError } from "@/server/errors";
import {
  type CostLineInput,
  calculateQuote,
  confirmHeading,
  createQuote,
  getQuoteView,
  saveCostLines,
  saveFx,
  saveItems,
  saveSupplierTerms,
} from "@/server/quotes/service";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });

beforeAll(async () => {
  await seed(db);
});

afterAll(async () => {
  await sql.end();
});

async function verifiedActor(): Promise<Actor> {
  const id = randomUUID();
  await sql`
    insert into users (id, name, email, email_verified)
    values (${id}, 'Prueba', ${`${id}@cotimporta.test`}, true)
  `;
  return { userId: id, role: "user" };
}

async function newQuote(actor: Actor): Promise<string> {
  const quote = await createQuote(actor, { title: "BG-880", locale: "es" });
  return quote.id;
}

async function expectAppError(
  promise: Promise<unknown>,
  code: AppError["code"],
): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

const TERMS = {
  advanceBps: 3_000,
  balanceBps: 7_000,
  productionDaysMin: 30,
  productionDaysMax: 35,
  shippingCoordinationDays: 7,
  transitDaysMin: 30,
  transitDaysMax: 40,
};

async function readyQuote(actor: Actor): Promise<string> {
  const quoteId = await newQuote(actor);
  await saveItems(actor, quoteId, [
    { description: "Planta BG-880", quantity: 1, totalMinor: 1_200_000 },
  ]);
  await confirmHeading(actor, quoteId, "8477300000");
  await saveSupplierTerms(actor, quoteId, TERMS);
  return quoteId;
}

describe("cálculo persistido", () => {
  it("guarda result, 6 etapas y una fila de desglose por línea tributaria, todas del dueño", async () => {
    const actor = await verifiedActor();
    const quoteId = await readyQuote(actor);
    await saveFx(actor, quoteId, { penPerUsdE4: 35_000, date: "2026-10-29", source: "Prueba" });

    const result = await calculateQuote(actor, quoteId);
    // Gastos demo copiados al confirmar la partida = mismos montos que la golden.
    expect(result.totalMinor).toBe(1_733_230);

    const [quote] = await sql<
      { status: string; has_result: boolean; rules_as_of: string | null }[]
    >`
      select status, result is not null as has_result, rules_as_of::text from quotes where id = ${quoteId}
    `;
    expect(quote).toMatchObject({ status: "calculated", has_result: true });
    expect(quote?.rules_as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const stages = await sql<{ stage_no: number; user_id: string }[]>`
      select stage_no, user_id from quote_stages where quote_id = ${quoteId} order by stage_no
    `;
    expect(stages.map((stage) => stage.stage_no)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(stages.every((stage) => stage.user_id === actor.userId)).toBe(true);

    const breakdown = await sql<{ user_id: string }[]>`
      select user_id from quote_tax_breakdown where quote_id = ${quoteId}
    `;
    expect(breakdown).toHaveLength(result.taxLines.length);
    expect(breakdown.every((row) => row.user_id === actor.userId)).toBe(true);

    // Recalcular reemplaza, no duplica.
    await calculateQuote(actor, quoteId);
    const [count] = await sql<{ n: number }[]>`
      select count(*)::int as n from quote_stages where quote_id = ${quoteId}
    `;
    expect(count?.n).toBe(6);
  });

  it("al releer trae el snapshot con tabla, id, effective_from y source_url de cada regla", async () => {
    const actor = await verifiedActor();
    const quoteId = await readyQuote(actor);
    await saveFx(actor, quoteId, { penPerUsdE4: 35_000, date: "2026-10-29", source: "Prueba" });
    await calculateQuote(actor, quoteId);

    const view = await getQuoteView(actor, quoteId);
    expect(view.snapshot.length).toBeGreaterThanOrEqual(5);
    for (const rule of view.snapshot) {
      expect(rule).toEqual({
        table: expect.stringMatching(/^[a-z_]+$/),
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        sourceUrl: expect.any(String),
      });
    }
    expect(view.snapshot.map((rule) => rule.table)).toEqual(
      expect.arrayContaining(["tariff_headings", "tariff_rates", "tax_rates", "perception_rules"]),
    );
    // Las reglas demo están sin verificar: la UI muestra el badge.
    expect(view.unverifiedRules).toBe(true);
  });
});

describe("validaciones", () => {
  it("una línea inCif con origen local da VALIDATION 422 y no guarda nada", async () => {
    const actor = await verifiedActor();
    const quoteId = await readyQuote(actor);
    const before =
      await sql`select id from quote_cost_lines where quote_id = ${quoteId} order by id`;

    const bad: CostLineInput = {
      conceptCode: "intl_freight",
      label: "Flete",
      group: "origin_freight",
      origin: "local",
      igvApplicable: true,
      inCif: true,
      amountMinor: 90_000,
      currency: "USD",
    };
    const error = await expectAppError(saveCostLines(actor, quoteId, [bad]), "VALIDATION");
    expect(error.status).toBe(422);
    const after =
      await sql`select id from quote_cost_lines where quote_id = ${quoteId} order by id`;
    expect(after).toEqual(before);
  });

  it("términos cuyo adelanto + saldo no suman 10000 bps dan VALIDATION", async () => {
    const actor = await verifiedActor();
    const quoteId = await newQuote(actor);
    await expectAppError(
      saveSupplierTerms(actor, quoteId, { ...TERMS, advanceBps: 3_000, balanceBps: 6_000 }),
      "VALIDATION",
    );
  });

  it("confirmar una partida inexistente da VALIDATION y conserva la anterior", async () => {
    const actor = await verifiedActor();
    const quoteId = await newQuote(actor);
    await confirmHeading(actor, quoteId, "8477300000");
    await expectAppError(confirmHeading(actor, quoteId, "9999999999"), "VALIDATION");
    const [row] = await sql<{ code: string | null }[]>`
      select tariff_heading_code as code from quotes where id = ${quoteId}
    `;
    expect(row?.code).toBe("8477300000");
  });

  it("calcular sin tipo de cambio da VALIDATION con un mensaje que nombra fx", async () => {
    const actor = await verifiedActor();
    const quoteId = await readyQuote(actor);
    const error = await expectAppError(calculateQuote(actor, quoteId), "VALIDATION");
    expect(error.message).toMatch(/fx/);
  });

  it("una cotización ajena no se puede calcular ni leer", async () => {
    const owner = await verifiedActor();
    const other = await verifiedActor();
    const quoteId = await readyQuote(owner);
    await expectAppError(calculateQuote(other, quoteId), "NOT_FOUND");
    await expectAppError(getQuoteView(other, quoteId), "NOT_FOUND");
  });
});
