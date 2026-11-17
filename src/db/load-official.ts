// `pnpm db:load-official <email-admin>` = carga las reglas oficiales de ./official-rules.ts y retira
// las filas DEMO (seed://demo). Idempotente. Las filas quedan verificadas a nombre del admin.
// process.env aquí es la misma excepción documentada que src/db/seed.ts (CLAUDE.md).

import { pathToFileURL } from "node:url";
import { eq, sql as raw } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  officialPerceptionRules,
  officialTariffHeadings,
  officialTariffRates,
  officialTaxRates,
} from "./official-rules.ts";
import {
  auditEvents,
  perceptionRules,
  tariffHeadings,
  tariffRates,
  taxRates,
  tradeAgreements,
  users,
} from "./schema.ts";

const DEMO = "seed://demo";

export type LoadResult = { loaded: number; demoRemoved: number };

/** Carga las reglas oficiales y borra las DEMO en una sola transacción. */
export async function loadOfficialRules(
  db: PostgresJsDatabase,
  adminEmail: string,
): Promise<LoadResult> {
  return db.transaction(async (tx) => {
    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(raw`lower(${users.email})`, adminEmail.trim().toLowerCase()))
      .limit(1);
    if (!admin) throw new Error(`No existe un usuario con el email ${adminEmail}`);
    const reviewedBy = admin.id;
    const updated = { reviewedBy, verificationStatus: "verified" as const };

    // Primero se retiran las DEMO: sus claves naturales coinciden con varias filas oficiales.
    let demoRemoved = 0;
    for (const table of [taxRates, tariffRates, tariffHeadings, tradeAgreements, perceptionRules]) {
      const gone = await tx
        .delete(table)
        .where(eq(table.sourceUrl, DEMO))
        .returning({ id: table.id });
      demoRemoved += gone.length;
    }

    let loaded = 0;
    for (const row of officialTaxRates) {
      await tx
        .insert(taxRates)
        .values({ ...row, reviewedBy })
        .onConflictDoUpdate({
          target: [taxRates.kind, taxRates.effectiveFrom],
          set: { ...row, ...updated },
        });
      loaded++;
    }
    for (const row of officialTariffHeadings) {
      await tx
        .insert(tariffHeadings)
        .values({ ...row, reviewedBy })
        .onConflictDoUpdate({
          target: [tariffHeadings.code, tariffHeadings.effectiveFrom],
          set: { ...row, ...updated },
        });
      loaded++;
    }
    for (const row of officialTariffRates) {
      await tx
        .insert(tariffRates)
        .values({ ...row, reviewedBy })
        .onConflictDoUpdate({
          target: [tariffRates.headingCode, tariffRates.kind, tariffRates.effectiveFrom],
          set: { ...row, ...updated },
        });
      loaded++;
    }
    for (const row of officialPerceptionRules) {
      await tx
        .insert(perceptionRules)
        .values({ ...row, reviewedBy })
        .onConflictDoUpdate({
          target: [
            perceptionRules.conditionCode,
            perceptionRules.headingPrefix,
            perceptionRules.effectiveFrom,
          ],
          set: { ...row, ...updated },
        });
      loaded++;
    }

    await tx.insert(auditEvents).values({
      actorUserId: reviewedBy,
      action: "rules.official_loaded",
      entity: "rules",
      entityId: null,
      metadata: { loaded, demoRemoved },
    });
    return { loaded, demoRemoved };
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const url = process.env.DATABASE_URL;
  const email = process.argv[2];
  if (!url || !email) {
    console.error("Uso: pnpm db:load-official <email-del-admin>  (requiere DATABASE_URL)");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  try {
    const result = await loadOfficialRules(drizzle(client), email);
    console.log(
      `reglas oficiales: ${result.loaded} cargadas, ${result.demoRemoved} filas DEMO retiradas`,
    );
  } finally {
    await client.end();
  }
}
