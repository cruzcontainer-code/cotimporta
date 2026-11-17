"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/i18n/messages";
import { requireActor } from "@/lib/auth";
import { refreshNarrative } from "@/server/ai/narrative";
import { suggestHeadings } from "@/server/ai/suggest-heading";
import type { Actor } from "@/server/authz";
import { AppError, type Result, toResult } from "@/server/errors";
import {
  type CostLineInput,
  calculateQuote,
  confirmHeading,
  costLinesSchema,
  createQuote,
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
  softDeleteQuote,
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

/** Calcula y luego intenta la narrativa; si la IA falla, el resultado se devuelve igual. */
export async function calculateQuoteAction(quoteId: string) {
  return quoteAction(quoteId, async (actor, id) => {
    const result = await calculateQuote(actor, id);
    await refreshNarrative(actor, id);
    return result;
  });
}

export async function searchHeadingsAction(query: string) {
  return toResult(async () => {
    await requireActor();
    return searchTariffHeadings(valid(z.string().trim().max(100), query));
  });
}

/**
 * Sugerencia con IA validada contra el arancel vigente. No cambia la partida: el usuario confirma
 * una con confirmHeadingAction. Sin candidatos válidos devuelve una lista vacía.
 */
export async function suggestHeadingsAction(
  quoteId: string,
): Promise<Result<{ code: string; descriptionEs: string; descriptionEn: string }[]>> {
  return toResult(async () => {
    const id = valid(quoteIdSchema, quoteId);
    const { candidates } = await suggestHeadings(await requireActor(), id);
    return candidates;
  });
}

/** Crea una cotización y abre el asistente; sin cuota vuelve al listado con el aviso. */
export async function createQuoteAction(): Promise<void> {
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : "es";
  const result = await toResult(async () =>
    createQuote(await requireActor(), {
      title: locale === "es" ? "Nueva cotización" : "New quote",
      locale,
    }),
  );
  // redirect() fuera de toResult: lanza una excepción interna que toResult atraparía.
  if (!result.ok) {
    redirect(`/app/quotes?error=${result.error.code === "QUOTA_EXCEEDED" ? "quota" : "create"}`);
  }
  revalidatePath("/app/quotes");
  redirect(`/app/quotes/${result.data.id}?paso=producto`);
}

/** Borrado lógico confirmado en un <dialog>; recibe el id desde el formulario. */
export async function deleteQuoteAction(formData: FormData): Promise<Result<null>> {
  return toResult(async () => {
    const id = valid(quoteIdSchema, formData.get("quoteId"));
    await softDeleteQuote(await requireActor(), id);
    revalidatePath("/app/quotes");
    return null;
  });
}
