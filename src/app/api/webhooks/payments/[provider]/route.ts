import { randomUUID } from "node:crypto";
import { handleWebhook } from "@/server/billing/service";
import { toJsonResponse } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ provider: string }> };

/** Webhook del proveedor de pagos. La firma se verifica sobre el cuerpo crudo, antes de parsear. */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  try {
    const rawBody = await request.text();
    const { provider } = await params;
    const outcome = await handleWebhook(provider, rawBody, request.headers);
    return Response.json(outcome.body, { status: outcome.status });
  } catch (error) {
    return toJsonResponse(error, requestId);
  }
}
