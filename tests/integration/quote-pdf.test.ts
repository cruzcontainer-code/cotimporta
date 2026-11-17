import { existsSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/quotes/[id]/pdf/route";
import { db } from "@/db/client";
import { seed } from "@/db/seed";
import type { RuleRef } from "@/lib/engine/types";
import { requireEnv } from "@/lib/env";
import type { Actor } from "@/server/authz";
import { getOrCreateQuotePdf, loadPdfData, renderQuotePdf } from "@/server/pdf/render";
import {
  calculateQuote,
  confirmHeading,
  createQuote,
  getQuoteView,
  saveFx,
  saveItems,
  saveSupplierTerms,
  updateProduct,
} from "@/server/quotes/service";
import { createVerifiedSession } from "../helpers/session";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });

beforeAll(async () => {
  await seed(db);
});

afterAll(async () => {
  await sql.end();
});

// Entrada golden BG-880: ítem 1 200 000; gastos demo (con monto) copiados al confirmar la partida.
const GOLDEN_LINES = [
  ["intl_freight", 90_000],
  ["intl_insurance", 4_000],
  ["customs_agency", 25_000],
  ["warehouse", 12_720],
  ["local_transport", 10_000],
  ["management_fee", 150_000],
];

async function goldenQuote(actor: Actor): Promise<{ id: string; referenceCode: string }> {
  const quote = await createQuote(actor, { title: "BG-880", locale: "es" });
  await updateProduct(actor, quote.id, {
    title: "Sopladora PET BG-880",
    productDescription: "Sopladora semiautomática de botellas PET",
    clientName: "",
    originCountry: "CN",
    hasOriginCertificate: false,
    importerCondition: "no_aplica",
    dutiableUnits: 1,
  });
  await saveItems(actor, quote.id, [
    { description: "Planta BG-880", quantity: 1, totalMinor: 1_200_000 },
  ]);
  await confirmHeading(actor, quote.id, "8477300000");
  await saveSupplierTerms(actor, quote.id, {
    advanceBps: 3_000,
    balanceBps: 7_000,
    productionDaysMin: 30,
    productionDaysMax: 35,
    shippingCoordinationDays: 7,
    transitDaysMin: 30,
    transitDaysMax: 40,
  });
  await saveFx(actor, quote.id, { penPerUsdE4: 35_000, date: "2026-10-29", source: "SBS" });
  await calculateQuote(actor, quote.id);
  return quote;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const doc = await task.promise;
  try {
    let text = "";
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      text += content.items.map((item) => ("str" in item ? item.str : "")).join("");
    }
    return text.replace(/\s+/g, "");
  } finally {
    await task.destroy();
  }
}

const request = (id: string, cookie: string, locale = "es") =>
  GET(
    new Request(`http://localhost/api/v1/quotes/${id}/pdf?locale=${locale}`, {
      headers: { cookie },
    }),
    {
      params: Promise.resolve({ id }),
    },
  );

describe("PDF formal de la cotización golden", () => {
  it("usa solo reglas del seed, trae los totales, el código, el aviso y la fecha de reglas", async () => {
    const session = await createVerifiedSession("pdf");
    const actor: Actor = { userId: session.userId, role: "user" };
    const quote = await goldenQuote(actor);
    const view = await getQuoteView(actor, quote.id);
    const lines = view.costLines.filter((line) => line.amountMinor > 0);
    expect(lines.map((line) => [line.conceptCode, line.amountMinor]).sort()).toEqual(
      [...GOLDEN_LINES].sort(),
    );
    const snapshot = view.snapshot as RuleRef[];
    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot.every((ref) => ref.sourceUrl === "seed://demo")).toBe(true);

    const es = await getOrCreateQuotePdf(actor, quote.id, "es");
    expect(new TextDecoder().decode(es.bytes.slice(0, 5))).toBe("%PDF-");
    const text = await pdfText(es.bytes);
    expect(text).toContain("17,332.30");
    expect(text).toContain("60,663.05");
    expect(text).toContain(quote.referenceCode);
    expect(text).toContain("PROPUESTADEINVERSIÓN");
    expect(text).toContain("Estimaciónreferencial");
    expect(text).toMatch(/Página1de\d/);
    expect(text).toContain(view.quote.rulesAsOf);

    const en = await pdfText((await getOrCreateQuotePdf(actor, quote.id, "en")).bytes);
    expect(en).toContain("INVESTMENTPROPOSAL");
    expect(en).toContain("17,332.30");
  });

  it("con public/brand/logo.png la cabecera usa la imagen; sin logo, la marca de texto Cotimporta", async () => {
    expect(existsSync("public/brand/logo.png")).toBe(true);
    const session = await createVerifiedSession("pdf-logo");
    const actor: Actor = { userId: session.userId, role: "user" };
    const quote = await goldenQuote(actor);
    const data = await loadPdfData(actor, quote.id);
    expect(data.logo).not.toBeNull();

    const withLogo = await renderQuotePdf(data, "es");
    expect(new TextDecoder("latin1").decode(withLogo)).toContain("/Subtype /Image");
    const withLogoText = await pdfText(withLogo);
    expect(withLogoText.startsWith("Cotimporta")).toBe(false);
    expect(withLogoText).toContain(quote.referenceCode);

    const wordmark = await pdfText(await renderQuotePdf({ ...data, logo: null }, "es"));
    expect(wordmark.startsWith("Cotimporta")).toBe(true);
  });
});

describe("descarga por la ruta", () => {
  it("el dueño recibe 200 application/pdf y la versión sube al recalcular; un ajeno recibe 404", async () => {
    const owner = await createVerifiedSession("pdf-owner");
    const actor: Actor = { userId: owner.userId, role: "user" };
    const quote = await goldenQuote(actor);
    const versions = () =>
      sql<{ version: number }[]>`
        select version from generated_documents
        where quote_id = ${quote.id} and locale = 'es' order by version
      `;

    const first = await request(quote.id, owner.cookie);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("application/pdf");
    expect(first.headers.get("content-disposition")).toBe(
      `attachment; filename="${quote.referenceCode}-es.pdf"`,
    );
    expect(new TextDecoder().decode(new Uint8Array(await first.arrayBuffer()).slice(0, 5))).toBe(
      "%PDF-",
    );
    expect(await versions()).toEqual([{ version: 1 }]);

    // Sin recalcular se reutiliza la misma versión.
    expect((await request(quote.id, owner.cookie)).status).toBe(200);
    expect(await versions()).toEqual([{ version: 1 }]);

    await calculateQuote(actor, quote.id);
    expect((await request(quote.id, owner.cookie)).status).toBe(200);
    expect(await versions()).toEqual([{ version: 1 }, { version: 2 }]);

    const intruder = await createVerifiedSession("pdf-intruder");
    expect((await request(quote.id, intruder.cookie)).status).toBe(404);
    expect((await request(quote.id, intruder.cookie, "en")).status).toBe(404);
  });
});
