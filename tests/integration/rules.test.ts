import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { seed } from "@/db/seed";
import { requireEnv } from "@/lib/env";
import { AppError } from "@/server/errors";
import {
  currentLocalCharges,
  listPerceptionConditions,
  type RuleRef,
  resolveRules,
  searchHeadings,
} from "@/server/rules/repository";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });

afterAll(async () => {
  await sql.end();
});

const SEEDED_TABLES = [
  "plans",
  "tax_rates",
  "tariff_headings",
  "tariff_rates",
  "trade_agreements",
  "perception_rules",
  "default_local_charges",
] as const;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of SEEDED_TABLES) {
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)}`;
    out[table] = row?.n ?? 0;
  }
  return out;
}

function allRefs(rules: Awaited<ReturnType<typeof resolveRules>>): RuleRef[] {
  return [
    rules.heading,
    ...rules.rates,
    rules.igv,
    rules.ipm,
    ...(rules.dispatchFee ? [rules.dispatchFee] : []),
    ...rules.agreements,
    rules.perception,
  ];
}

const DEMO = {
  headingCode: "8477300000",
  at: "2026-06-01",
  originCountry: "CN",
  importerCondition: "general",
};

describe("seed", () => {
  it("es idempotente: la segunda ejecución deja los mismos conteos por tabla", async () => {
    await seed(db);
    const first = await counts();
    await seed(db);
    expect(await counts()).toEqual(first);
    expect(first.tax_rates).toBeGreaterThanOrEqual(4);
  });
});

describe("resolveRules", () => {
  it("devuelve IGV e IPM vigentes el 2026-06-01 y ninguna regla ya vencida", async () => {
    const rules = await resolveRules(db, DEMO);
    expect(rules.igv.rateBps).toBe(1550);
    expect(rules.ipm.rateBps).toBe(250);
    expect(rules.igv.effectiveFrom).toBe("2026-01-01");
    expect(rules.rates.map((rate) => rate.kind)).toContain("ad_valorem");
    expect(rules.agreements.map((agreement) => agreement.agreementCode)).toContain("TLC-PE-CN");
    expect(rules.perception).toMatchObject({ conditionCode: "general", rateBps: 350 });

    for (const rule of allRefs(rules)) {
      const [row] = await sql<{ effective_to: string | null }[]>`
        select effective_to::text from ${sql(rule.table)} where id = ${rule.id}
      `;
      const to = row?.effective_to ?? null;
      expect(to === null || to > DEMO.at, `${rule.table}:${rule.id} vence ${to}`).toBe(true);
    }
  });

  it("antes de 2026 usa las tasas de 2025", async () => {
    const [igv] = await sql<{ rate_bps: number }[]>`
      select rate_bps from tax_rates
      where kind = 'igv' and effective_from <= '2025-06-01'
        and (effective_to is null or effective_to > '2025-06-01')
    `;
    expect(igv?.rate_bps).toBe(1600);
  });

  it("una partida inexistente lanza NOT_FOUND", async () => {
    const error = await resolveRules(db, { ...DEMO, headingCode: "0000000000" }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("NOT_FOUND");
  });

  it("cada regla trae tabla, id, effective_from y source_url", async () => {
    const rules = await resolveRules(db, DEMO);
    for (const rule of allRefs(rules)) {
      expect(rule.table).toMatch(/^[a-z_]+$/);
      expect(rule.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(rule.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rule.sourceUrl.length).toBeGreaterThan(0);
    }
  });

  it("la percepción usa el prefijo más largo que coincide con la partida", async () => {
    const condition = `test_${randomUUID()}`;
    const from = `2099-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`;
    await sql`
      insert into perception_rules
        (condition_code, heading_prefix, rate_bps, description_es, description_en, effective_from, source_url)
      values
        (${condition}, '', 100, 'Prueba', 'Test', ${from}, 'https://example.test/general'),
        (${condition}, '8477', 777, 'Prueba', 'Test', ${from}, 'https://example.test/8477')
    `;
    const rules = await resolveRules(db, {
      ...DEMO,
      at: "2099-12-31",
      importerCondition: condition,
    });
    expect(rules.perception.rateBps).toBe(777);
  });
});

describe("consultas auxiliares", () => {
  it("busca partidas por prefijo y por texto, gastos locales y condiciones", async () => {
    expect((await searchHeadings(db, "8477", DEMO.at)).map((h) => h.code)).toContain("8477300000");
    expect((await searchHeadings(db, "soplado", DEMO.at)).map((h) => h.code)).toContain(
      "8477300000",
    );
    const charges = await currentLocalCharges(db, DEMO.at);
    expect(charges.find((charge) => charge.conceptCode === "management_fee")?.amountMinor).toBe(
      150_000,
    );
    const conditions = await listPerceptionConditions(db, DEMO.at);
    expect(conditions.map((condition) => condition.conditionCode)).toEqual(
      expect.arrayContaining(["no_aplica", "general", "primera_importacion"]),
    );
  });
});
