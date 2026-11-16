import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documentImages, supplierDocuments } from "@/db/schema";
import { type Actor, ownedQuoteOrThrow } from "@/server/authz";
import { AppError, logger } from "@/server/errors";
import { getStorage, storageKeys } from "@/server/storage";

export const MAX_PDF_BYTES = 20_971_520;
const MIN_IMAGE_SIDE = 2;
const MAX_IMAGES = 60;

// --- PNG propio: zlib + CRC32, sin dependencias ----------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG RGBA de 8 bits por canal a partir de píxeles RGBA en filas. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error("encodePng: tamaño de píxeles incorrecto");
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, deflate, filtro 0, sin entrelazado
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "None" por fila
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// --- Extracción de imágenes con pdfjs-dist ----------------------------------------------------

type PdfImage = {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
};
export type ExtractedImage = { page: number; width: number; height: number; png: Uint8Array };

/** Normaliza gris 1 bpp, RGB 24 bpp o RGBA 32 bpp (ImageKind de pdfjs) a RGBA. */
function toRgba(image: PdfImage): Uint8Array | null {
  const { width, height, kind, data } = image;
  if (!data || width < 1 || height < 1) return null;
  const pixels = width * height;
  const out = new Uint8Array(pixels * 4);
  if (kind === 3 && data.length >= pixels * 4) {
    out.set(data.subarray(0, pixels * 4));
  } else if (kind === 2 && data.length >= pixels * 3) {
    for (let i = 0; i < pixels; i++) {
      out[i * 4] = data[i * 3] ?? 0;
      out[i * 4 + 1] = data[i * 3 + 1] ?? 0;
      out[i * 4 + 2] = data[i * 3 + 2] ?? 0;
      out[i * 4 + 3] = 255;
    }
  } else if (kind === 1) {
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = ((data[y * rowBytes + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
        const value = bit ? 255 : 0;
        out.set([value, value, value, 255], (y * width + x) * 4);
      }
    }
  } else {
    return null;
  }
  return out;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const require = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href;
  }
  return pdfjs;
}

/** Imágenes incrustadas en orden de aparición (página, operador). Omite las menores a 2 px. */
export async function extractPdfImages(bytes: Uint8Array): Promise<ExtractedImage[]> {
  const pdfjs = await loadPdfjs();
  // pdfjs 6.x ya no tiene isEvalSupported (no usa eval). Sin OffscreenCanvas ni ImageDecoder,
  // las imágenes llegan como píxeles (kind + data) y no como bitmaps del navegador.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  });
  const doc = await task.promise;
  const images: ExtractedImage[] = [];
  try {
    for (let pageNo = 1; pageNo <= doc.numPages && images.length < MAX_IMAGES; pageNo++) {
      const page = await doc.getPage(pageNo);
      const operators = await page.getOperatorList();
      const seen = new Set<string>();
      for (let i = 0; i < operators.fnArray.length; i++) {
        if (operators.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
        const name = operators.argsArray[i]?.[0] as string | undefined;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const store = name.startsWith("g_") ? page.commonObjs : page.objs;
        const image = await new Promise<PdfImage | null>((done) => {
          try {
            store.get(name, (value: unknown) => done(value as PdfImage));
          } catch {
            done(null);
          }
        });
        if (!image || image.width < MIN_IMAGE_SIDE || image.height < MIN_IMAGE_SIDE) continue;
        const rgba = toRgba(image);
        if (!rgba) continue;
        images.push({
          page: pageNo,
          width: image.width,
          height: image.height,
          png: encodePng(image.width, image.height, rgba),
        });
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return images;
}

// --- Servicio --------------------------------------------------------------------------------

export type ImageRow = typeof documentImages.$inferSelect;

function startsWithPdf(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  return magic.every((byte, i) => bytes[i] === byte);
}

/** Sube la ficha del proveedor: valida, guarda, registra y extrae las fotos. */
export async function uploadSupplierDocument(
  actor: Actor,
  quoteId: string,
  file: { name: string; type: string; bytes: Uint8Array },
): Promise<{
  documentId: string;
  images: { id: string; width: number; height: number; position: number }[];
}> {
  await ownedQuoteOrThrow(db, actor, quoteId);
  if (file.bytes.length > MAX_PDF_BYTES) {
    throw new AppError("VALIDATION", "El PDF supera 20 MB");
  }
  if (!startsWithPdf(file.bytes)) {
    throw new AppError("VALIDATION", "El archivo no es un PDF");
  }

  const storage = getStorage();
  const documentId = randomUUID();
  const storageKey = storageKeys.upload(actor.userId, quoteId, documentId);
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  await storage.put(storageKey, file.bytes, "application/pdf");

  let extracted: ExtractedImage[] = [];
  try {
    extracted = await extractPdfImages(file.bytes);
  } catch (error) {
    // Un PDF que pdfjs no puede leer igual se guarda; la extracción de fotos es un extra.
    logger.warn("documents: no se pudieron extraer imágenes", { quoteId, error });
  }

  // Las fotos nuevas van después de las que ya tenía la cotización.
  const offset = (await listImages(actor, quoteId)).length;

  const saved: { id: string; key: string; image: ExtractedImage; position: number }[] = [];
  for (const [index, image] of extracted.entries()) {
    const id = randomUUID();
    const key = storageKeys.image(actor.userId, quoteId, id);
    await storage.put(key, image.png, "image/png");
    saved.push({ id, key, image, position: offset + index });
  }

  try {
    await db.transaction(async (tx) => {
      await ownedQuoteOrThrow(tx, actor, quoteId);
      await tx.insert(supplierDocuments).values({
        id: documentId,
        quoteId,
        userId: actor.userId,
        storageKey,
        originalFilename: file.name.slice(0, 255) || "ficha.pdf",
        mimeType: "application/pdf",
        sizeBytes: file.bytes.length,
        sha256,
        extractionStatus: "pending",
      });
      if (saved.length > 0) {
        await tx.insert(documentImages).values(
          saved.map(({ id, key, image, position }) => ({
            id,
            documentId,
            quoteId,
            userId: actor.userId,
            storageKey: key,
            page: image.page,
            width: image.width,
            height: image.height,
            position,
          })),
        );
      }
    });
  } catch (error) {
    // Sin filas no quedan archivos huérfanos.
    await Promise.all([storageKey, ...saved.map((s) => s.key)].map((key) => storage.delete(key)));
    throw error;
  }

  return {
    documentId,
    images: saved.map(({ id, image, position }) => ({
      id,
      width: image.width,
      height: image.height,
      position,
    })),
  };
}

/** Fotos de la cotización ordenadas por position. */
export async function listImages(actor: Actor, quoteId: string): Promise<ImageRow[]> {
  await ownedQuoteOrThrow(db, actor, quoteId);
  return db
    .select()
    .from(documentImages)
    .where(and(eq(documentImages.quoteId, quoteId), eq(documentImages.userId, actor.userId)))
    .orderBy(asc(documentImages.position), asc(documentImages.createdAt));
}

async function ownedImage(actor: Actor, quoteId: string, imageId: string): Promise<ImageRow> {
  await ownedQuoteOrThrow(db, actor, quoteId);
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(imageId);
  const [image] = valid
    ? await db
        .select()
        .from(documentImages)
        .where(
          and(
            eq(documentImages.id, imageId),
            eq(documentImages.quoteId, quoteId),
            eq(documentImages.userId, actor.userId),
          ),
        )
        .limit(1)
    : [];
  if (!image) throw new AppError("NOT_FOUND", "Imagen no encontrada");
  return image;
}

export async function setImageIncluded(
  actor: Actor,
  quoteId: string,
  imageId: string,
  included: boolean,
) {
  const image = await ownedImage(actor, quoteId, imageId);
  await db.update(documentImages).set({ included }).where(eq(documentImages.id, image.id));
}

/** Mueve una foto a `toPosition` (0 = primera) y renumera las demás sin huecos. */
export async function moveImage(
  actor: Actor,
  quoteId: string,
  imageId: string,
  toPosition: number,
) {
  await ownedImage(actor, quoteId, imageId);
  const images = await listImages(actor, quoteId);
  const moving = images.find((image) => image.id === imageId);
  if (!moving) throw new AppError("NOT_FOUND", "Imagen no encontrada");
  const rest = images.filter((image) => image.id !== imageId);
  const target = Math.max(0, Math.min(Math.trunc(toPosition), rest.length));
  rest.splice(target, 0, moving);
  await db.transaction(async (tx) => {
    for (const [position, image] of rest.entries()) {
      if (image.position !== position) {
        await tx.update(documentImages).set({ position }).where(eq(documentImages.id, image.id));
      }
    }
  });
}

/** Bytes PNG de una foto propia (ajena o inexistente → NOT_FOUND). */
export async function readImage(
  actor: Actor,
  quoteId: string,
  imageId: string,
): Promise<Uint8Array> {
  const image = await ownedImage(actor, quoteId, imageId);
  const bytes = await getStorage().get(image.storageKey);
  if (!bytes) throw new AppError("NOT_FOUND", "Imagen no encontrada");
  return bytes;
}
