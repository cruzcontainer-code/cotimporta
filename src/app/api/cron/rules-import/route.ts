import { createHash, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";
import { AppError, toJsonResponse } from "@/server/errors";
import { officialAdapter, runImport } from "@/server/rules/import";

export const dynamic = "force-dynamic";

/** Comparación en tiempo constante (se comparan los SHA-256 para igualar longitudes). */
function sameSecret(received: string, expected: string): boolean {
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) && received.length === expected.length;
}

/** Corrida programada: solo pone en staging; publicar es una acción del admin. */
export async function GET(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  if (!sameSecret(header, `Bearer ${requireEnv("CRON_SECRET")}`)) {
    return toJsonResponse(new AppError("UNAUTHENTICATED", "Cron no autorizado"));
  }
  const run = await runImport({
    adapter: officialAdapter(),
    source: "official",
    triggeredBy: "cron",
  });
  return Response.json({ ok: true, data: { runId: run.id, status: run.status } });
}
