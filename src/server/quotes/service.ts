import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  perceptionRules,
  quoteCostLines,
  quoteLines,
  quoteStages,
  quoteSupplierTerms,
  quotes,
  quoteTaxBreakdown,
  referenceCounters,
  tariffHeadings,
  tariffRates,
  taxRates,
  tradeAgreements,
} from "@/db/schema";
import { EngineInputError, calculateQuote as runEngine } from "@/lib/engine/calculate";
import type { EngineInput, EngineResult, RuleRef } from "@/lib/engine/types";
import { type Actor, ownedQuoteOrThrow, type QuoteRow, type Tx } from "@/server/authz";
import { consumeQuote } from "@/server/billing/entitlements";
import { AppError } from "@/server/errors";
import { hit } from "@/server/rate-limit";
import {
  currentLocalCharges,
  listPerceptionConditions,
  type PerceptionCondition,
  resolveRules,
  searchHeadings,
} from "@/server/rules/repository";

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

// --- Asistente: producto, ítems, partida, costos, términos, TC y cálculo (E2-T2) ---------------

const todayUtc = () => new Date().toISOString().slice(0, 10);

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "datos";
    throw new AppError("VALIDATION", `${path}: ${issue?.message ?? "inválido"}`);
  }
  return result.data;
}

const minor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const productSchema = z.object({
  title: z.string().trim().min(1).max(200),
  productDescription: z.string().max(5000),
  clientName: z.string().max(200),
  originCountry: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  hasOriginCertificate: z.boolean(),
  importerCondition: z.string().trim().min(1).max(64),
  dutiableUnits: z.number().int().min(1).max(1_000_000),
});
export type ProductInput = z.infer<typeof productSchema>;

export const itemsSchema = z
  .array(
    z.object({
      description: z.string().trim().min(1).max(500),
      quantity: z.number().int().min(1).max(1_000_000),
      totalMinor: minor,
    }),
  )
  .max(100);
export type ItemInput = z.infer<typeof itemsSchema>[number];

export const costLinesSchema = z
  .array(
    z
      .object({
        conceptCode: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(200),
        group: z.enum(["origin_freight", "other_charges", "local_soles", "management_fee"]),
        origin: z.enum(["international", "local"]),
        igvApplicable: z.boolean(),
        inCif: z.boolean(),
        amountMinor: minor,
        currency: z.enum(["USD", "PEN"]),
        providerName: z.string().max(200).nullable().optional(),
      })
      .refine((line) => !line.inCif || (line.origin === "international" && line.igvApplicable), {
        message: "inCif exige origen internacional e IGV aplicable",
        path: ["inCif"],
      }),
  )
  .max(50);
export type CostLineInput = z.infer<typeof costLinesSchema>[number];

const days = z.number().int().min(0).max(3650);
export const supplierTermsSchema = z
  .object({
    advanceBps: z.number().int().min(0).max(10_000),
    balanceBps: z.number().int().min(0).max(10_000),
    productionDaysMin: days,
    productionDaysMax: days,
    shippingCoordinationDays: days,
    transitDaysMin: days,
    transitDaysMax: days,
    note: z.string().max(1000).nullable().optional(),
  })
  .refine((terms) => terms.advanceBps + terms.balanceBps === 10_000, {
    message: "adelanto + saldo debe ser 100 %",
    path: ["advanceBps"],
  })
  .refine(
    (terms) =>
      terms.productionDaysMin <= terms.productionDaysMax &&
      terms.transitDaysMin <= terms.transitDaysMax,
    { message: "el mínimo no puede superar al máximo", path: ["productionDaysMin"] },
  );
export type SupplierTermsInput = z.infer<typeof supplierTermsSchema>;

export const fxSchema = z.object({
  penPerUsdE4: z.number().int().min(1).max(1_000_000),
  date: z.iso.date(),
  source: z.string().trim().min(1).max(200),
});
export type FxInput = z.infer<typeof fxSchema>;

const ownQuote = (actor: Actor, quoteId: string) =>
  and(eq(quotes.id, quoteId), eq(quotes.userId, actor.userId));

export async function updateProduct(actor: Actor, quoteId: string, input: ProductInput) {
  const data = parse(productSchema, input);
  await db.transaction(async (tx) => {
    await ownedQuoteOrThrow(tx, actor, quoteId);
    await tx.update(quotes).set(data).where(ownQuote(actor, quoteId));
  });
}

export async function saveItems(actor: Actor, quoteId: string, input: ItemInput[]) {
  const items = parse(itemsSchema, input);
  await db.transaction(async (tx) => {
    await ownedQuoteOrThrow(tx, actor, quoteId);
    await tx
      .delete(quoteLines)
      .where(and(eq(quoteLines.quoteId, quoteId), eq(quoteLines.userId, actor.userId)));
    if (items.length > 0) {
      await tx
        .insert(quoteLines)
        .values(
          items.map((item, position) => ({ ...item, position, quoteId, userId: actor.userId })),
        );
    }
  });
}

/** Copia los gastos locales vigentes hoy si la cotización aún no tiene líneas de costo. */
export async function applyDefaultCharges(actor: Actor, quoteId: string, tx?: Tx): Promise<void> {
  const run = async (inner: Tx) => {
    await ownedQuoteOrThrow(inner, actor, quoteId);
    const [existing] = await inner
      .select({ id: quoteCostLines.id })
      .from(quoteCostLines)
      .where(and(eq(quoteCostLines.quoteId, quoteId), eq(quoteCostLines.userId, actor.userId)))
      .limit(1);
    if (existing) {
      return;
    }
    const charges = await currentLocalCharges(inner, todayUtc());
    if (charges.length === 0) {
      return;
    }
    await inner.insert(quoteCostLines).values(
      charges.map((charge, position) => ({
        quoteId,
        userId: actor.userId,
        position,
        conceptCode: charge.conceptCode,
        label: charge.labelEs,
        group: charge.group,
        origin: charge.origin,
        igvApplicable: charge.igvApplicable,
        inCif: charge.inCif,
        amountMinor: charge.amountMinor,
        currency: charge.currency,
        defaultChargeId: charge.id,
      })),
    );
  };
  if (tx) {
    await run(tx);
  } else {
    await db.transaction(run);
  }
}

/** Confirma una partida vigente hoy; si no existe → VALIDATION y la anterior se conserva. */
export async function confirmHeading(actor: Actor, quoteId: string, code: string): Promise<void> {
  const headingCode = parse(z.string().regex(/^\d{10}$/, "la partida tiene 10 dígitos"), code);
  await db.transaction(async (tx) => {
    await ownedQuoteOrThrow(tx, actor, quoteId);
    const today = todayUtc();
    const [heading] = await tx
      .select({ id: tariffHeadings.id })
      .from(tariffHeadings)
      .where(
        and(
          eq(tariffHeadings.code, headingCode),
          sql`${tariffHeadings.effectiveFrom} <= ${today}`,
          sql`(${tariffHeadings.effectiveTo} is null or ${tariffHeadings.effectiveTo} > ${today})`,
        ),
      )
      .limit(1);
    if (!heading) {
      throw new AppError("VALIDATION", `La partida ${headingCode} no está vigente en el arancel`);
    }
    await tx
      .update(quotes)
      .set({ tariffHeadingCode: headingCode, headingConfirmedAt: new Date() })
      .where(ownQuote(actor, quoteId));
    await applyDefaultCharges(actor, quoteId, tx);
  });
}

export async function saveCostLines(actor: Actor, quoteId: string, input: CostLineInput[]) {
  const lines = parse(costLinesSchema, input);
  await db.transaction(async (tx) => {
    await ownedQuoteOrThrow(tx, actor, quoteId);
    await tx
      .delete(quoteCostLines)
      .where(and(eq(quoteCostLines.quoteId, quoteId), eq(quoteCostLines.userId, actor.userId)));
    if (lines.length > 0) {
      await tx.insert(quoteCostLines).values(
        lines.map((line, position) => ({
          ...line,
          providerName: line.providerName ?? null,
          position,
          quoteId,
          userId: actor.userId,
        })),
      );
    }
  });
}

export async function saveSupplierTerms(actor: Actor, quoteId: string, input: SupplierTermsInput) {
  const terms = parse(supplierTermsSchema, input);
  const values = { ...terms, note: terms.note ?? null };
  await db.transaction(async (tx) => {
    await ownedQuoteOrThrow(tx, actor, quoteId);
    await tx
      .insert(quoteSupplierTerms)
      .values({ ...values, quoteId, userId: actor.userId })
      .onConflictDoUpdate({ target: quoteSupplierTerms.quoteId, set: values });
  });
}

export async function saveFx(actor: Actor, quoteId: string, input: FxInput) {
  const fx = parse(fxSchema, input);
  await db.transaction(async (tx) => {
    await ownedQuoteOrThrow(tx, actor, quoteId);
    await tx
      .update(quotes)
      .set({ fxPenPerUsdE4: fx.penPerUsdE4, fxDate: fx.date, fxSource: fx.source })
      .where(ownQuote(actor, quoteId));
  });
}

async function loadParts(tx: Tx, actor: Actor, quoteId: string) {
  const quote = await ownedQuoteOrThrow(tx, actor, quoteId);
  const [items, costLines, [terms]] = await Promise.all([
    tx
      .select()
      .from(quoteLines)
      .where(and(eq(quoteLines.quoteId, quoteId), eq(quoteLines.userId, actor.userId)))
      .orderBy(asc(quoteLines.position)),
    tx
      .select()
      .from(quoteCostLines)
      .where(and(eq(quoteCostLines.quoteId, quoteId), eq(quoteCostLines.userId, actor.userId)))
      .orderBy(asc(quoteCostLines.position)),
    tx
      .select()
      .from(quoteSupplierTerms)
      .where(
        and(eq(quoteSupplierTerms.quoteId, quoteId), eq(quoteSupplierTerms.userId, actor.userId)),
      )
      .limit(1),
  ]);
  return { quote, items, costLines, terms: terms ?? null };
}

type Parts = Awaited<ReturnType<typeof loadParts>>;
type Rules = Awaited<ReturnType<typeof resolveRules>>;

function engineInput(parts: Parts, rules: Rules): EngineInput {
  const { quote, items, costLines } = parts;
  const terms = parts.terms as NonNullable<Parts["terms"]>;
  return {
    fx: {
      penPerUsdE4: quote.fxPenPerUsdE4 ?? 0,
      date: quote.fxDate ?? "",
      source: quote.fxSource ?? "",
    },
    items: items.map(({ id, description, quantity, totalMinor }) => ({
      id,
      description,
      quantity,
      totalMinor,
    })),
    costLines: costLines.map((line) => ({
      id: line.id,
      conceptCode: line.conceptCode,
      label: line.label,
      group: line.group,
      origin: line.origin,
      igvApplicable: line.igvApplicable,
      inCif: line.inCif,
      amountMinor: line.amountMinor,
      currency: line.currency,
    })),
    dutiableUnits: quote.dutiableUnits,
    heading: { code: rules.heading.code, rates: rules.rates },
    taxes: { igv: rules.igv, ipm: rules.ipm, dispatchFee: rules.dispatchFee },
    origin: {
      countryCode: quote.originCountry,
      hasOriginCertificate: quote.hasOriginCertificate,
      agreements: rules.agreements,
    },
    perception: rules.perception,
    terms: {
      advanceBps: terms.advanceBps,
      productionDays: [terms.productionDaysMin, terms.productionDaysMax],
      shippingCoordinationDays: terms.shippingCoordinationDays,
      transitDays: [terms.transitDaysMin, terms.transitDaysMax],
    },
    marginsBps: quote.marginsBps,
  };
}

/** Calcula y persiste el resultado (endpoint crítico 1 de §5). */
export async function calculateQuote(actor: Actor, quoteId: string): Promise<EngineResult> {
  return db.transaction(async (tx) => {
    const parts = await loadParts(tx, actor, quoteId);
    const { quote, items, terms } = parts;
    if (!quote.tariffHeadingCode) {
      throw new AppError("VALIDATION", "Confirma la partida arancelaria antes de calcular");
    }
    if (!items.some((item) => item.totalMinor > 0)) {
      throw new AppError("VALIDATION", "Agrega al menos un ítem con monto mayor que 0");
    }
    if (!quote.fxPenPerUsdE4 || !quote.fxDate || !quote.fxSource) {
      throw new AppError("VALIDATION", "fx: falta el tipo de cambio con su fecha y fuente");
    }
    if (!terms || terms.advanceBps + terms.balanceBps !== 10_000) {
      throw new AppError("VALIDATION", "Los términos del proveedor deben sumar 100 %");
    }

    const rulesAsOf = todayUtc();
    const rules = await resolveRules(tx, {
      headingCode: quote.tariffHeadingCode,
      at: rulesAsOf,
      originCountry: quote.originCountry,
      importerCondition: quote.importerCondition,
    }).catch((error: unknown) => {
      if (error instanceof AppError && error.code === "NOT_FOUND") {
        throw new AppError("CONFLICT", "RULES_INCOMPLETE");
      }
      throw error;
    });

    let result: EngineResult;
    try {
      result = runEngine(engineInput(parts, rules));
    } catch (error) {
      if (error instanceof EngineInputError) {
        throw new AppError("VALIDATION", `Dato inválido para el cálculo: ${error.field}`);
      }
      throw error;
    }

    const { table, id, effectiveFrom, sourceUrl } = rules.heading;
    const snapshot: RuleRef[] = [{ table, id, effectiveFrom, sourceUrl }, ...result.snapshot];
    const owner = { quoteId, userId: actor.userId };

    await tx
      .update(quotes)
      .set({
        result,
        ruleSnapshot: snapshot,
        rulesAsOf,
        calculatedAt: new Date(),
        status: "calculated",
      })
      .where(ownQuote(actor, quoteId));
    await tx
      .delete(quoteStages)
      .where(and(eq(quoteStages.quoteId, quoteId), eq(quoteStages.userId, actor.userId)));
    await tx.insert(quoteStages).values(
      result.stages.map((stage) => ({
        ...owner,
        stageNo: stage.stageNo,
        kind: stage.kind,
        amountUsdMinor: stage.amountMinor,
        amountPenMinor: stage.amountPenMinor,
        daysMin: stage.daysMin,
        daysMax: stage.daysMax,
      })),
    );
    await tx
      .delete(quoteTaxBreakdown)
      .where(
        and(eq(quoteTaxBreakdown.quoteId, quoteId), eq(quoteTaxBreakdown.userId, actor.userId)),
      );
    await tx.insert(quoteTaxBreakdown).values(
      result.taxLines.map((line) => ({
        ...owner,
        component: line.component,
        scope: line.scope,
        conceptCode: line.conceptCode,
        baseMinor: line.baseMinor,
        rateBps: line.rateBps,
        amountMinor: line.amountMinor,
        exempted: line.exempted,
        exemptionReason: line.exemptionReason,
        ruleTable: line.rule?.table ?? null,
        ruleId: line.rule?.id ?? null,
        ruleEffectiveFrom: line.rule?.effectiveFrom ?? null,
        sourceUrl: line.rule?.sourceUrl ?? null,
      })),
    );
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "quote.calculated",
      entity: "quote",
      entityId: quoteId,
      metadata: { totalMinor: result.totalMinor, rulesAsOf },
    });
    return result;
  });
}

/** ¿Alguna regla del snapshot sigue sin verificar? */
async function hasUnverifiedRules(tx: Tx, snapshot: RuleRef[]): Promise<boolean> {
  const tables = [tariffHeadings, tariffRates, taxRates, tradeAgreements, perceptionRules];
  const names = [
    "tariff_headings",
    "tariff_rates",
    "tax_rates",
    "trade_agreements",
    "perception_rules",
  ];
  for (const [index, table] of tables.entries()) {
    const ids = snapshot.filter((ref) => ref.table === names[index]).map((ref) => ref.id);
    if (ids.length === 0) continue;
    const [row] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.id, ids), eq(table.verificationStatus, "unverified")))
      .limit(1);
    if (row) return true;
  }
  return false;
}

export type QuoteView = Parts & {
  result: EngineResult | null;
  snapshot: RuleRef[];
  unverifiedRules: boolean;
  perceptionConditions: PerceptionCondition[];
};

/** Todo lo que necesita la página del asistente; ajena → NOT_FOUND. */
export async function getQuoteView(actor: Actor, quoteId: string): Promise<QuoteView> {
  const parts = await loadParts(db, actor, quoteId);
  const snapshot = (parts.quote.ruleSnapshot as RuleRef[] | null) ?? [];
  const [unverifiedRules, perceptionConditions] = await Promise.all([
    hasUnverifiedRules(db, snapshot),
    listPerceptionConditions(db, todayUtc()),
  ]);
  return {
    ...parts,
    result: (parts.quote.result as EngineResult | null) ?? null,
    snapshot,
    unverifiedRules,
    perceptionConditions,
  };
}

/** Búsqueda manual de partidas vigentes hoy (máx. 20). */
export async function searchTariffHeadings(query: string) {
  return searchHeadings(db, query, todayUtc());
}

export type ComparedQuote = Pick<QuoteRow, "id" | "referenceCode" | "title" | "status"> & {
  result: EngineResult | null;
};

/** Compara 2–3 cotizaciones propias (cualquiera ajena → NOT_FOUND). */
export async function compareQuotes(actor: Actor, ids: string[]): Promise<ComparedQuote[]> {
  const unique = [...new Set(ids)];
  if (unique.length < 2 || unique.length > 3) {
    throw new AppError("VALIDATION", "Elige entre 2 y 3 cotizaciones para comparar");
  }
  const rows = [];
  for (const id of unique) {
    const quote = await ownedQuoteOrThrow(db, actor, id);
    rows.push({
      id: quote.id,
      referenceCode: quote.referenceCode,
      title: quote.title,
      status: quote.status,
      result: (quote.result as EngineResult | null) ?? null,
    });
  }
  return rows;
}
