import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { beforeAll } from "vitest";

// Aplica las migraciones de drizzle/ a la base de pruebas antes de cada archivo de integración.
// Antes del paso 2 no existe drizzle/meta/_journal.json y no hay nada que migrar.
// DATABASE_URL lo inyecta vitest.config.ts (test.env) y apunta a cotimporta_test.
// Después borra toda fila de reglas que no sea del seed demo (source_url 'seed://demo'; en
// default_local_charges, created_by nulo) y las corridas de importación: ningún archivo depende
// de filas que dejó otro archivo u otra corrida. Ver .claude/rules/testing.md.
beforeAll(async () => {
  if (!existsSync("drizzle/meta/_journal.json")) {
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está definido para las pruebas de integración");
  }
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    await sql`delete from tariff_rates where source_url <> 'seed://demo'`;
    await sql`delete from tariff_headings where source_url <> 'seed://demo'`;
    await sql`delete from tax_rates where source_url <> 'seed://demo'`;
    await sql`delete from trade_agreements where source_url <> 'seed://demo'`;
    await sql`delete from perception_rules where source_url <> 'seed://demo'`;
    await sql`delete from default_local_charges where created_by is not null`;
    await sql`delete from rule_import_runs`;
  } finally {
    await sql.end();
  }
});
