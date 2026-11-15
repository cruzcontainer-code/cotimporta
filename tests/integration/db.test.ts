import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { parseEnv, requireEnv } from "@/lib/env";

const tableNames: string[] = Object.values(schema).flatMap((value) =>
  is(value, PgTable) ? [getTableName(value)] : [],
);

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });

afterAll(async () => {
  await sql.end();
});

describe("esquema migrado", () => {
  it("exporta tablas", () => {
    expect(tableNames.length).toBeGreaterThan(0);
  });

  it.each(tableNames)("existe la tabla %s en la base de pruebas", async (name) => {
    const [row] = await sql<{ reg: string | null }[]>`
      select to_regclass(${`public.${name}`}::text)::text as reg
    `;
    expect(row?.reg).not.toBeNull();
  });
});

describe("parseEnv", () => {
  it("lanza un error que nombra DATABASE_URL cuando falta", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });
});
