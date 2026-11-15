import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { requireEnv } from "@/lib/env";
import { markVerified, saveLocalCharge, savePlan, saveTaxRate } from "@/server/admin/service";
import { type Actor, requireAdmin } from "@/server/authz";
import { AppError } from "@/server/errors";
import { currentLocalCharges } from "@/server/rules/repository";

// Tablas globales de reglas: valores únicos por corrida (testing.md). Conceptos test_<uuid>,
// fechas con año ≥ 2099 únicas, tasas solo uit / tasa_despacho, nunca filas seed://demo.
const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
const year = 2099 + Math.floor(Math.random() * 800);
const day = (month: number) => `${year}-${String(month).padStart(2, "0")}-15`;

let admin: Actor;
let user: Actor;

async function insertUser(role: "user" | "admin"): Promise<Actor> {
  const id = randomUUID();
  await sql`
    insert into users (id, name, email, email_verified, role)
    values (${id}, 'Prueba', ${`${id}@cotimporta.test`}, true, ${role})
  `;
  return { userId: id, role };
}

async function expectCode(promise: Promise<unknown>, code: AppError["code"]) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

beforeAll(async () => {
  admin = await insertUser("admin");
  user = await insertUser("user");
});

afterAll(async () => {
  await sql.end();
});

describe("acceso", () => {
  it("requireAdmin con role user lanza NOT_FOUND, y también cada función admin", async () => {
    expect(() => requireAdmin(user)).toThrow(AppError);
    try {
      requireAdmin(user);
    } catch (error) {
      expect((error as AppError).code).toBe("NOT_FOUND");
    }
    await expectCode(
      savePlan(user, "mensual", {
        pricePen: "1.00",
        priceUsd: "1.00",
        quotaPerPeriod: 1,
        active: true,
      }),
      "NOT_FOUND",
    );
  });
});

describe("gastos locales", () => {
  it("una nueva semana inserta una fila, conserva la anterior y es la vigente en su fecha", async () => {
    const conceptCode = `test_${randomUUID()}`;
    const base = {
      conceptCode,
      labelEs: "Gasto de prueba",
      labelEn: "Test charge",
      group: "other_charges" as const,
      origin: "local" as const,
      igvApplicable: true,
      inCif: false,
      currency: "USD" as const,
    };
    await saveLocalCharge(admin, { ...base, amount: "100.00", validFrom: day(1) });
    await saveLocalCharge(admin, { ...base, amount: "125.50", validFrom: day(2) });

    const rows = await sql<{ amount_minor: string; created_by: string }[]>`
      select amount_minor, created_by from default_local_charges
      where concept_code = ${conceptCode} order by valid_from
    `;
    expect(rows.map((row) => Number(row.amount_minor))).toEqual([10_000, 12_550]);
    expect(rows.every((row) => row.created_by === admin.userId)).toBe(true);

    const at = (date: string) =>
      currentLocalCharges(db, date).then(
        (charges) => charges.find((charge) => charge.conceptCode === conceptCode)?.amountMinor,
      );
    expect(await at(day(1))).toBe(10_000);
    expect(await at(day(2))).toBe(12_550);
  });

  it("rechaza inCif con origen local", async () => {
    await expectCode(
      saveLocalCharge(admin, {
        conceptCode: `test_${randomUUID()}`,
        labelEs: "x",
        labelEn: "x",
        group: "origin_freight",
        origin: "local",
        igvApplicable: true,
        inCif: true,
        amount: "1.00",
        currency: "USD",
        validFrom: day(3),
      }),
      "VALIDATION",
    );
  });
});

describe("tasas tributarias", () => {
  it("exige source_url y effective_from, cierra la anterior y guarda reviewed_by", async () => {
    await expectCode(
      saveTaxRate(admin, {
        kind: "uit",
        rate: null,
        amount: "5350.00",
        currency: "PEN",
        effectiveFrom: day(4),
        sourceUrl: "",
      }),
      "VALIDATION",
    );
    await expectCode(
      saveTaxRate(admin, {
        kind: "uit",
        rate: null,
        amount: "5350.00",
        currency: "PEN",
        effectiveFrom: "",
        sourceUrl: "https://example.gob.pe/uit",
      }),
      "VALIDATION",
    );

    const first = await saveTaxRate(admin, {
      kind: "uit",
      rate: null,
      amount: "5350.00",
      currency: "PEN",
      effectiveFrom: day(5),
      sourceUrl: "https://example.gob.pe/uit-1",
    });
    const second = await saveTaxRate(admin, {
      kind: "uit",
      rate: null,
      amount: "5500.00",
      currency: "PEN",
      effectiveFrom: day(9),
      sourceUrl: "https://example.gob.pe/uit-2",
    });

    const [closed] = await sql<{ effective_to: string | null }[]>`
      select effective_to::text from tax_rates where id = ${first.id}
    `;
    expect(closed?.effective_to).toBe(day(9));
    expect(second.effectiveTo).toBeNull();
    expect(second.reviewedBy).toBe(admin.userId);
    expect(second.amountMinor).toBe(550_000);
  });

  it("solo verifica filas con fuente https://", async () => {
    const secure = await saveTaxRate(admin, {
      kind: "tasa_despacho",
      rate: null,
      amount: "33.00",
      currency: "PEN",
      effectiveFrom: day(6),
      sourceUrl: "https://example.gob.pe/despacho",
    });
    await markVerified(admin, "tax_rates", secure.id);
    const [verified] = await sql<{ verification_status: string }[]>`
      select verification_status from tax_rates where id = ${secure.id}
    `;
    expect(verified?.verification_status).toBe("verified");

    const insecure = await saveTaxRate(admin, {
      kind: "tasa_despacho",
      rate: null,
      amount: "34.00",
      currency: "PEN",
      effectiveFrom: day(7),
      sourceUrl: "http://example.gob.pe/despacho",
    });
    await expectCode(markVerified(admin, "tax_rates", insecure.id), "VALIDATION");
    const [still] = await sql<{ verification_status: string }[]>`
      select verification_status from tax_rates where id = ${insecure.id}
    `;
    expect(still?.verification_status).toBe("unverified");
  });
});

describe("plan", () => {
  it("persiste precio y cuota y deja plan.updated con el admin como actor", async () => {
    const code = `test_${randomUUID()}`;
    await sql`
      insert into plans (code, name_es, name_en, quota_per_period, active)
      values (${code}, 'Plan de prueba', 'Test plan', 10, false)
    `;
    const plan = await savePlan(admin, code, {
      pricePen: "49.90",
      priceUsd: "14.00",
      quotaPerPeriod: 12,
      active: true,
    });
    expect(plan).toMatchObject({
      pricePenMinor: 4_990,
      priceUsdMinor: 1_400,
      quotaPerPeriod: 12,
      active: true,
    });

    const audit = await sql<{ actor_user_id: string }[]>`
      select actor_user_id from audit_events where action = 'plan.updated' and entity_id = ${plan.id}
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor_user_id).toBe(admin.userId);
  });
});
