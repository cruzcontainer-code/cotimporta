import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { e2eDatabaseUrl, e2eOutboxDir } from "./env";

// Contrato con el paso 4: etiquetas y botones de /auth/sign-up y /auth/sign-in en español
// (locale por defecto). Contrato con el paso 3: el driver "log" escribe cada correo como JSON
// en EMAIL_OUTBOX_DIR con nombre "<epoch-ms>-<aleatorio>.json".

type OutboxMessage = { to: string; subject: string; text: string; createdAt: string };

export function uniqueEmail(prefix: string): string {
  const random = Math.floor(Math.random() * 1_000_000);
  return `${prefix}-${Date.now()}-${random}@cotimporta.test`;
}

export function latestEmailTo(to: string): OutboxMessage {
  if (!existsSync(e2eOutboxDir)) {
    throw new Error(`No existe el outbox ${e2eOutboxDir}`);
  }
  const files = readdirSync(e2eOutboxDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const messages = files
    .map((file) => JSON.parse(readFileSync(join(e2eOutboxDir, file), "utf8")) as OutboxMessage)
    .filter((message) => message.to === to);
  const last = messages.at(-1);
  if (!last) {
    throw new Error(`No hay correos para ${to} en ${e2eOutboxDir}`);
  }
  return last;
}

export function firstUrl(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) {
    throw new Error("El correo no contiene un enlace");
  }
  return match[0];
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/app");
}

export async function signUpAndVerify(
  page: Page,
  options: { email: string; password: string; name?: string; country?: string },
): Promise<void> {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Nombre").fill(options.name ?? "Prueba E2E");
  await page.getByLabel("Correo electrónico").fill(options.email);
  await page.getByLabel("Contraseña").fill(options.password);
  await page.getByLabel("País").selectOption(options.country ?? "PE");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Revisa tu correo")).toBeVisible();
  await page.goto(firstUrl(latestEmailTo(options.email).text));
  await page.goto("/app");
  if (page.url().includes("/auth/sign-in")) {
    await signIn(page, options.email, options.password);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
}

export async function grantActiveSubscription(email: string): Promise<void> {
  const sql = postgres(e2eDatabaseUrl, { max: 1 });
  try {
    await sql`
      insert into subscriptions
        (user_id, plan_code, provider, currency, status, current_period_start, current_period_end)
      select id, 'mensual', 'fake', 'USD', 'active', now(), now() + interval '1 month'
      from users where email = ${email}
      on conflict (user_id) do update set
        status = 'active',
        current_period_start = now(),
        current_period_end = now() + interval '1 month'
    `;
  } finally {
    await sql.end();
  }
}

export async function quoteDeletedAt(referenceCode: string): Promise<Date | null> {
  const sql = postgres(e2eDatabaseUrl, { max: 1 });
  try {
    const rows = await sql<{ deleted_at: Date | null }[]>`
      select deleted_at from quotes where reference_code = ${referenceCode}
    `;
    const row = rows[0];
    if (!row) {
      throw new Error(`No existe la cotización ${referenceCode}`);
    }
    return row.deleted_at;
  } finally {
    await sql.end();
  }
}
