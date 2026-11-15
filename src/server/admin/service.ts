import { and, asc, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  defaultLocalCharges,
  perceptionRules,
  plans,
  tariffHeadings,
  tariffRates,
  taxRates,
  tradeAgreements,
} from "@/db/schema";
import { type Actor, requireAdmin } from "@/server/authz";
import { AppError } from "@/server/errors";
import { currentLocalCharges, type LocalChargeRow } from "@/server/rules/repository";

// Panel admin: toda función empieza con requireAdmin(actor) (no-admin → NOT_FOUND).

const todayUtc = () => new Date().toISOString().slice(0, 10);

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(
      "VALIDATION",
      `${issue?.path.join(".") || "datos"}: ${issue?.message ?? "inválido"}`,
    );
  }
  return result.data;
}

/** "1234.5" → 123450 con `scale` decimales (enteros, sin flotantes). */
const decimal = (scale: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`), `número con hasta ${scale} decimales`)
    .transform((text) => {
      const [whole = "0", fraction = ""] = text.split(".");
      return Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, "0") || 0);
    })
    .refine(Number.isSafeInteger, "número demasiado grande");

const isoDate = z.iso.date();
const httpsUrl = z.url().refine((url) => url.startsWith("https://"), "la fuente debe ser https://");

// --- Gastos locales: historial semanal, nunca se actualiza una fila ---------------------------

export const localChargeSchema = z
  .object({
    conceptCode: z
      .string()
      .trim()
      .regex(/^[a-z0-9_-]{1,64}$/, "código en minúsculas"),
    labelEs: z.string().trim().min(1).max(200),
    labelEn: z.string().trim().min(1).max(200),
    group: z.enum(["origin_freight", "other_charges", "local_soles", "management_fee"]),
    origin: z.enum(["international", "local"]),
    igvApplicable: z.boolean(),
    inCif: z.boolean(),
    amount: decimal(2),
    currency: z.enum(["USD", "PEN"]),
    validFrom: isoDate,
  })
  .refine((line) => !line.inCif || (line.origin === "international" && line.igvApplicable), {
    message: "inCif exige origen internacional e IGV aplicable",
    path: ["inCif"],
  });
export type LocalChargeInput = z.input<typeof localChargeSchema>;

export async function saveLocalCharge(
  actor: Actor,
  input: LocalChargeInput,
): Promise<LocalChargeRow> {
  requireAdmin(actor);
  const { amount, ...data } = parse(localChargeSchema, input);
  const [row] = await db
    .insert(defaultLocalCharges)
    .values({ ...data, amountMinor: amount, createdBy: actor.userId })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    throw new AppError("CONFLICT", `Ya existe ${data.conceptCode} con vigencia ${data.validFrom}`);
  }
  return row;
}

/** Gasto vigente por concepto en `at` (por defecto hoy). */
export async function listLocalCharges(actor: Actor, at: string = todayUtc()) {
  requireAdmin(actor);
  return currentLocalCharges(db, at);
}

// --- Tasas tributarias: fila nueva, cierra la vigente anterior del mismo kind -------------------

export const taxRateSchema = z
  .object({
    kind: z.enum(["igv", "ipm", "uit", "tasa_despacho"]),
    rate: decimal(2).nullable(),
    amount: decimal(2).nullable(),
    currency: z.enum(["USD", "PEN"]),
    effectiveFrom: isoDate,
    sourceUrl: z.url("source_url es obligatoria"),
  })
  .refine((rate) => (rate.rate === null) !== (rate.amount === null), {
    message: "indica una tasa (%) o un monto, no ambos",
    path: ["rate"],
  });
export type TaxRateInput = z.input<typeof taxRateSchema>;
type TaxRateRow = typeof taxRates.$inferSelect;

export async function saveTaxRate(actor: Actor, input: TaxRateInput): Promise<TaxRateRow> {
  requireAdmin(actor);
  const data = parse(taxRateSchema, input);
  return db.transaction(async (tx) => {
    // La fila vigente justo antes del nuevo effective_from termina donde empieza la nueva.
    await tx
      .update(taxRates)
      .set({ effectiveTo: data.effectiveFrom })
      .where(
        and(
          eq(taxRates.kind, data.kind),
          lt(taxRates.effectiveFrom, data.effectiveFrom),
          or(isNull(taxRates.effectiveTo), gt(taxRates.effectiveTo, data.effectiveFrom)),
        ),
      );
    const [row] = await tx
      .insert(taxRates)
      .values({
        kind: data.kind,
        rateBps: data.rate,
        amountMinor: data.amount,
        currency: data.currency,
        effectiveFrom: data.effectiveFrom,
        sourceUrl: data.sourceUrl,
        reviewedBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      throw new AppError("CONFLICT", `Ya existe ${data.kind} con vigencia ${data.effectiveFrom}`);
    }
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "tax_rate.created",
      entity: "tax_rates",
      entityId: row.id,
      metadata: { kind: row.kind, effectiveFrom: row.effectiveFrom },
    });
    return row;
  });
}

export async function listTaxRates(actor: Actor): Promise<TaxRateRow[]> {
  requireAdmin(actor);
  return db.select().from(taxRates).orderBy(asc(taxRates.kind), desc(taxRates.effectiveFrom));
}

// --- Verificación de reglas ---------------------------------------------------------------------

const VERIFIABLE = {
  tax_rates: taxRates,
  tariff_headings: tariffHeadings,
  tariff_rates: tariffRates,
  trade_agreements: tradeAgreements,
  perception_rules: perceptionRules,
} as const;
export type VerifiableTable = keyof typeof VERIFIABLE;

/** Marca una regla como verificada; solo si su fuente es https:// (si no → VALIDATION). */
export async function markVerified(
  actor: Actor,
  table: VerifiableTable,
  id: string,
): Promise<void> {
  requireAdmin(actor);
  const target = VERIFIABLE[table];
  if (!target || !z.uuid().safeParse(id).success) {
    throw new AppError("NOT_FOUND", "Regla no encontrada");
  }
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ sourceUrl: target.sourceUrl })
      .from(target)
      .where(eq(target.id, id))
      .limit(1);
    if (!row) {
      throw new AppError("NOT_FOUND", "Regla no encontrada");
    }
    if (!httpsUrl.safeParse(row.sourceUrl).success) {
      throw new AppError("VALIDATION", "Solo se verifica una regla cuya fuente es https://");
    }
    await tx
      .update(target)
      .set({ verificationStatus: "verified", reviewedBy: actor.userId })
      .where(eq(target.id, id));
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "rule.verified",
      entity: table,
      entityId: id,
    });
  });
}

// --- Plan -------------------------------------------------------------------------------------

export const planSchema = z.object({
  pricePen: decimal(2),
  priceUsd: decimal(2),
  quotaPerPeriod: z.number().int().min(1).max(1000),
  active: z.boolean(),
});
export type PlanInput = z.input<typeof planSchema>;
type PlanRow = typeof plans.$inferSelect;

export async function getPlan(actor: Actor, code: string): Promise<PlanRow> {
  requireAdmin(actor);
  const [plan] = await db.select().from(plans).where(eq(plans.code, code)).limit(1);
  if (!plan) {
    throw new AppError("NOT_FOUND", "Plan no encontrado");
  }
  return plan;
}

/** Precios, cuota y estado del plan; deja rastro plan.updated con el admin como actor. */
export async function savePlan(actor: Actor, code: string, input: PlanInput): Promise<PlanRow> {
  requireAdmin(actor);
  const data = parse(planSchema, input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(plans).where(eq(plans.code, code)).for("update");
    if (!before) {
      throw new AppError("NOT_FOUND", "Plan no encontrado");
    }
    const [plan] = await tx
      .update(plans)
      .set({
        pricePenMinor: data.pricePen,
        priceUsdMinor: data.priceUsd,
        quotaPerPeriod: data.quotaPerPeriod,
        active: data.active,
      })
      .where(eq(plans.code, code))
      .returning();
    if (!plan) {
      throw new AppError("NOT_FOUND", "Plan no encontrado");
    }
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "plan.updated",
      entity: "plans",
      entityId: plan.id,
      metadata: {
        before: {
          pricePenMinor: before.pricePenMinor,
          priceUsdMinor: before.priceUsdMinor,
          quotaPerPeriod: before.quotaPerPeriod,
          active: before.active,
        },
        after: {
          pricePenMinor: plan.pricePenMinor,
          priceUsdMinor: plan.priceUsdMinor,
          quotaPerPeriod: plan.quotaPerPeriod,
          active: plan.active,
        },
      },
    });
    return plan;
  });
}
