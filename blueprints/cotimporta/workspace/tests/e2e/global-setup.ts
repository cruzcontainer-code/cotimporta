import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { e2eDatabaseUrl } from "./env";

type SeedModule = { seed: (database: unknown) => Promise<void> };

// Migra y siembra la base de pruebas antes de levantar el servidor E2E.
// Antes del paso 2 no hay migraciones; antes del paso 6 no hay seed. Ambos casos se omiten.
// Vacía rate_limit_buckets (justo después de migrar, cuando la tabla ya existe) para que el
// límite de registro por IP (5/h, IP "local") no se arrastre de una corrida E2E a la siguiente.
export default async function globalSetup(): Promise<void> {
  if (!existsSync("drizzle/meta/_journal.json")) {
    return;
  }
  const sql = postgres(e2eDatabaseUrl, { max: 1 });
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: "drizzle" });
    await sql`delete from rate_limit_buckets`;
    const seedPath = resolve("src/db/seed.ts");
    if (existsSync(seedPath)) {
      const mod = (await import(pathToFileURL(seedPath).href)) as SeedModule;
      await mod.seed(db);
    }
  } finally {
    await sql.end();
  }
}
