import { Document, Image, Page, renderToBuffer } from "@react-pdf/renderer";
import postgres from "postgres";
import { createElement } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/quotes/[id]/documents/route";
import { requireEnv } from "@/lib/env";
import type { Actor } from "@/server/authz";
import {
  encodePng,
  listImages,
  MAX_PDF_BYTES,
  moveImage,
  PNG_SIGNATURE,
  setImageIncluded,
} from "@/server/documents/service";
import { createQuote } from "@/server/quotes/service";
import { getStorage } from "@/server/storage";
import { createVerifiedSession } from "../helpers/session";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });

type Session = Awaited<ReturnType<typeof createVerifiedSession>> & {
  actor: Actor;
  quoteId: string;
};
let owner: Session;
let other: Session;
let pdf: Uint8Array;

async function session(prefix: string): Promise<Session> {
  const created = await createVerifiedSession(prefix);
  const actor: Actor = { userId: created.userId, role: "user" };
  const quote = await createQuote(actor, { title: "Ficha", locale: "es" });
  return { ...created, actor, quoteId: quote.id };
}

/** PDF real con imágenes PNG incrustadas (una de 4×4 y otra de 1×1, que debe omitirse). */
async function pdfWithImages(): Promise<Uint8Array> {
  const red = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) red.set([220, 20, 60, 255], i * 4);
  const tiny = encodePng(1, 1, new Uint8Array([0, 0, 0, 255]));
  const square = encodePng(4, 4, red);
  const image = (png: Uint8Array) =>
    createElement(Image, {
      src: { data: Buffer.from(png), format: "png" },
      style: { width: 40, height: 40 },
    });
  const doc = createElement(
    Document,
    null,
    createElement(Page, { size: "A4" }, image(square), image(tiny)),
  );
  return new Uint8Array(await renderToBuffer(doc));
}

function upload(target: Session, bytes: Uint8Array, cookie = target.cookie, name = "ficha.pdf") {
  const form = new FormData();
  form.set("file", new File([bytes.slice()], name, { type: "application/pdf" }));
  return POST(
    new Request(`http://localhost/api/v1/quotes/${target.quoteId}/documents`, {
      method: "POST",
      body: form,
      headers: { cookie },
    }),
    {
      params: Promise.resolve({ id: target.quoteId }),
    },
  );
}

function getImage(target: Session, imageId: string, cookie = target.cookie) {
  return GET(
    new Request(`http://localhost/api/v1/quotes/${target.quoteId}/documents?image=${imageId}`, {
      headers: { cookie },
    }),
    {
      params: Promise.resolve({ id: target.quoteId }),
    },
  );
}

const countDocuments = async (quoteId: string) =>
  (
    await sql<
      { n: number }[]
    >`select count(*)::int as n from supplier_documents where quote_id = ${quoteId}`
  )[0]?.n ?? 0;

beforeAll(async () => {
  owner = await session("docs-owner");
  other = await session("docs-other");
  pdf = await pdfWithImages();
});

afterAll(async () => {
  await sql.end();
});

describe("subida de la ficha del proveedor", () => {
  it("guarda el PDF bajo users/<userId>/quotes/<quoteId>/uploads/ con su SHA-256 y responde 201", async () => {
    const response = await upload(owner, pdf);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { ok: true; data: { documentId: string } };
    expect(body.ok).toBe(true);

    const [row] = await sql<
      { storage_key: string; sha256: string; size_bytes: number; extraction_status: string }[]
    >`
      select storage_key, sha256, size_bytes, extraction_status from supplier_documents where id = ${body.data.documentId}
    `;
    expect(row?.storage_key).toMatch(
      new RegExp(`^users/${owner.userId}/quotes/${owner.quoteId}/uploads/[0-9a-f-]{36}\\.pdf$`),
    );
    expect(row?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.size_bytes).toBe(pdf.length);
    expect(row?.extraction_status).toBe("pending");
    expect(await getStorage().get(row?.storage_key ?? "")).toEqual(pdf);
  });

  it("extrae la imagen 4×4 como PNG y omite la de 1×1", async () => {
    const images = await listImages(owner.actor, owner.quoteId);
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(images.every((image) => image.width >= 2 && image.height >= 2)).toBe(true);
    const square = images.find((image) => image.width === 4 && image.height === 4);
    expect(square).toBeDefined();

    const response = await getImage(owner, square?.id ?? "");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it("rechaza con 422 un archivo que no es PDF y uno de más de 20 MB, sin guardar nada", async () => {
    const before = await countDocuments(owner.quoteId);
    const notPdf = await upload(
      owner,
      new TextEncoder().encode("hola, no soy un PDF"),
      owner.cookie,
      "x.pdf",
    );
    expect(notPdf.status).toBe(422);

    const big = new Uint8Array(MAX_PDF_BYTES + 1);
    big.set(new TextEncoder().encode("%PDF-1.7"));
    const tooBig = await upload(owner, big);
    expect(tooBig.status).toBe(422);
    expect(await countDocuments(owner.quoteId)).toBe(before);
  });
});

describe("aislamiento", () => {
  it("subir a una cotización ajena o leer su imagen responde 404", async () => {
    const intoOther = await upload(other, pdf, owner.cookie);
    expect(intoOther.status).toBe(404);
    expect(await countDocuments(other.quoteId)).toBe(0);

    const [image] = await listImages(owner.actor, owner.quoteId);
    const foreign = await GET(
      new Request(`http://localhost/api/v1/quotes/${owner.quoteId}/documents?image=${image?.id}`, {
        headers: { cookie: other.cookie },
      }),
      { params: Promise.resolve({ id: owner.quoteId }) },
    );
    expect(foreign.status).toBe(404);
  });

  it("sin sesión responde 401", async () => {
    const response = await upload(owner, pdf, "");
    expect(response.status).toBe(401);
  });
});

describe("fotos: excluir y reordenar", () => {
  it("persiste included y position, y las lecturas vuelven ordenadas", async () => {
    // Una segunda subida suma fotos al final.
    expect((await upload(owner, pdf)).status).toBe(201);
    const images = await listImages(owner.actor, owner.quoteId);
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(images.map((image) => image.position)).toEqual([...images.keys()]);

    const last = images.at(-1);
    await moveImage(owner.actor, owner.quoteId, last?.id ?? "", 0);
    await setImageIncluded(owner.actor, owner.quoteId, last?.id ?? "", false);

    const after = await listImages(owner.actor, owner.quoteId);
    expect(after[0]?.id).toBe(last?.id);
    expect(after[0]?.included).toBe(false);
    expect(after.map((image) => image.position)).toEqual([...after.keys()]);
  });
});
