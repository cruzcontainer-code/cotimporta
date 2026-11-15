import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, quoteSupplierTerms, quotes, referenceCounters } from "@/db/schema";
import { type Actor, ownedQuoteOrThrow, type QuoteRow } from "@/server/authz";
import { consumeQuote } from "@/server/billing/entitlements";
import { AppError } from "@/server/errors";
import { hit } from "@/server/rate-limit";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type QuotePage = { items: QuoteRow[]; nextCursor: string | null };

/** Crea una cotización: límite 30/h, cuota, código COT-AAAA-NNNN, términos por defecto y auditoría. */
export async function createQuote(
  actor: Actor,
  input: { title: string; locale: "es" | "en" },
  now: Date = new Date(),
): Promise<QuoteRow> {
  const limit = await hit(`quote:${actor.userId}`, 30, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Creaste muchas cotizaciones seguidas. Espera un momento.");
  }
  return db.transaction(async (tx) => {
    await consumeQuote(tx, actor.userId, now);

    const year = now.getUTCFullYear();
    const [counter] = await tx
      .insert(referenceCounters)
      .values({ year, last: 1 })
      .onConflictDoUpdate({
        target: referenceCounters.year,
        set: { last: sql`${referenceCounters.last} + 1` },
      })
      .returning({ last: referenceCounters.last });
    if (!counter) {
      throw new AppError("INTERNAL", "No se pudo asignar el código de la cotización");
    }
    const referenceCode = `COT-${year}-${String(counter.last).padStart(4, "0")}`;

    const [quote] = await tx
      .insert(quotes)
      .values({ userId: actor.userId, referenceCode, title: input.title, locale: input.locale })
      .returning();
    if (!quote) {
      throw new AppError("INTERNAL", "No se pudo crear la cotización");
    }
    await tx.insert(quoteSupplierTerms).values({ quoteId: quote.id, userId: actor.userId });
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "quote.created",
      entity: "quote",
      entityId: quote.id,
      metadata: { referenceCode },
    });
    return quote;
  });
}

export async function getQuote(actor: Actor, quoteId: string): Promise<QuoteRow> {
  return ownedQuoteOrThrow(db, actor, quoteId);
}

/** Cotizaciones propias no borradas, más nuevas primero; el cursor es el id del último ítem. */
export async function listQuotes(
  actor: Actor,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<QuotePage> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const conditions = [eq(quotes.userId, actor.userId), isNull(quotes.deletedAt)];
  if (options.cursor) {
    const anchor = await ownedQuoteOrThrow(db, actor, options.cursor);
    // Subconsulta por id: compara con el created_at exacto de Postgres (microsegundos).
    conditions.push(
      sql`(${quotes.createdAt}, ${quotes.id}) < (select q.created_at, q.id from quotes q where q.id = ${anchor.id})`,
    );
  }
  const rows = await db
    .select()
    .from(quotes)
    .where(and(...conditions))
    .orderBy(desc(quotes.createdAt), desc(quotes.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const next = rows.length > limit ? items.at(-1) : undefined;
  return { items, nextCursor: next?.id ?? null };
}

export async function renameQuote(actor: Actor, quoteId: string, title: string): Promise<QuoteRow> {
  return db.transaction(async (tx) => {
    await ownedQuoteOrThrow(tx, actor, quoteId);
    const [row] = await tx
      .update(quotes)
      .set({ title })
      .where(and(eq(quotes.id, quoteId), eq(quotes.userId, actor.userId)))
      .returning();
    if (!row) {
      throw new AppError("NOT_FOUND", "Cotización no encontrada");
    }
    return row;
  });
}

export async function softDeleteQuote(actor: Actor, quoteId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await ownedQuoteOrThrow(tx, actor, quoteId);
    await tx
      .update(quotes)
      .set({ deletedAt: new Date() })
      .where(and(eq(quotes.id, quoteId), eq(quotes.userId, actor.userId)));
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "quote.deleted",
      entity: "quote",
      entityId: quoteId,
    });
  });
}
