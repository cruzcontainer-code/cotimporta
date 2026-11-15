"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import type { Actor } from "@/server/authz";
import { AppError, type Result, toResult } from "@/server/errors";
import {
  type CostLineInput,
  calculateQuote,
  confirmHeading,
  costLinesSchema,
  type FxInput,
  fxSchema,
  type ItemInput,
  itemsSchema,
  type ProductInput,
  productSchema,
  type SupplierTermsInput,
  saveCostLines,
  saveFx,
  saveItems,
  saveSupplierTerms,
  searchTariffHeadings,
  supplierTermsSchema,
  updateProduct,
} from "@/server/quotes/service";

const quoteIdSchema = z.uuid();

/** Zod en el borde: un dato inválido es VALIDATION (422), nunca INTERNAL. */
function valid<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
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

/** Transporte delgado: valida en el borde, obtiene el actor, llama al servicio y revalida. */
function quoteAction<T>(
  quoteId: string,
  run: (actor: Actor, id: string) => Promise<T>,
): Promise<Result<T>> {
  return toResult(async () => {
    const id = valid(quoteIdSchema, quoteId);
    const actor = await requireActor();
    const data = await run(actor, id);
    revalidatePath(`/app/quotes/${id}`);
    return data;
  });
}

export async function updateProductAction(quoteId: string, input: ProductInput) {
  return quoteAction(quoteId, (actor, id) => updateProduct(actor, id, valid(productSchema, input)));
}

export async function saveItemsAction(quoteId: string, input: ItemInput[]) {
  return quoteAction(quoteId, (actor, id) => saveItems(actor, id, valid(itemsSchema, input)));
}

export async function confirmHeadingAction(quoteId: string, code: string) {
  return quoteAction(quoteId, (actor, id) =>
    confirmHeading(actor, id, valid(z.string().regex(/^\d{10}$/), code)),
  );
}

export async function saveCostLinesAction(quoteId: string, input: CostLineInput[]) {
  return quoteAction(quoteId, (actor, id) =>
    saveCostLines(actor, id, valid(costLinesSchema, input)),
  );
}

export async function saveSupplierTermsAction(quoteId: string, input: SupplierTermsInput) {
  return quoteAction(quoteId, (actor, id) =>
    saveSupplierTerms(actor, id, valid(supplierTermsSchema, input)),
  );
}

export async function saveFxAction(quoteId: string, input: FxInput) {
  return quoteAction(quoteId, (actor, id) => saveFx(actor, id, valid(fxSchema, input)));
}

export async function calculateQuoteAction(quoteId: string) {
  return quoteAction(quoteId, (actor, id) => calculateQuote(actor, id));
}

export async function searchHeadingsAction(query: string) {
  return toResult(async () => {
    await requireActor();
    return searchTariffHeadings(valid(z.string().trim().max(100), query));
  });
}

/** Sugerencia con IA: no disponible hasta E3-T3; la UI sigue por el camino manual. */
export async function suggestHeadingsAction(
  _quoteId: string,
): Promise<Result<{ code: string; descriptionEs: string; descriptionEn: string }[]>> {
  return { ok: false, error: { code: "UPSTREAM_UNAVAILABLE", message: "IA no disponible" } };
}
