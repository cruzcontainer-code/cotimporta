import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { generatedDocuments } from "@/db/schema";
import { EMPTY_SPECS, SpecsSchema } from "@/server/ai/extract-specs";
import type { Narrative } from "@/server/ai/narrative";
import type { Actor } from "@/server/authz";
import { listImages, readImage } from "@/server/documents/service";
import { AppError } from "@/server/errors";
import { type QuotePdfData, quoteDocument } from "@/server/pdf/quote-document";
import { getQuoteView } from "@/server/quotes/service";
import { getStorage, storageKeys } from "@/server/storage";

type Locale = "es" | "en";

/** Logo opcional de la marca; si no existe, la cabecera usa el wordmark "Cotimporta". */
async function readLogo(): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(join(process.cwd(), "public", "brand", "logo.png")));
  } catch {
    return null;
  }
}

/** Renderiza el PDF de una cotización ya cargada. Devuelve bytes que empiezan con %PDF-. */
export async function renderQuotePdf(quote: QuotePdfData, locale: Locale): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(quoteDocument(quote, locale)));
}

/** Reúne lo que necesita el documento: cotización calculada del dueño, ficha, fotos y narrativa. */
export async function loadPdfData(actor: Actor, quoteId: string): Promise<QuotePdfData> {
  const view = await getQuoteView(actor, quoteId);
  const { quote, result, terms } = view;
  if (quote.status !== "calculated" || !result || !quote.calculatedAt || !quote.rulesAsOf) {
    throw new AppError("VALIDATION", "Calcula la cotización antes de generar el PDF");
  }
  const included = (await listImages(actor, quoteId)).filter((image) => image.included);
  const images = await Promise.all(included.map((image) => readImage(actor, quoteId, image.id)));
  return {
    referenceCode: quote.referenceCode,
    title: quote.title,
    productDescription: quote.productDescription,
    clientName: quote.clientName,
    calculatedAt: quote.calculatedAt,
    validityDays: quote.validityDays,
    fx: result.fx,
    rulesAsOf: quote.rulesAsOf,
    headingCode: quote.tariffHeadingCode,
    advanceBps: terms?.advanceBps ?? 0,
    result,
    snapshot: view.snapshot,
    specs: SpecsSchema.safeParse(quote.specs).data ?? EMPTY_SPECS,
    images,
    narrative: (quote.narrative as Narrative | null) ?? null,
    costLines: view.costLines.map(({ conceptCode, label }) => ({ conceptCode, label })),
    logo: await readLogo(),
  };
}

export type QuotePdf = { bytes: Uint8Array; filename: string; version: number };

/**
 * PDF del dueño para un locale. Si ya hay una versión generada para el cálculo vigente
 * (result_calculated_at = quotes.calculated_at) la reutiliza; si no, renderiza, guarda en
 * …/generated/<locale>-v<n>.pdf e inserta la versión max+1.
 */
export async function getOrCreateQuotePdf(
  actor: Actor,
  quoteId: string,
  locale: Locale,
): Promise<QuotePdf> {
  const data = await loadPdfData(actor, quoteId);
  const filename = `${data.referenceCode}-${locale}.pdf`;
  const storage = getStorage();
  const forQuote = and(
    eq(generatedDocuments.quoteId, quoteId),
    eq(generatedDocuments.userId, actor.userId),
    eq(generatedDocuments.locale, locale),
  );

  const [latest] = await db
    .select()
    .from(generatedDocuments)
    .where(forQuote)
    .orderBy(desc(generatedDocuments.version))
    .limit(1);
  if (latest && latest.resultCalculatedAt.getTime() === data.calculatedAt.getTime()) {
    const bytes = await storage.get(latest.storageKey);
    if (bytes) return { bytes, filename, version: latest.version };
  }

  const bytes = await renderQuotePdf(data, locale);
  const version = (latest?.version ?? 0) + 1;
  const key = storageKeys.generated(actor.userId, quoteId, `${locale}-v${version}.pdf`);
  await storage.put(key, bytes, "application/pdf");
  await db.insert(generatedDocuments).values({
    quoteId,
    userId: actor.userId,
    storageKey: key,
    locale,
    version,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    resultCalculatedAt: data.calculatedAt,
  });
  return { bytes, filename, version };
}
