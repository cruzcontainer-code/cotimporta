import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { requireEnv } from "@/lib/env";
import { buildExtractionPrompt, extractSpecs } from "@/server/ai/extract-specs";
import { setFakeResponse } from "@/server/ai/gateway";
import type { Actor } from "@/server/authz";
import { uploadSupplierDocument } from "@/server/documents/service";
import { AppError } from "@/server/errors";
import { createQuote } from "@/server/quotes/service";
import { hit } from "@/server/rate-limit";
import { getStorage } from "@/server/storage";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
// Basta con la firma %PDF-: la extracción de fotos falla en silencio y el archivo se guarda igual.
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n");

type Fixture = {
  actor: Actor;
  email: string;
  name: string;
  quoteId: string;
  documentId: string;
  key: string;
};

async function fixture(): Promise<Fixture> {
  const id = randomUUID();
  const email = `${id}@cotimporta.test`;
  const name = `Cliente ${id.slice(0, 8)}`;
  await sql`insert into users (id, name, email, email_verified) values (${id}, ${name}, ${email}, true)`;
  const actor: Actor = { userId: id, role: "user" };
  const quote = await createQuote(actor, { title: "Ficha IA", locale: "es" });
  const { documentId } = await uploadSupplierDocument(actor, quote.id, {
    name: "ficha.pdf",
    type: "application/pdf",
    bytes: PDF,
  });
  const [row] = await sql<
    { storage_key: string }[]
  >`select storage_key from supplier_documents where id = ${documentId}`;
  return { actor, email, name, quoteId: quote.id, documentId, key: row?.storage_key ?? "" };
}

const calls = (quoteId: string) =>
  sql<{ status: string; attempt: number }[]>`
    select status, attempt from ai_calls where quote_id = ${quoteId} order by attempt
  `;
const documentRow = async (documentId: string) =>
  (
    await sql<{ extraction_status: string; extracted_specs: unknown; language: string | null }[]>`
      select extraction_status, extracted_specs, language from supplier_documents where id = ${documentId}
    `
  )[0];

async function expectCode(promise: Promise<unknown>, code: AppError["code"]) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

beforeAll(() => {
  setFakeResponse("extract_specs", undefined);
});

afterEach(() => {
  setFakeResponse("extract_specs", undefined);
});

afterAll(async () => {
  await sql.end();
});

describe("extracción con el driver falso", () => {
  it("una respuesta válida queda en extracted_specs con done y una fila ok en ai_calls", async () => {
    const f = await fixture();
    const specs = await extractSpecs(f.actor, f.quoteId, f.documentId);
    expect(specs.productName.length).toBeGreaterThan(0);

    const doc = await documentRow(f.documentId);
    expect(doc?.extraction_status).toBe("done");
    expect(doc?.extracted_specs).toEqual(specs);
    expect(doc?.language).toBe("es");
    expect(await calls(f.quoteId)).toEqual([{ status: "ok", attempt: 1 }]);
  });

  it("dos salidas fuera de esquema → failed, archivo intacto y UPSTREAM_UNAVAILABLE", async () => {
    const f = await fixture();
    setFakeResponse("extract_specs", { productName: 123, sin: "esquema" });
    await expectCode(extractSpecs(f.actor, f.quoteId, f.documentId), "UPSTREAM_UNAVAILABLE");

    expect((await documentRow(f.documentId))?.extraction_status).toBe("failed");
    expect(await getStorage().get(f.key)).toEqual(PDF);
    expect(await calls(f.quoteId)).toEqual([
      { status: "invalid_output", attempt: 1 },
      { status: "invalid_output", attempt: 2 },
    ]);
  });

  it("timeout → como máximo 2 reintentos y luego UPSTREAM_UNAVAILABLE", async () => {
    const f = await fixture();
    setFakeResponse("extract_specs", "timeout");
    await expectCode(extractSpecs(f.actor, f.quoteId, f.documentId), "UPSTREAM_UNAVAILABLE");
    const rows = await calls(f.quoteId);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "timeout")).toBe(true);
  });

  it("un error no reintentable no se reintenta", async () => {
    const f = await fixture();
    setFakeResponse("extract_specs", new Error("HTTP_400"));
    await expectCode(extractSpecs(f.actor, f.quoteId, f.documentId), "UPSTREAM_UNAVAILABLE");
    expect(await calls(f.quoteId)).toEqual([{ status: "error", attempt: 1 }]);
  });
});

describe("límite de IA", () => {
  it("la llamada 21 en una hora da RATE_LIMITED sin llamar al driver ni escribir ai_calls", async () => {
    const f = await fixture();
    for (let i = 0; i < 20; i++) {
      await hit(`ai:${f.actor.userId}`, 20, 3600);
    }
    await expectCode(extractSpecs(f.actor, f.quoteId, f.documentId), "RATE_LIMITED");
    expect(await calls(f.quoteId)).toEqual([]);
    expect((await documentRow(f.documentId))?.extraction_status).toBe("pending");
  });
});

describe("aislamiento y privacidad", () => {
  it("un documento ajeno da NOT_FOUND", async () => {
    const owner = await fixture();
    const other = await fixture();
    await expectCode(extractSpecs(other.actor, owner.quoteId, owner.documentId), "NOT_FOUND");
  });

  it("el prompt no incluye email, nombre ni id de la cuenta", async () => {
    const f = await fixture();
    for (const locale of ["es", "en"] as const) {
      const prompt = buildExtractionPrompt(locale);
      expect(prompt).not.toContain(f.email);
      expect(prompt).not.toContain(f.name);
      expect(prompt).not.toContain(f.actor.userId);
      expect(prompt).toMatch(locale === "es" ? /español/ : /English/);
    }
  });

  it("solo src/server/ai/gateway.ts importa @google/genai y gemini-model.md está verified", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (readFileSync(full, "utf8").includes("@google/genai"))
          files.push(full.split("\\").join("/"));
      }
    };
    walk("src");
    expect(files).toEqual(["src/server/ai/gateway.ts"]);
    expect(readFileSync("docs/verified/gemini-model.md", "utf8").split(/\r?\n/)).toContain(
      "status: verified",
    );
  });
});
