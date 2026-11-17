import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { loadOfficialRules } from "@/db/load-official";
import { seed } from "@/db/seed";
import { resolveRules } from "@/server/rules/repository";
import { createVerifiedSession } from "../helpers/session";

class Rollback extends Error {}

beforeAll(async () => {
  await seed(db);
});

describe("carga de reglas oficiales", () => {
  it("retira las DEMO y deja IGV 15,5 % + IPM 2,5 %, UIT, percepción y A/V verificados", async () => {
    const session = await createVerifiedSession("reglas");

    const outcome = await db
      .transaction(async (tx) => {
        // biome-ignore lint/suspicious/noExplicitAny: la transacción expone la misma API de transaction()
        const first = await loadOfficialRules(tx as any, session.email.toUpperCase());
        expect(first.demoRemoved).toBeGreaterThan(0);
        // biome-ignore lint/suspicious/noExplicitAny: idem
        const again = await loadOfficialRules(tx as any, session.email);
        expect(again).toEqual({ loaded: first.loaded, demoRemoved: 0 });

        const rules = await resolveRules(tx, {
          headingCode: "8477300000",
          at: "2026-11-16",
          originCountry: "CN",
          importerCondition: "general",
        });
        const refs = JSON.stringify(rules);
        expect(refs).not.toContain("seed://demo");
        expect(refs).toContain("https://busquedas.elperuano.pe/dispositivo/EX/2410141-1");
        expect(refs).toContain("https://orientacion.sunat.gob.pe/node/1189");
        throw new Rollback(JSON.stringify(rules));
      })
      .catch((error: unknown) => {
        if (error instanceof Rollback) return JSON.parse(error.message);
        throw error;
      });

    const text = JSON.stringify(outcome);
    expect(text).toMatch(/"rateBps":1550/);
    expect(text).toMatch(/"rateBps":250/);
    expect(text).toMatch(/"rateBps":350/);
  });

  it("con un email que no existe no cambia nada", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: idem
    await expect(loadOfficialRules(db as any, "nadie@cotimporta.test")).rejects.toThrow(
      /No existe un usuario/,
    );
  });
});
