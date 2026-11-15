import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  ruleImportRuns,
  stagingTariffHeadings,
  stagingTariffRates,
  tariffHeadings,
  tariffRates,
} from "@/db/schema";
import { getEnv } from "@/lib/env";
import { type Actor, requireAdmin, type Tx } from "@/server/authz";
import { AppError, reportError as defaultReportError, logger } from "@/server/errors";

// Importación de reglas arancelarias: fuente → validación → staging + diff → publicación humana.
// Nada se publica solo: el cron y la subida de CSV dejan la corrida en `staged`.

export const CSV_HEADER = [
  "heading_code",
  "description_es",
  "description_en",
  "kind",
  "base",
  "rate_bps",
  "amount_per_unit_minor",
  "unit",
  "in_igv_base",
  "effective_from",
  "source_url",
] as const;

export type StagedRow = {
  headingCode: string;
  descriptionEs: string;
  descriptionEn: string;
  kind: "ad_valorem" | "sobretasa" | "antidumping" | "derecho_especifico" | "isc";
  base: "cif" | "fob" | "cif_plus_duties" | "per_unit";
  rateBps: number | null;
  amountPerUnitMinor: number | null;
  unit: string | null;
  inIgvBase: boolean;
  effectiveFrom: string;
  sourceUrl: string;
};

export type FetchResult =
  | { status: "ok"; rows: StagedRow[]; sourceUrl: string; complete?: boolean }
  | { status: "unavailable"; reason: string };

export type TariffSourceAdapter = { fetchRows(): Promise<FetchResult> };

/** Error de contenido con número de línea del archivo (cabecera = línea 1). */
export class ImportRowError extends Error {
  readonly line: number;

  constructor(line: number, message: string) {
    super(`línea ${line}: ${message}`);
    this.name = "ImportRowError";
    this.line = line;
  }
}

/** Parser RFC 4180: comas, comillas dobles ("" escapa), saltos de línea dentro de comillas. */
export function parseCsv(text: string): { line: number; fields: string[] }[] {
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line++;
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      fields.push(field);
      records.push({ line: recordLine, fields });
      fields = [];
      field = "";
      line++;
      recordLine = line;
    } else {
      field += char;
    }
  }
  if (quoted) {
    throw new ImportRowError(recordLine, "comillas sin cerrar");
  }
  if (field !== "" || fields.length > 0) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }
  return records.filter((record) => record.fields.some((value) => value.trim() !== ""));
}

const optionalInt = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    if (!/^\d+$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "entero ≥ 0" });
      return z.NEVER;
    }
    return Number(value);
  });

const rowSchema = z
  .object({
    heading_code: z.string().regex(/^\d{10}$/, "heading_code debe tener 10 dígitos"),
    description_es: z.string().trim().min(1, "description_es vacía"),
    description_en: z.string().trim().min(1, "description_en vacía"),
    kind: z.enum(["ad_valorem", "sobretasa", "antidumping", "derecho_especifico", "isc"]),
    base: z.enum(["cif", "fob", "cif_plus_duties", "per_unit"]),
    rate_bps: optionalInt,
    amount_per_unit_minor: optionalInt,
    unit: z.string().trim(),
    in_igv_base: z.enum(["true", "false"], "in_igv_base debe ser true o false"),
    effective_from: z.iso.date("effective_from debe ser YYYY-MM-DD"),
    source_url: z.string().regex(/^https:\/\/\S+$/, "source_url debe empezar con https://"),
  })
  .superRefine((row, ctx) => {
    if (row.base === "per_unit") {
      if (row.amount_per_unit_minor === null) {
        ctx.addIssue({
          code: "custom",
          message: "amount_per_unit_minor es obligatorio con per_unit",
        });
      }
      if (row.unit === "") {
        ctx.addIssue({ code: "custom", message: "unit es obligatorio con per_unit" });
      }
    } else if (row.rate_bps === null) {
      ctx.addIssue({ code: "custom", message: "rate_bps es obligatorio salvo per_unit" });
    }
  });

/** Valida el CSV completo; el primer error corta con su número de línea. */
export function parseTariffCsv(text: string): StagedRow[] {
  const [header, ...records] = parseCsv(text);
  if (!header || header.fields.map((f) => f.trim()).join(",") !== CSV_HEADER.join(",")) {
    throw new ImportRowError(1, `la cabecera debe ser ${CSV_HEADER.join(",")}`);
  }
  const seen = new Set<string>();
  return records.map(({ line, fields }) => {
    if (fields.length !== CSV_HEADER.length) {
      throw new ImportRowError(
        line,
        `se esperaban ${CSV_HEADER.length} columnas y hay ${fields.length}`,
      );
    }
    const parsed = rowSchema.safeParse(
      Object.fromEntries(CSV_HEADER.map((key, i) => [key, fields[i] ?? ""])),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      throw new ImportRowError(line, `${where}${issue?.message ?? "fila inválida"}`);
    }
    const row = parsed.data;
    const key = `${row.heading_code}|${row.kind}`;
    if (seen.has(key)) {
      throw new ImportRowError(line, `${row.heading_code} ${row.kind} está repetido`);
    }
    seen.add(key);
    return {
      headingCode: row.heading_code,
      descriptionEs: row.description_es,
      descriptionEn: row.description_en,
      kind: row.kind,
      base: row.base,
      rateBps: row.base === "per_unit" ? null : row.rate_bps,
      amountPerUnitMinor: row.base === "per_unit" ? row.amount_per_unit_minor : null,
      unit: row.base === "per_unit" ? row.unit : null,
      inIgvBase: row.in_igv_base === "true",
      effectiveFrom: row.effective_from,
      sourceUrl: row.source_url,
    };
  });
}

/** CSV subido por el admin (respaldo manual, docs/verified/tariff-source.md). */
export function csvAdapter(text: string, sourceLabel: string): TariffSourceAdapter {
  return {
    async fetchRows() {
      return { status: "ok", rows: parseTariffCsv(text), sourceUrl: `csv:${sourceLabel}` };
    },
  };
}

/**
 * Fuente oficial. docs/verified/tariff-source.md (2026-11-15): `machine_readable: no`, `format: pdf`
 * → no hay descarga que normalizar; responde `unavailable` y la importación queda en CSV manual.
 */
export function officialAdapter(): TariffSourceAdapter {
  const MACHINE_READABLE = false;
  return {
    async fetchRows() {
      const url = getEnv().TARIFF_SOURCE_URL;
      if (!MACHINE_READABLE || !url) {
        return {
          status: "unavailable",
          reason:
            "No hay fuente oficial legible por máquina (docs/verified/tariff-source.md: machine_readable no). Usa el CSV manual.",
        };
      }
      return { status: "unavailable", reason: `Formato de ${url} sin adaptador` };
    },
  };
}

type RunRow = typeof ruleImportRuns.$inferSelect;
type Change = "added" | "changed" | "removed" | "unchanged";

async function latestHeading(tx: Tx, code: string) {
  const [row] = await tx
    .select()
    .from(tariffHeadings)
    .where(eq(tariffHeadings.code, code))
    .orderBy(desc(tariffHeadings.effectiveFrom))
    .limit(1);
  return row;
}

async function latestRate(tx: Tx, code: string, kind: StagedRow["kind"]) {
  const [row] = await tx
    .select()
    .from(tariffRates)
    .where(and(eq(tariffRates.headingCode, code), eq(tariffRates.kind, kind)))
    .orderBy(desc(tariffRates.effectiveFrom))
    .limit(1);
  return row;
}

/** Staging + diff contra la versión publicada más reciente de cada (partida, derecho). */
async function stage(tx: Tx, runId: string, rows: StagedRow[], removals: boolean, today: string) {
  const counts: Record<Change, number> = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  const headings = new Map<string, StagedRow>();
  for (const row of rows) headings.set(row.headingCode, row);

  for (const row of headings.values()) {
    const current = await latestHeading(tx, row.headingCode);
    const change: Change = !current
      ? "added"
      : current.descriptionEs !== row.descriptionEs || current.descriptionEn !== row.descriptionEn
        ? "changed"
        : "unchanged";
    await tx.insert(stagingTariffHeadings).values({
      runId,
      change,
      code: row.headingCode,
      descriptionEs: row.descriptionEs,
      descriptionEn: row.descriptionEn,
      effectiveFrom: row.effectiveFrom,
      sourceUrl: row.sourceUrl,
    });
  }

  for (const row of rows) {
    const current = await latestRate(tx, row.headingCode, row.kind);
    const heading = headings.get(row.headingCode);
    const descriptionChanged =
      (await latestHeading(tx, row.headingCode))?.descriptionEs !== heading?.descriptionEs;
    const change: Change = !current
      ? "added"
      : current.base !== row.base ||
          current.rateBps !== row.rateBps ||
          current.amountPerUnitMinor !== row.amountPerUnitMinor ||
          (current.unit ?? null) !== row.unit ||
          current.inIgvBase !== row.inIgvBase ||
          descriptionChanged
        ? "changed"
        : "unchanged";
    counts[change]++;
    await tx.insert(stagingTariffRates).values({ runId, change, ...row });
  }

  if (removals) {
    // Solo una fuente oficial completa puede declarar que un derecho vigente ya no existe.
    const incoming = new Set(rows.map((row) => `${row.headingCode}|${row.kind}`));
    const inForce = await tx
      .select()
      .from(tariffRates)
      .where(or(isNull(tariffRates.effectiveTo), gt(tariffRates.effectiveTo, today)));
    for (const rate of inForce) {
      if (incoming.has(`${rate.headingCode}|${rate.kind}`)) continue;
      counts.removed++;
      await tx.insert(stagingTariffRates).values({
        runId,
        change: "removed",
        headingCode: rate.headingCode,
        kind: rate.kind,
        base: rate.base,
        rateBps: rate.rateBps,
        amountPerUnitMinor: rate.amountPerUnitMinor,
        unit: rate.unit,
        inIgvBase: rate.inIgvBase,
        effectiveFrom: today,
        sourceUrl: rate.sourceUrl,
      });
    }
  }
  return counts;
}

export type RunImportOptions = {
  adapter: TariffSourceAdapter;
  source: "official" | "csv";
  triggeredBy: string;
  reportError?: (error: unknown, context?: Record<string, unknown>) => Promise<void>;
  now?: Date;
};

/** Ejecuta una corrida completa; nunca publica. */
export async function runImport(options: RunImportOptions): Promise<RunRow> {
  const {
    adapter,
    source,
    triggeredBy,
    reportError = defaultReportError,
    now = new Date(),
  } = options;
  const [run] = await db
    .insert(ruleImportRuns)
    .values({ source, triggeredBy, startedAt: now })
    .returning();
  if (!run) throw new AppError("INTERNAL", "No se pudo crear la corrida");

  const finish = async (values: Partial<typeof ruleImportRuns.$inferInsert>) => {
    const [row] = await db
      .update(ruleImportRuns)
      .set({ ...values, finishedAt: new Date() })
      .where(eq(ruleImportRuns.id, run.id))
      .returning();
    return row ?? run;
  };

  let result: FetchResult;
  try {
    result = await adapter.fetchRows();
  } catch (error) {
    if (error instanceof ImportRowError) {
      return finish({ status: "failed", error: error.message });
    }
    logger.error("rules-import: el adaptador falló", { runId: run.id, error });
    await reportError(error, { runId: run.id, source });
    return finish({ status: "failed", error: "La fuente devolvió un error inesperado" });
  }

  if (result.status === "unavailable") {
    logger.error("rules-import: fuente no disponible", {
      runId: run.id,
      source,
      reason: result.reason,
    });
    await reportError(new Error(result.reason), { runId: run.id, source });
    return finish({ status: "failed", error: result.reason });
  }

  const today = now.toISOString().slice(0, 10);
  const counts = await db.transaction((tx) =>
    stage(tx, run.id, result.rows, source === "official" && result.complete === true, today),
  );
  return finish({
    status: "staged",
    sourceUrl: result.sourceUrl,
    rowsStaged: result.rows.length,
    diffSummary: counts,
  });
}

async function lockStagedRun(tx: Tx, runId: string): Promise<RunRow> {
  if (!z.uuid().safeParse(runId).success) throw new AppError("NOT_FOUND", "Corrida no encontrada");
  const [run] = await tx
    .select()
    .from(ruleImportRuns)
    .where(eq(ruleImportRuns.id, runId))
    .for("update");
  if (!run) throw new AppError("NOT_FOUND", "Corrida no encontrada");
  if (run.status !== "staged") {
    throw new AppError(
      "CONFLICT",
      `La corrida está en estado ${run.status}; solo se publica o descarta una corrida staged`,
    );
  }
  return run;
}

/** Publica una corrida staged: filas nuevas con reviewed_by y cierre de la versión anterior. */
export async function publishRun(actor: Actor, runId: string): Promise<RunRow> {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const run = await lockStagedRun(tx, runId);
    const headings = await tx
      .select()
      .from(stagingTariffHeadings)
      .where(eq(stagingTariffHeadings.runId, runId));
    const rates = await tx
      .select()
      .from(stagingTariffRates)
      .where(eq(stagingTariffRates.runId, runId));

    for (const heading of headings.filter((h) => h.change !== "unchanged")) {
      await tx
        .update(tariffHeadings)
        .set({ effectiveTo: heading.effectiveFrom })
        .where(
          and(
            eq(tariffHeadings.code, heading.code),
            lt(tariffHeadings.effectiveFrom, heading.effectiveFrom),
            or(
              isNull(tariffHeadings.effectiveTo),
              gt(tariffHeadings.effectiveTo, heading.effectiveFrom),
            ),
          ),
        );
      const values = {
        descriptionEs: heading.descriptionEs,
        descriptionEn: heading.descriptionEn,
        sourceUrl: heading.sourceUrl,
        importRunId: runId,
        reviewedBy: actor.userId,
      };
      await tx
        .insert(tariffHeadings)
        .values({ ...values, code: heading.code, effectiveFrom: heading.effectiveFrom })
        .onConflictDoUpdate({
          target: [tariffHeadings.code, tariffHeadings.effectiveFrom],
          set: values,
        });
    }

    for (const rate of rates.filter((r) => r.change !== "unchanged")) {
      const closes = and(
        eq(tariffRates.headingCode, rate.headingCode),
        eq(tariffRates.kind, rate.kind),
        lt(tariffRates.effectiveFrom, rate.effectiveFrom),
        or(isNull(tariffRates.effectiveTo), gt(tariffRates.effectiveTo, rate.effectiveFrom)),
      );
      await tx.update(tariffRates).set({ effectiveTo: rate.effectiveFrom }).where(closes);
      if (rate.change === "removed") continue;
      const values = {
        base: rate.base,
        rateBps: rate.rateBps,
        amountPerUnitMinor: rate.amountPerUnitMinor,
        unit: rate.unit,
        inIgvBase: rate.inIgvBase,
        sourceUrl: rate.sourceUrl,
        importRunId: runId,
        reviewedBy: actor.userId,
      };
      await tx
        .insert(tariffRates)
        .values({
          ...values,
          headingCode: rate.headingCode,
          kind: rate.kind,
          effectiveFrom: rate.effectiveFrom,
        })
        .onConflictDoUpdate({
          target: [tariffRates.headingCode, tariffRates.kind, tariffRates.effectiveFrom],
          set: values,
        });
    }

    const [published] = await tx
      .update(ruleImportRuns)
      .set({ status: "published", publishedBy: actor.userId, publishedAt: new Date() })
      .where(eq(ruleImportRuns.id, run.id))
      .returning();
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "rules.published",
      entity: "rule_import_runs",
      entityId: run.id,
      metadata: { diffSummary: run.diffSummary },
    });
    return published ?? run;
  });
}

export async function discardRun(actor: Actor, runId: string): Promise<void> {
  requireAdmin(actor);
  await db.transaction(async (tx) => {
    const run = await lockStagedRun(tx, runId);
    await tx
      .update(ruleImportRuns)
      .set({ status: "discarded" })
      .where(eq(ruleImportRuns.id, run.id));
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "rules.discarded",
      entity: "rule_import_runs",
      entityId: run.id,
    });
  });
}

/** Corridas recientes y, si se pide, el diff de una de ellas (para /admin/rules). */
export async function listRuns(actor: Actor, limit = 20): Promise<RunRow[]> {
  requireAdmin(actor);
  return db.select().from(ruleImportRuns).orderBy(desc(ruleImportRuns.startedAt)).limit(limit);
}

export async function getRunDiff(actor: Actor, runId: string) {
  requireAdmin(actor);
  if (!z.uuid().safeParse(runId).success) throw new AppError("NOT_FOUND", "Corrida no encontrada");
  return db
    .select()
    .from(stagingTariffRates)
    .where(eq(stagingTariffRates.runId, runId))
    .orderBy(
      stagingTariffRates.headingCode,
      stagingTariffRates.kind,
      sql`${stagingTariffRates.change}`,
    );
}
