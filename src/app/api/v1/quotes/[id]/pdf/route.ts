import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { AppError, toJsonResponse } from "@/server/errors";
import { getOrCreateQuotePdf } from "@/server/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Descarga el PDF formal: `?locale=es|en`. Solo el dueño; ajena → 404. */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id } = await params;
    const actor = await requireActor(request.headers);
    const locale = new URL(request.url).searchParams.get("locale") ?? "es";
    if (locale !== "es" && locale !== "en") {
      throw new AppError("VALIDATION", "locale debe ser es o en");
    }
    const pdf = await getOrCreateQuotePdf(actor, id, locale);
    return new Response(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toJsonResponse(error, requestId);
  }
}
