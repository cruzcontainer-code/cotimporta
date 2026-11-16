import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { db } from "@/db/client";
import { aiCalls } from "@/db/schema";
import { getEnv, requireEnv } from "@/lib/env";
import { AppError, logger } from "@/server/errors";
import { hit } from "@/server/rate-limit";

// Único archivo que importa @google/genai. El resto de la app llama a generateJson().
// El modelo sale de GEMINI_MODEL (docs/verified/gemini-model.md); nunca un literal aquí.

export type GenerateJsonInput<T> = {
  purpose: string;
  userId: string;
  quoteId: string | null;
  schema: z.ZodType<T>;
  prompt: string;
  pdf?: Uint8Array;
  locale: "es" | "en";
};

type CallStatus = "ok" | "error" | "timeout" | "invalid_output" | "rate_limited";

class DriverError extends Error {
  readonly status: CallStatus;
  readonly retryable: boolean;
  readonly code: string;

  constructor(status: CallStatus, retryable: boolean, code: string) {
    super(code);
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}

type DriverResponse = { text: string; inputTokens?: number; outputTokens?: number };

const MAX_RETRIES = 2;
const AI_LIMIT_PER_HOUR = 20;

// --- Driver falso (pruebas y desarrollo local) -----------------------------------------------

type FakeResponse = unknown | Error | "timeout";
const fakeResponses = new Map<string, FakeResponse>();
const fakeDefaults = new Map<string, unknown>();

/** Fija la respuesta del driver falso para un propósito; `undefined` vuelve al valor por defecto. */
export function setFakeResponse(purpose: string, value: FakeResponse | undefined): void {
  if (value === undefined) fakeResponses.delete(purpose);
  else fakeResponses.set(purpose, value);
}

/** Respuesta válida por defecto de un propósito (la registra el módulo que define el esquema). */
export function registerFakeDefault(purpose: string, value: unknown): void {
  fakeDefaults.set(purpose, value);
}

async function callFake(purpose: string): Promise<DriverResponse> {
  const value = fakeResponses.has(purpose) ? fakeResponses.get(purpose) : fakeDefaults.get(purpose);
  if (value === "timeout") throw new DriverError("timeout", true, "TIMEOUT");
  if (value instanceof Error) throw new DriverError("error", false, value.message);
  return { text: typeof value === "string" ? value : JSON.stringify(value ?? {}) };
}

// --- Driver Gemini ---------------------------------------------------------------------------

let client: GoogleGenAI | undefined;

async function callGemini(
  input: GenerateJsonInput<unknown>,
  prompt: string,
  timeoutMs: number,
): Promise<DriverResponse> {
  client ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (input.pdf) {
    parts.push({
      inlineData: { mimeType: "application/pdf", data: Buffer.from(input.pdf).toString("base64") },
    });
  }
  parts.push({ text: prompt });
  try {
    const response = await client.models.generateContent({
      model: requireEnv("GEMINI_MODEL"),
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(input.schema),
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    return {
      text: response.text ?? "",
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new DriverError("timeout", true, "TIMEOUT");
    }
    if (error instanceof ApiError) {
      if (error.status === 429) throw new DriverError("rate_limited", true, "HTTP_429");
      if (error.status >= 500) throw new DriverError("error", true, `HTTP_${error.status}`);
      throw new DriverError("error", false, `HTTP_${error.status}`);
    }
    throw new DriverError("error", false, error instanceof Error ? error.name : "UNKNOWN");
  }
}

// --- generateJson ----------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const backoffMs = (retry: number) => 250 * 2 ** retry + Math.floor(Math.random() * 100);

/**
 * JSON validado con Zod: límite 20/h por usuario, timeout, hasta 2 reintentos (timeout/429/5xx),
 * una reparación con el error anexado y una fila en ai_calls por intento.
 */
export async function generateJson<T>(input: GenerateJsonInput<T>): Promise<T> {
  const limit = await hit(`ai:${input.userId}`, AI_LIMIT_PER_HOUR, 3600);
  if (!limit.allowed) {
    throw new AppError("RATE_LIMITED", "Usaste muchas consultas de IA. Intenta en un rato.");
  }
  const driver = getEnv().AI_DRIVER ?? "fake";
  const model = driver === "gemini" ? requireEnv("GEMINI_MODEL") : "fake";
  const timeoutMs = getEnv().AI_TIMEOUT_MS ?? 30_000;

  let prompt = input.prompt;
  let retries = 0;
  let repaired = false;
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    const record = (
      status: CallStatus,
      extra: { errorCode?: string; inputTokens?: number; outputTokens?: number } = {},
    ) =>
      db.insert(aiCalls).values({
        userId: input.userId,
        quoteId: input.quoteId,
        purpose: input.purpose,
        model,
        status,
        attempt,
        latencyMs: Date.now() - started,
        inputTokens: extra.inputTokens ?? null,
        outputTokens: extra.outputTokens ?? null,
        errorCode: extra.errorCode ?? null,
      });

    try {
      const response =
        driver === "gemini"
          ? await callGemini(input as GenerateJsonInput<unknown>, prompt, timeoutMs)
          : await callFake(input.purpose);
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        parsed = undefined;
      }
      const result = input.schema.safeParse(parsed);
      if (result.success) {
        await record("ok", {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });
        return result.data;
      }
      await record("invalid_output", {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        errorCode: "SCHEMA",
      });
      if (repaired) break;
      repaired = true;
      const problems = result.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
        .join("; ");
      prompt = `${input.prompt}\n\nTu respuesta anterior no cumplía el esquema JSON (${problems}). Devuelve solo JSON válido según el esquema.`;
    } catch (error) {
      const failure =
        error instanceof DriverError ? error : new DriverError("error", false, "UNKNOWN");
      await record(failure.status, { errorCode: failure.code });
      if (!failure.retryable || retries >= MAX_RETRIES) break;
      await sleep(backoffMs(retries));
      retries++;
    }
  }
  logger.warn("ai: sin respuesta válida", { purpose: input.purpose, quoteId: input.quoteId });
  throw new AppError("UPSTREAM_UNAVAILABLE", "La IA no está disponible; continúa manualmente");
}
