import { and, asc, desc, eq, gt, ilike, isNull, like, lte, or, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  defaultLocalCharges,
  perceptionRules,
  tariffHeadings,
  tariffRates,
  taxRates,
  tradeAgreements,
} from "@/db/schema";
import type { Tx } from "@/server/authz";
import { AppError } from "@/server/errors";

/** Referencia de una regla para el snapshot de la cotización. */
export type RuleRef = { table: string; id: string; effectiveFrom: string; sourceUrl: string };
type TariffKind = (typeof tariffRates.$inferSelect)["kind"];

export type ResolvedRules = {
  heading: RuleRef & { code: string; descriptionEs: string; descriptionEn: string };
  rates: (RuleRef & {
    kind: TariffKind;
    base: (typeof tariffRates.$inferSelect)["base"];
    rateBps: number | null;
    amountPerUnitMinor: number | null;
    inIgvBase: boolean;
  })[];
  igv: RuleRef & { rateBps: number };
  ipm: RuleRef & { rateBps: number };
  dispatchFee: (RuleRef & { amountMinorPen: number }) | null;
  agreements: (RuleRef & {
    agreementCode: string;
    exemptKinds: TariffKind[];
    requiresOriginCertificate: boolean;
  })[];
  perception: RuleRef & { conditionCode: string; rateBps: number };
};

export type ResolveInput = {
  headingCode: string;
  /** Fecha "YYYY-MM-DD": effective_from inclusivo, effective_to exclusivo. */
  at: string;
  originCountry: string | null;
  importerCondition: string;
};

/** Vigente en `at`: effective_from <= at y (effective_to nulo o > at). */
function inForce(from: PgColumn, to: PgColumn, at: string): SQL {
  return and(lte(from, at), or(isNull(to), gt(to, at))) as SQL;
}

/** La partida empieza con el prefijo de la regla ('' aplica a todas). */
function prefixMatches(prefix: PgColumn, headingCode: string): SQL {
  return sql`${headingCode} like ${prefix} || '%'`;
}

const ref = (
  table: string,
  row: { id: string; effectiveFrom: string; sourceUrl: string },
): RuleRef => ({
  table,
  id: row.id,
  effectiveFrom: row.effectiveFrom,
  sourceUrl: row.sourceUrl,
});

async function taxRate(tx: Tx, kind: "igv" | "ipm" | "tasa_despacho", at: string) {
  const [row] = await tx
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.kind, kind), inForce(taxRates.effectiveFrom, taxRates.effectiveTo, at)))
    .orderBy(desc(taxRates.effectiveFrom))
    .limit(1);
  return row;
}

const incomplete = () => new AppError("CONFLICT", "RULES_INCOMPLETE");

/** Reglas vigentes en `at` para una partida, en la forma que consume el motor (EngineInput). */
export async function resolveRules(tx: Tx, input: ResolveInput): Promise<ResolvedRules> {
  const { headingCode, at, originCountry, importerCondition } = input;

  const [heading] = await tx
    .select()
    .from(tariffHeadings)
    .where(
      and(
        eq(tariffHeadings.code, headingCode),
        inForce(tariffHeadings.effectiveFrom, tariffHeadings.effectiveTo, at),
      ),
    )
    .orderBy(desc(tariffHeadings.effectiveFrom))
    .limit(1);
  if (!heading) {
    throw new AppError("NOT_FOUND", `Partida ${headingCode} no encontrada`);
  }

  // Una tarifa por tipo: la de effective_from más reciente entre las vigentes.
  const rateRows = await tx
    .selectDistinctOn([tariffRates.kind])
    .from(tariffRates)
    .where(
      and(
        eq(tariffRates.headingCode, headingCode),
        inForce(tariffRates.effectiveFrom, tariffRates.effectiveTo, at),
      ),
    )
    .orderBy(asc(tariffRates.kind), desc(tariffRates.effectiveFrom));

  const [igv, ipm, dispatch] = await Promise.all([
    taxRate(tx, "igv", at),
    taxRate(tx, "ipm", at),
    taxRate(tx, "tasa_despacho", at),
  ]);
  if (igv?.rateBps == null || ipm?.rateBps == null) {
    throw incomplete();
  }

  const agreementRows = originCountry
    ? await tx
        .select()
        .from(tradeAgreements)
        .where(
          and(
            eq(tradeAgreements.countryCode, originCountry),
            inForce(tradeAgreements.effectiveFrom, tradeAgreements.effectiveTo, at),
            prefixMatches(tradeAgreements.headingPrefix, headingCode),
          ),
        )
        .orderBy(asc(tradeAgreements.agreementCode), desc(tradeAgreements.effectiveFrom))
    : [];

  // Percepción: la regla de la condición con el prefijo más largo que prefija la partida.
  const [perception] = await tx
    .select()
    .from(perceptionRules)
    .where(
      and(
        eq(perceptionRules.conditionCode, importerCondition),
        inForce(perceptionRules.effectiveFrom, perceptionRules.effectiveTo, at),
        prefixMatches(perceptionRules.headingPrefix, headingCode),
      ),
    )
    .orderBy(
      desc(sql`length(${perceptionRules.headingPrefix})`),
      desc(perceptionRules.effectiveFrom),
    )
    .limit(1);
  if (!perception) {
    throw incomplete();
  }

  return {
    heading: {
      ...ref("tariff_headings", heading),
      code: heading.code,
      descriptionEs: heading.descriptionEs,
      descriptionEn: heading.descriptionEn,
    },
    rates: rateRows.map((row) => ({
      ...ref("tariff_rates", row),
      kind: row.kind,
      base: row.base,
      rateBps: row.rateBps,
      amountPerUnitMinor: row.amountPerUnitMinor,
      inIgvBase: row.inIgvBase,
    })),
    igv: { ...ref("tax_rates", igv), rateBps: igv.rateBps },
    ipm: { ...ref("tax_rates", ipm), rateBps: ipm.rateBps },
    dispatchFee:
      dispatch?.amountMinor != null
        ? { ...ref("tax_rates", dispatch), amountMinorPen: dispatch.amountMinor }
        : null,
    agreements: agreementRows.map((row) => ({
      ...ref("trade_agreements", row),
      agreementCode: row.agreementCode,
      exemptKinds: row.exemptKinds as TariffKind[],
      requiresOriginCertificate: row.requiresOriginCertificate,
    })),
    perception: {
      ...ref("perception_rules", perception),
      conditionCode: perception.conditionCode,
      rateBps: perception.rateBps,
    },
  };
}

export type HeadingMatch = { code: string; descriptionEs: string; descriptionEn: string };

/** Partidas vigentes por prefijo de código o texto en la descripción (máx. 20). */
export async function searchHeadings(tx: Tx, q: string, at: string): Promise<HeadingMatch[]> {
  const term = q.trim();
  if (!term) {
    return [];
  }
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  const text = /^\d+$/.test(term)
    ? like(tariffHeadings.code, `${escaped}%`)
    : or(
        ilike(tariffHeadings.descriptionEs, `%${escaped}%`),
        ilike(tariffHeadings.descriptionEn, `%${escaped}%`),
      );
  return tx
    .selectDistinctOn([tariffHeadings.code], {
      code: tariffHeadings.code,
      descriptionEs: tariffHeadings.descriptionEs,
      descriptionEn: tariffHeadings.descriptionEn,
    })
    .from(tariffHeadings)
    .where(and(text, inForce(tariffHeadings.effectiveFrom, tariffHeadings.effectiveTo, at)))
    .orderBy(asc(tariffHeadings.code), desc(tariffHeadings.effectiveFrom))
    .limit(20);
}

export type LocalChargeRow = typeof defaultLocalCharges.$inferSelect;

/** Gasto local por concepto: la fila con valid_from más reciente <= at. */
export async function currentLocalCharges(tx: Tx, at: string): Promise<LocalChargeRow[]> {
  return tx
    .selectDistinctOn([defaultLocalCharges.conceptCode])
    .from(defaultLocalCharges)
    .where(lte(defaultLocalCharges.validFrom, at))
    .orderBy(asc(defaultLocalCharges.conceptCode), desc(defaultLocalCharges.validFrom));
}

export type PerceptionCondition = {
  conditionCode: string;
  descriptionEs: string;
  descriptionEn: string;
  rateBps: number;
};

/** Condiciones de percepción vigentes (regla general de cada condición, prefijo ''). */
export async function listPerceptionConditions(tx: Tx, at: string): Promise<PerceptionCondition[]> {
  return tx
    .selectDistinctOn([perceptionRules.conditionCode], {
      conditionCode: perceptionRules.conditionCode,
      descriptionEs: perceptionRules.descriptionEs,
      descriptionEn: perceptionRules.descriptionEn,
      rateBps: perceptionRules.rateBps,
    })
    .from(perceptionRules)
    .where(
      and(
        eq(perceptionRules.headingPrefix, ""),
        inForce(perceptionRules.effectiveFrom, perceptionRules.effectiveTo, at),
      ),
    )
    .orderBy(asc(perceptionRules.conditionCode), desc(perceptionRules.effectiveFrom));
}
