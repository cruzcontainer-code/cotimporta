import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { exportAccount } from "@/server/account/service";
import { toJsonResponse } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descarga todos los datos de la cuenta en JSON (límite 5 por día). */
export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const data = await exportAccount(await requireActor(request.headers));
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="cotimporta-export.json"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toJsonResponse(error, requestId);
  }
}
