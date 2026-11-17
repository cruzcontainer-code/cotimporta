import { createHash } from "node:crypto";
import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  dataExportRequests,
  documentImages,
  generatedDocuments,
  paymentEvents,
  profiles,
  quoteCostLines,
  quoteLines,
  quoteStages,
  quoteSupplierTerms,
  quotes,
  quoteTaxBreakdown,
  rateLimitBuckets,
  subscriptions,
  supplierDocuments,
  usageCounters,
  users,
  verifications,
} from "@/db/schema";
import type { Actor } from "@/server/authz";
import { getPaymentProvider } from "@/server/billing/provider";
import { AppError } from "@/server/errors";
import { hit } from "@/server/rate-limit";
import { getStorage } from "@/server/storage";

const userPrefix = (userId: string) => `users/${userId}/`;

async function userOrThrow(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("NOT_FOUND", "Cuenta no encontrada");
  return user;
}

/** Agrupa filas hijas por quote_id. */
function byQuote<T extends { quoteId: string }>(rows: T[]): Map<string, Omit<T, "quoteId">[]> {
  const map = new Map<string, Omit<T, "quoteId">[]>();
  for (const { quoteId, ...rest } of rows) {
    const list = map.get(quoteId) ?? [];
    list.push(rest);
    map.set(quoteId, list);
  }
  return map;
}

/**
 * Exporta todos los datos de la cuenta (incluidas las cotizaciones borradas lógicamente) y la
 * lista de archivos guardados. Límite 5 por día. Registra la solicitud en data_export_requests.
 */
export async function exportAccount(actor: Actor) {
  const limit = await hit(`export:${actor.userId}`, 5, 86_400);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Ya exportaste tus datos varias veces hoy");
  }
  const user = await userOrThrow(actor.userId);

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, actor.userId));
  const quoteRows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.userId, actor.userId))
    .orderBy(asc(quotes.createdAt));
  const ids = quoteRows.map((quote) => quote.id);
  const forUser = (column: PgColumn) => eq(column, actor.userId);
  const inQuotes = (column: PgColumn) => (ids.length ? inArray(column, ids) : sql`false`);

  const [lines, costLines, terms, stages, taxes, documents, images, generated] = await Promise.all([
    db
      .select()
      .from(quoteLines)
      .where(and(forUser(quoteLines.userId), inQuotes(quoteLines.quoteId)))
      .orderBy(asc(quoteLines.position)),
    db
      .select()
      .from(quoteCostLines)
      .where(and(forUser(quoteCostLines.userId), inQuotes(quoteCostLines.quoteId)))
      .orderBy(asc(quoteCostLines.position)),
    db
      .select()
      .from(quoteSupplierTerms)
      .where(and(forUser(quoteSupplierTerms.userId), inQuotes(quoteSupplierTerms.quoteId))),
    db
      .select()
      .from(quoteStages)
      .where(and(forUser(quoteStages.userId), inQuotes(quoteStages.quoteId)))
      .orderBy(asc(quoteStages.stageNo)),
    db
      .select()
      .from(quoteTaxBreakdown)
      .where(and(forUser(quoteTaxBreakdown.userId), inQuotes(quoteTaxBreakdown.quoteId))),
    db
      .select({
        id: supplierDocuments.id,
        quoteId: supplierDocuments.quoteId,
        originalFilename: supplierDocuments.originalFilename,
        storageKey: supplierDocuments.storageKey,
        sha256: supplierDocuments.sha256,
        extractionStatus: supplierDocuments.extractionStatus,
        extractedSpecs: supplierDocuments.extractedSpecs,
        language: supplierDocuments.language,
        createdAt: supplierDocuments.createdAt,
      })
      .from(supplierDocuments)
      .where(and(forUser(supplierDocuments.userId), inQuotes(supplierDocuments.quoteId))),
    db
      .select()
      .from(documentImages)
      .where(and(forUser(documentImages.userId), inQuotes(documentImages.quoteId)))
      .orderBy(asc(documentImages.position)),
    db
      .select()
      .from(generatedDocuments)
      .where(and(forUser(generatedDocuments.userId), inQuotes(generatedDocuments.quoteId)))
      .orderBy(asc(generatedDocuments.version)),
  ]);

  const grouped = {
    lines: byQuote(lines),
    costLines: byQuote(costLines),
    terms: byQuote(terms),
    stages: byQuote(stages),
    taxes: byQuote(taxes),
    documents: byQuote(documents),
    images: byQuote(images),
    generated: byQuote(generated),
  };
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, actor.userId));
  const usage = await db
    .select()
    .from(usageCounters)
    .where(eq(usageCounters.userId, actor.userId))
    .orderBy(asc(usageCounters.periodStart));
  const files = await getStorage().list(userPrefix(actor.userId));

  const exportedAt = new Date();
  await db.insert(dataExportRequests).values({
    userId: actor.userId,
    status: "ready",
    completedAt: exportedAt,
  });

  return {
    exportedAt: exportedAt.toISOString(),
    profile: profile ?? null,
    user: { email: user.email, name: user.name, createdAt: user.createdAt },
    quotes: quoteRows.map((quote) => ({
      ...quote,
      lines: grouped.lines.get(quote.id) ?? [],
      costLines: grouped.costLines.get(quote.id) ?? [],
      supplierTerms: grouped.terms.get(quote.id)?.[0] ?? null,
      stages: grouped.stages.get(quote.id) ?? [],
      taxBreakdown: grouped.taxes.get(quote.id) ?? [],
      supplierDocuments: grouped.documents.get(quote.id) ?? [],
      documentImages: grouped.images.get(quote.id) ?? [],
      generatedDocuments: grouped.generated.get(quote.id) ?? [],
    })),
    files,
    subscription: subscription ?? null,
    usage,
  };
}

export type AccountExport = Awaited<ReturnType<typeof exportAccount>>;

/**
 * Borra la cuenta. Orden: cancelar en el proveedor, borrar archivos, y en una transacción
 * anonimizar pagos, auditar con el hash del id y borrar el usuario (cascadas).
 */
export async function deleteAccount(actor: Actor, confirmEmail: string): Promise<void> {
  const user = await userOrThrow(actor.userId);
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError("VALIDATION", "El email no coincide con el de tu cuenta");
  }

  const [subscription] = await db
    .select({ providerRef: subscriptions.providerRef })
    .from(subscriptions)
    .where(eq(subscriptions.userId, actor.userId));
  if (subscription?.providerRef) {
    await getPaymentProvider()?.cancel(subscription.providerRef);
  }

  await getStorage().deletePrefix(userPrefix(actor.userId));

  await db.transaction(async (tx) => {
    const payments = await tx
      .select({
        id: paymentEvents.id,
        type: paymentEvents.type,
        amountMinor: paymentEvents.amountMinor,
        currency: paymentEvents.currency,
      })
      .from(paymentEvents)
      .where(eq(paymentEvents.userId, actor.userId));
    for (const payment of payments) {
      await tx
        .update(paymentEvents)
        .set({
          userId: null,
          payload: {
            redacted: true,
            type: payment.type,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
          },
        })
        .where(eq(paymentEvents.id, payment.id));
    }
    await tx
      .update(auditEvents)
      .set({ actorUserId: null })
      .where(eq(auditEvents.actorUserId, actor.userId));
    await tx.insert(auditEvents).values({
      actorUserId: null,
      action: "account.deleted",
      entity: "user",
      entityId: null,
      metadata: { userHash: createHash("sha256").update(actor.userId).digest("hex") },
    });
    // Filas sin clave foránea al usuario: verificaciones por email y contadores de límite por id.
    await tx.delete(verifications).where(eq(verifications.identifier, user.email));
    await tx
      .delete(rateLimitBuckets)
      .where(
        or(
          like(rateLimitBuckets.key, `%:${actor.userId}`),
          like(rateLimitBuckets.key, `%:${actor.userId}:%`),
        ),
      );
    await tx.delete(users).where(eq(users.id, actor.userId));
  });
}

export const preferencesSchema = z.object({
  locale: z.enum(["es", "en"]),
  country: z.string().regex(/^[A-Z]{2}$/, "país de 2 letras"),
});

/** Idioma y país del perfil (el país decide la moneda del plan: PE → PEN). */
export async function updatePreferences(
  actor: Actor,
  input: z.infer<typeof preferencesSchema>,
): Promise<void> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  }
  const { locale, country } = parsed.data;
  await db
    .insert(profiles)
    .values({ userId: actor.userId, locale, country, currency: country === "PE" ? "PEN" : "USD" })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        locale,
        country,
        currency: country === "PE" ? "PEN" : "USD",
        updatedAt: new Date(),
      },
    });
}

/** Perfil para la página de ajustes. */
export async function getPreferences(actor: Actor) {
  const user = await userOrThrow(actor.userId);
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, actor.userId));
  return {
    email: user.email,
    locale: profile?.locale ?? "es",
    country: profile?.country ?? "PE",
  };
}
