import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { seed } from "@/db/seed";
import { requireEnv } from "@/lib/env";
import { setFakeResponse } from "@/server/ai/gateway";
import { generateNarrative, refreshNarrative } from "@/server/ai/narrative";
import { buildSuggestHeadingPrompt, suggestHeadings } from "@/server/ai/suggest-heading";
import type { Actor } from "@/server/authz";
import { AppError } from "@/server/errors";
import {
  calculateQuote,
  confirmHeading,
  createQuote,
  saveFx,
  saveItems,
  saveSupplierTerms,
} from "@/server/quotes/service";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
const SEEDED = "8477300000";
// Códigos de prueba únicos: "99" + 8 dígitos al azar (tabla global de reglas).
const testCode = () => `99${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;

beforeAll(async () => {
  await seed(db);
});

afterEach(() => {
  setFakeResponse("suggest_heading", undefined);
  setFakeResponse("narrative", undefined);
});

afterAll(async () => {
  await sql.end();
});

async function verifiedActor(): Promise<Actor> {
  const id = randomUUID();
  await sql`
    insert into users (id, name, email, email_verified)
    values (${id}, ${`Cliente ${id.slice(0, 8)}`}, ${`${id}@cotimporta.test`}, true)
  `;
  return { userId: id, role: "user" };
}

async function insertHeading(code: string, effectiveTo: string | null = null) {
  await sql`
    insert into tariff_headings (code, description_es, description_en, effective_from, effective_to, source_url)
    values (${code}, 'Partida de prueba', 'Test heading', '2000-01-01', ${effectiveTo}, 'https://example.test/arancel')
  `;
}

const headingOf = async (quoteId: string) =>
  (
    await sql<{ tariff_heading_code: string | null }[]>`
      select tariff_heading_code from quotes where id = ${quoteId}
    `
  )[0]?.tariff_heading_code;

async function expectCode(promise: Promise<unknown>, code: AppError["code"]) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

describe("partida sugerida y validada", () => {
  it("de tres sugeridas, devuelve solo las dos vigentes con justificación y confianza 0..1", async () => {
    const actor = await verifiedActor();
    const quote = await createQuote(actor, { title: "Sugerencia", locale: "es" });
    const published = testCode();
    const missing = testCode();
    await insertHeading(published);
    setFakeResponse("suggest_heading", {
      candidates: [
        { code: SEEDED, rationale: "Máquina para moldear plástico", confidence: 0.8 },
        { code: missing, rationale: "No existe en el arancel", confidence: 0.5 },
        { code: published, rationale: "Alternativa publicada", confidence: 0.3 },
      ],
    });

    const result = await suggestHeadings(actor, quote.id);
    expect(result.reason).toBeUndefined();
    expect(result.candidates.map((c) => c.code)).toEqual([SEEDED, published]);
    for (const candidate of result.candidates) {
      expect(candidate.rationale.length).toBeGreaterThan(0);
      expect(candidate.confidence).toBeGreaterThanOrEqual(0);
      expect(candidate.confidence).toBeLessThanOrEqual(1);
      expect(candidate.descriptionEs.length).toBeGreaterThan(0);
    }

    const [audit] = await sql<{ n: number }[]>`
      select count(*)::int as n from audit_events
      where action = 'heading.suggested' and entity_id = ${quote.id} and actor_user_id = ${actor.userId}
    `;
    expect(audit?.n).toBe(1);
  });

  it("si ninguna está vigente devuelve lista vacía con NO_VALID_CANDIDATES", async () => {
    const actor = await verifiedActor();
    const quote = await createQuote(actor, { title: "Sin partida", locale: "es" });
    const expired = testCode();
    await insertHeading(expired, "2001-01-01");
    setFakeResponse("suggest_heading", {
      candidates: [
        { code: testCode(), rationale: "Inventada", confidence: 0.9 },
        { code: expired, rationale: "Ya no vigente", confidence: 0.4 },
      ],
    });
    expect(await suggestHeadings(actor, quote.id)).toEqual({
      candidates: [],
      reason: "NO_VALID_CANDIDATES",
    });
  });

  it("sugerir no cambia quotes.tariff_heading_code hasta que el usuario confirma", async () => {
    const actor = await verifiedActor();
    const quote = await createQuote(actor, { title: "Sin confirmar", locale: "es" });
    await suggestHeadings(actor, quote.id);
    expect(await headingOf(quote.id)).toBeNull();

    const other = testCode();
    await insertHeading(other);
    await confirmHeading(actor, quote.id, other);
    setFakeResponse("suggest_heading", {
      candidates: [{ code: SEEDED, rationale: "Otra", confidence: 0.7 }],
    });
    await suggestHeadings(actor, quote.id);
    expect(await headingOf(quote.id)).toBe(other);
  });

  it("una cotización ajena da NOT_FOUND y el prompt no lleva datos de la cuenta", async () => {
    const owner = await verifiedActor();
    const intruder = await verifiedActor();
    const quote = await createQuote(owner, { title: "Ajena", locale: "es" });
    await expectCode(suggestHeadings(intruder, quote.id), "NOT_FOUND");
    const prompt = buildSuggestHeadingPrompt({
      locale: "es",
      productDescription: "Inyectora",
      specs: null,
    });
    expect(prompt).not.toContain(owner.userId);
    expect(prompt).not.toContain("@cotimporta.test");
  });
});

async function calculatedQuote(actor: Actor): Promise<string> {
  const quote = await createQuote(actor, { title: "Narrativa", locale: "es" });
  await saveItems(actor, quote.id, [
    { description: "Planta BG-880", quantity: 1, totalMinor: 1_200_000 },
  ]);
  await confirmHeading(actor, quote.id, SEEDED);
  await saveSupplierTerms(actor, quote.id, {
    advanceBps: 3_000,
    balanceBps: 7_000,
    productionDaysMin: 30,
    productionDaysMax: 35,
    shippingCoordinationDays: 7,
    transitDaysMin: 30,
    transitDaysMax: 40,
  });
  await saveFx(actor, quote.id, { penPerUsdE4: 35_000, date: "2026-10-29", source: "Prueba" });
  await calculateQuote(actor, quote.id);
  return quote.id;
}

const conceptCodes = async (quoteId: string) => [
  ...new Set(
    (
      await sql<{ concept_code: string }[]>`
          select concept_code from quote_cost_lines where quote_id = ${quoteId} order by position
        `
    ).map((row) => row.concept_code),
  ),
];
const stages = Object.fromEntries(["1", "2", "3", "4", "5", "6"].map((k) => [k, `Etapa ${k}`]));
const quoteRow = async (quoteId: string) =>
  (
    await sql<{ narrative: unknown; result: unknown }[]>`
      select narrative, result from quotes where id = ${quoteId}
    `
  )[0];

describe("narrativa", () => {
  it("con los conceptos y etapas exactos se guarda con el locale", async () => {
    const actor = await verifiedActor();
    const quoteId = await calculatedQuote(actor);
    const codes = await conceptCodes(quoteId);
    expect(codes.length).toBeGreaterThan(0);
    const concepts = Object.fromEntries(codes.map((code) => [code, `Explica ${code}`]));
    setFakeResponse("narrative", { concepts, stages });

    await generateNarrative(actor, quoteId);
    expect((await quoteRow(quoteId))?.narrative).toEqual({ locale: "es", concepts, stages });
  });

  it("claves distintas de los conceptos y etapas esperados → rechazo y narrative sin cambios", async () => {
    const actor = await verifiedActor();
    const quoteId = await calculatedQuote(actor);
    const previous = { locale: "es", concepts: {}, stages: { "1": "anterior" } };
    await sql`update quotes set narrative = ${sql.json(previous)} where id = ${quoteId}`;
    const codes = await conceptCodes(quoteId);
    const concepts = Object.fromEntries(codes.map((code) => [code, "ok"]));

    setFakeResponse("narrative", { concepts: { ...concepts, inventado: "x" }, stages });
    await expectCode(generateNarrative(actor, quoteId), "UPSTREAM_UNAVAILABLE");
    expect((await quoteRow(quoteId))?.narrative).toEqual(previous);

    setFakeResponse("narrative", { concepts, stages: { ...stages, "7": "extra" } });
    await expectCode(generateNarrative(actor, quoteId), "UPSTREAM_UNAVAILABLE");
    expect((await quoteRow(quoteId))?.narrative).toEqual(previous);

    const { "1": _dropped, ...fiveStages } = stages;
    setFakeResponse("narrative", { concepts, stages: fiveStages });
    await expectCode(generateNarrative(actor, quoteId), "UPSTREAM_UNAVAILABLE");
    expect((await quoteRow(quoteId))?.narrative).toEqual(previous);
  });

  it("si el driver falla tras calcular, narrative queda en null y el result no cambia", async () => {
    const actor = await verifiedActor();
    const quoteId = await calculatedQuote(actor);
    await sql`update quotes set narrative = ${sql.json({ locale: "es", vieja: true })} where id = ${quoteId}`;
    const before = (await quoteRow(quoteId))?.result;
    expect(before).not.toBeNull();

    setFakeResponse("narrative", new Error("HTTP_500"));
    expect(await refreshNarrative(actor, quoteId)).toBeNull();
    const after = await quoteRow(quoteId);
    expect(after?.narrative).toBeNull();
    expect(after?.result).toEqual(before);
  });
});
