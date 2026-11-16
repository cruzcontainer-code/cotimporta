import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { readImage, uploadSupplierDocument } from "@/server/documents/service";
import { AppError, toJsonResponse } from "@/server/errors";
import { hit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Sube la ficha del proveedor (multipart, campo `file`). Límite 30/h por usuario. */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id } = await params;
    const actor = await requireActor(request.headers);
    const limit = await hit(`documents:${actor.userId}`, 30, 3600);
    if (!limit.allowed) {
      const response = toJsonResponse(
        new AppError("RATE_LIMITED", "Subiste muchos archivos. Espera un momento."),
        requestId,
      );
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION", "Falta el archivo en el campo file");
    }
    const data = await uploadSupplierDocument(actor, id, {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return toJsonResponse(error, requestId);
  }
}

/** Bytes PNG de una foto extraída: `?image=<id>`, solo del dueño. */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id } = await params;
    const actor = await requireActor(request.headers);
    const imageId = new URL(request.url).searchParams.get("image") ?? "";
    const bytes = await readImage(actor, id, imageId);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toJsonResponse(error, requestId);
  }
}
