import { randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "INVALID_SIGNATURE"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  QUOTA_EXCEEDED: 402,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  INVALID_SIGNATURE: 400,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export function httpStatus(code: ErrorCode): number {
  return STATUS[code];
}

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }

  get status(): number {
    return httpStatus(this.code);
  }
}

export type ResultError = { code: ErrorCode; message: string };
export type Result<T> = { ok: true; data: T } | { ok: false; error: ResultError };

const INTERNAL_MESSAGE = "Ocurrió un error inesperado. Intenta de nuevo.";

function asAppError(error: unknown): AppError {
  return error instanceof AppError ? error : new AppError("INTERNAL", INTERNAL_MESSAGE);
}

/** Ejecuta fn y devuelve un resultado tipado; un error no previsto se reporta como INTERNAL. */
export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (!(error instanceof AppError)) {
      await reportError(error, { where: "toResult" });
    }
    const appError = asAppError(error);
    return { ok: false, error: { code: appError.code, message: appError.message } };
  }
}

/** Respuesta JSON única de error: { ok: false, error: { code, message, requestId } }. */
export function toJsonResponse(error: unknown, requestId: string = randomUUID()): Response {
  const appError = asAppError(error);
  return Response.json(
    { ok: false, error: { code: appError.code, message: appError.message, requestId } },
    { status: appError.status },
  );
}

// --- Logger -------------------------------------------------------------------------------

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /password|token|secret|key|authorization|cookie/i;

/** Copia profunda con los valores de claves sensibles reemplazados por "[REDACTED]". */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(inner, seen);
  }
  return out;
}

function write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const minimum = getEnv().LOG_LEVEL ?? "info";
  if (LEVELS[level] < LEVELS[minimum]) {
    return;
  }
  const { requestId, ...rest } = fields;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    requestId: typeof requestId === "string" ? requestId : undefined,
    msg,
    ...(redact(rest) as Record<string, unknown>),
  });
  if (level === "warn" || level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

/** Reporta un error: log por defecto o POST JSON a ERROR_REPORT_WEBHOOK_URL (3 s). Nunca lanza. */
export async function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const payload = {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      context: redact(context),
      time: new Date().toISOString(),
    };
    const url = getEnv().ERROR_REPORT_WEBHOOK_URL;
    if (!url) {
      logger.error("error reportado", payload);
      return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Reportar nunca debe romper la petición.
  }
}
