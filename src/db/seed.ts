// `pnpm db:seed` = node --env-file-if-exists=.env src/db/seed.ts (Node 24 sin bundler).
// Solo paquetes y relativos con .ts; process.env aquí es la excepción documentada (CLAUDE.md).

import { pathToFileURL } from "node:url";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  defaultLocalCharges,
  perceptionRules,
  plans,
  tariffHeadings,
  tariffRates,
  taxRates,
  tradeAgreements,
} from "./schema.ts";
import {
  seedDefaultLocalCharges,
  seedPerceptionRules,
  seedPlans,
  seedTariffHeadings,
  seedTariffRates,
  seedTaxRates,
  seedTradeAgreements,
} from "./seed-data.ts";

/** Cualquier instancia drizzle(postgres-js), con o sin esquema. */
export type SeedDb = Pick<PostgresJsDatabase, "insert">;

/** Inserta las filas DEMO; idempotente (on conflict do nothing sobre las claves naturales). */
export async function seed(db: SeedDb): Promise<void> {
  await db.insert(plans).values(seedPlans).onConflictDoNothing();
  await db.insert(taxRates).values(seedTaxRates).onConflictDoNothing();
  await db.insert(tariffHeadings).values(seedTariffHeadings).onConflictDoNothing();
  await db.insert(tariffRates).values(seedTariffRates).onConflictDoNothing();
  await db.insert(tradeAgreements).values(seedTradeAgreements).onConflictDoNothing();
  await db.insert(perceptionRules).values(seedPerceptionRules).onConflictDoNothing();
  await db.insert(defaultLocalCharges).values(seedDefaultLocalCharges).onConflictDoNothing();
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL no está definido (copia .env.example a .env)");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    await seed(drizzle(sql));
    console.log("seed: filas DEMO listas");
  } finally {
    await sql.end();
  }
}
