import { z } from "zod";

// Fuente única de entorno: ningún otro archivo de src/ lee process.env (excepción: src/db/seed.ts).
// El esquema solo exige DATABASE_URL; cada módulo exige lo suyo con requireEnv() al usarlo.

type Source = Record<string, string | undefined>;

// Una variable vacía en .env ("KEY=") cuenta como ausente.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const optionalText = optional(z.string());

const envSchema = z.object({
  DATABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string({ error: "DATABASE_URL es obligatoria" }).min(1, "DATABASE_URL es obligatoria"),
  ),
  TEST_DATABASE_URL: optionalText,
  DATABASE_URL_UNPOOLED: optionalText,
  VERCEL_ENV: optionalText,
  BETTER_AUTH_SECRET: optional(z.string().min(32)),
  BETTER_AUTH_URL: optional(z.url()),
  ADMIN_EMAILS: optionalText,
  EMAIL_DRIVER: optional(z.enum(["log"])),
  EMAIL_FROM: optionalText,
  EMAIL_OUTBOX_DIR: optionalText,
  LOG_LEVEL: optional(z.enum(["debug", "info", "warn", "error"])),
  ERROR_REPORT_WEBHOOK_URL: optional(z.url()),
  CRON_SECRET: optionalText,
  TARIFF_SOURCE_URL: optional(z.url()),
  STORAGE_DRIVER: optional(z.enum(["local"])),
  STORAGE_LOCAL_DIR: optionalText,
  AI_DRIVER: optional(z.enum(["fake", "gemini"])),
  GEMINI_API_KEY: optionalText,
  GEMINI_MODEL: optionalText,
  AI_TIMEOUT_MS: optional(z.coerce.number().int().positive()),
  PAYMENT_PROVIDER: optional(z.enum(["fake", "izipay"])),
  FAKE_PAYMENT_WEBHOOK_SECRET: optionalText,
  IZIPAY_MODE: optional(z.enum(["recurring", "manual_renewal"])),
  IZIPAY_SHOP_ID: optionalText,
  IZIPAY_API_PASSWORD: optionalText,
  IZIPAY_HMAC_KEY: optionalText,
  IZIPAY_PUBLIC_KEY: optionalText,
  IZIPAY_API_BASE_URL: optional(z.url()),
});

export type Env = z.infer<typeof envSchema>;

const DRIVER_KEYS = ["EMAIL_DRIVER", "STORAGE_DRIVER", "AI_DRIVER", "PAYMENT_PROVIDER"] as const;
const DEV_DRIVERS = new Set(["log", "local", "fake"]);

// En producción no se aceptan valores de desarrollo ("dev-only-…") ni drivers log/local/fake.
function productionProblems(env: Env): string[] {
  if (env.VERCEL_ENV !== "production") {
    return [];
  }
  const problems: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.startsWith("dev-only-")) {
      problems.push(`${key}: valor de desarrollo no permitido en producción`);
    }
  }
  for (const key of DRIVER_KEYS) {
    const value = env[key];
    if (value !== undefined && DEV_DRIVERS.has(value)) {
      problems.push(`${key}: el driver "${value}" no está permitido en producción`);
    }
  }
  return problems;
}

/** Valida un entorno (pura). Lanza un error que nombra cada clave inválida o faltante. */
export function parseEnv(source: Source): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`,
    );
    throw new Error(`Entorno inválido — ${problems.join("; ")}`);
  }
  const problems = productionProblems(result.data);
  if (problems.length > 0) {
    throw new Error(`Entorno inválido — ${problems.join("; ")}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Entorno del proceso validado una sola vez. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Devuelve la variable o lanza "Falta la variable de entorno <KEY>". */
export function requireEnv(key: string): string {
  const value = (getEnv() as Record<string, unknown>)[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Falta la variable de entorno ${key}`);
  }
  return String(value);
}
