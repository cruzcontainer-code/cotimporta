import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/rules-import/route";
import { requireEnv } from "@/lib/env";
import type { Actor } from "@/server/authz";
import { AppError } from "@/server/errors";
import {
  CSV_HEADER,
  csvAdapter,
  discardRun,
  publishRun,
  runImport,
  type TariffSourceAdapter,
} from "@/server/rules/import";

// Re-ejecutable (testing.md): partidas "99" + 8 dígitos aleatorios, fechas con año ≥ 2099 únicas,
// nunca 8477300000 ni filas seed://demo.
const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
const random8 = () => String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
const H1 = `99${random8()}`;
let H2 = `99${random8()}`;
while (H2 === H1) H2 = `99${random8()}`;
const YEAR = 2099 + Math.floor(Math.random() * 800);
const FIRST = `${YEAR}-01-01`;
const SECOND = `${YEAR}-06-01`;
const URL = "https://example.gob.pe/arancel";

const header = CSV_HEADER.join(",");
const row = (
  code: string,
  rate: number | string,
  from: string,
  description = "Partida de prueba",
) => `${code},"${description}","Test heading",ad_valorem,cif,${rate},,,true,${from},${URL}`;
const csv = (...rows: string[]) => [header, ...rows].join("\r\n");

let admin: Actor;

beforeAll(async () => {
  const id = randomUUID();
  await sql`
    insert into users (id, name, email, email_verified, role)
    values (${id}, 'Admin', ${`${id}@cotimporta.test`}, true, 'admin')
  `;
  admin = { userId: id, role: "admin" };
});

afterAll(async () => {
  await sql.end();
});

async function published(code: string) {
  return sql<
    {
      rate_bps: number;
      effective_from: string;
      effective_to: string | null;
      reviewed_by: string | null;
    }[]
  >`
    select rate_bps, effective_from::text, effective_to::text, reviewed_by
    from tariff_rates where heading_code = ${code} order by effective_from
  `;
}

async function staging(runId: string) {
  return sql<{ heading_code: string; change: string }[]>`
    select heading_code, change from staging_tariff_rates where run_id = ${runId} order by heading_code
  `;
}

const runCount = async () =>
  (await sql<{ n: number }[]>`select count(*)::int as n from rule_import_runs`)[0]?.n ?? 0;

describe("staging, diff y publicación", () => {
  it("publica un CSV con H1 copiando a las tablas con reviewed_by del admin", async () => {
    const run = await runImport({
      adapter: csvAdapter(csv(row(H1, 600, FIRST)), "h1.csv"),
      source: "csv",
      triggeredBy: admin.userId,
    });
    expect(run.status).toBe("staged");
    expect(await staging(run.id)).toEqual([{ heading_code: H1, change: "added" }]);
    expect(await published(H1)).toHaveLength(0);

    const done = await publishRun(admin, run.id);
    expect(done.status).toBe("published");
    expect(done.publishedBy).toBe(admin.userId);
    const rates = await published(H1);
    expect(rates).toEqual([
      { rate_bps: 600, effective_from: FIRST, effective_to: null, reviewed_by: admin.userId },
    ]);
    const [heading] = await sql<{ reviewed_by: string }[]>`
      select reviewed_by from tariff_headings where code = ${H1}
    `;
    expect(heading?.reviewed_by).toBe(admin.userId);
    await expect(publishRun(admin, run.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("una partida nueva y una tasa cambiada quedan added/changed sin tocar lo publicado", async () => {
    const before = { h1: await published(H1), h2: await published(H2) };
    const run = await runImport({
      adapter: csvAdapter(csv(row(H2, 300, SECOND), row(H1, 900, SECOND)), "h2.csv"),
      source: "csv",
      triggeredBy: admin.userId,
    });
    expect(run.status).toBe("staged");
    expect(run.diffSummary).toEqual({ added: 1, changed: 1, removed: 0, unchanged: 0 });
    expect(await staging(run.id)).toEqual(
      [
        { heading_code: H1, change: "changed" },
        { heading_code: H2, change: "added" },
      ].sort((a, b) => a.heading_code.localeCompare(b.heading_code)),
    );
    expect(await published(H1)).toEqual(before.h1);
    expect(await published(H2)).toEqual(before.h2);

    // Publicar cierra la versión anterior de H1 en la nueva fecha.
    await publishRun(admin, run.id);
    const h1 = await published(H1);
    expect(h1.map((r) => [r.rate_bps, r.effective_to])).toEqual([
      [600, SECOND],
      [900, null],
    ]);
  });

  it("descartar deja la corrida discarded sin publicar", async () => {
    const run = await runImport({
      adapter: csvAdapter(csv(row(H1, 950, `${YEAR}-09-01`)), "x.csv"),
      source: "csv",
      triggeredBy: admin.userId,
    });
    await discardRun(admin, run.id);
    const [status] = await sql<
      { status: string }[]
    >`select status from rule_import_runs where id = ${run.id}`;
    expect(status?.status).toBe("discarded");
    expect((await published(H1)).some((r) => r.rate_bps === 950)).toBe(false);
  });

  it("un usuario sin rol admin no publica (NOT_FOUND)", async () => {
    const run = await runImport({
      adapter: csvAdapter(csv(row(H2, 1, `${YEAR}-10-01`)), "u.csv"),
      source: "csv",
      triggeredBy: admin.userId,
    });
    await expect(publishRun({ userId: admin.userId, role: "user" }, run.id)).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe("CSV inválido", () => {
  it.each([
    ["partida mal formada", row("12AB", 600, FIRST), "heading_code"],
    ["tasa negativa", row(`99${random8()}`, -5, FIRST), "rate_bps"],
  ])("%s → failed con número de línea y nada en staging", async (_name, bad, field) => {
    const run = await runImport({
      adapter: csvAdapter(csv(row(`99${random8()}`, 100, FIRST), bad), "malo.csv"),
      source: "csv",
      triggeredBy: admin.userId,
    });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/^línea 3: /);
    expect(run.error).toContain(field);
    expect(await staging(run.id)).toHaveLength(0);
  });

  it("valores entre comillas con comas y comillas escapadas se leen bien", async () => {
    const code = `99${random8()}`;
    const run = await runImport({
      adapter: csvAdapter(
        csv(row(code, 100, `${YEAR}-11-01`, 'Máquinas, "de prueba"'.replaceAll('"', '""'))),
        "q.csv",
      ),
      source: "csv",
      triggeredBy: admin.userId,
    });
    expect(run.status).toBe("staged");
    const [heading] = await sql<{ description_es: string }[]>`
      select description_es from staging_tariff_headings where run_id = ${run.id}
    `;
    expect(heading?.description_es).toBe('Máquinas, "de prueba"');
  });
});

describe("fuente oficial y cron", () => {
  it("fuente no disponible → failed, log error y reportError una vez", async () => {
    const reportError = vi.fn(async () => {});
    const logs: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((line: string) => {
      logs.push(line);
    });
    const unavailable: TariffSourceAdapter = {
      fetchRows: async () => ({ status: "unavailable", reason: "fuente caída" }),
    };
    try {
      const run = await runImport({
        adapter: unavailable,
        source: "official",
        triggeredBy: "test",
        reportError,
      });
      expect(run.status).toBe("failed");
      expect(run.error).toBe("fuente caída");
    } finally {
      spy.mockRestore();
    }
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(logs.map((line) => JSON.parse(line)).some((entry) => entry.level === "error")).toBe(
      true,
    );
  });

  it("GET sin Authorization Bearer responde 401 y no crea corridas", async () => {
    const before = await runCount();
    const anonymous = await GET(new Request("http://localhost/api/cron/rules-import"));
    expect(anonymous.status).toBe(401);
    const wrong = await GET(
      new Request("http://localhost/api/cron/rules-import", {
        headers: { authorization: "Bearer otro" },
      }),
    );
    expect(wrong.status).toBe(401);
    expect(await runCount()).toBe(before);
  });

  it("vercel.json programa el cron de importación", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.regions).toEqual(["gru1"]);
    expect(config.crons).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "/api/cron/rules-import" })]),
    );
  });
});
