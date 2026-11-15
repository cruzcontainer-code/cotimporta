import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { quotes } from "@/db/schema";
import { AppError } from "@/server/errors";

export type Actor = { userId: string; role: "user" | "admin" };

/** Base o transacción: cualquier ejecutor de consultas Drizzle. */
export type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type QuoteRow = typeof quotes.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Única puerta a una cotización: del actor y no borrada; si no, NOT_FOUND (nunca 403). */
export async function ownedQuoteOrThrow(tx: Tx, actor: Actor, quoteId: string): Promise<QuoteRow> {
  if (!UUID.test(quoteId)) {
    throw new AppError("NOT_FOUND", "Cotización no encontrada");
  }
  const [row] = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, actor.userId), isNull(quotes.deletedAt)))
    .limit(1);
  if (!row) {
    throw new AppError("NOT_FOUND", "Cotización no encontrada");
  }
  return row;
}

/** Solo admin; cualquier otro rol recibe NOT_FOUND. */
export function requireAdmin(actor: Actor): void {
  if (actor.role !== "admin") {
    throw new AppError("NOT_FOUND", "No encontrado");
  }
}
