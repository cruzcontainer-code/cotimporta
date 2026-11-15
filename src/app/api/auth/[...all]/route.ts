import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { clientIp, hit } from "@/server/rate-limit";

const handlers = toNextJsHandler(auth);

const LIMITS = {
  "sign-in": { limit: 10, windowSeconds: 60 },
  "sign-up": { limit: 5, windowSeconds: 3600 },
  other: { limit: 30, windowSeconds: 60 },
} as const;

function bucketFor(pathname: string): keyof typeof LIMITS {
  if (pathname.endsWith("/sign-in/email")) {
    return "sign-in";
  }
  if (pathname.endsWith("/sign-up/email")) {
    return "sign-up";
  }
  return "other";
}

export const GET = handlers.GET;

export async function POST(request: Request): Promise<Response> {
  const bucket = bucketFor(new URL(request.url).pathname);
  const { limit, windowSeconds } = LIMITS[bucket];
  const result = await hit(`auth:${clientIp(request.headers)}:${bucket}`, limit, windowSeconds);
  if (!result.allowed) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Demasiados intentos. Espera un momento y vuelve a intentar.",
        },
      },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  return handlers.POST(request);
}
