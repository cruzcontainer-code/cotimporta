import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { clearOutbox, readOutbox } from "@/server/email";
import { hit } from "@/server/rate-limit";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
const PASSWORD = "contraseña-segura-123";

afterAll(async () => {
  await sql.end();
});

beforeEach(() => {
  clearOutbox();
});

const newEmail = () => `${randomUUID()}@cotimporta.test`;

async function signUp(email: string): Promise<void> {
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Prueba" } });
}

async function userRow(email: string) {
  const [row] = await sql<{ id: string; email_verified: boolean; role: string }[]>`
    select id, email_verified, role from users where email = ${email}
  `;
  if (!row) {
    throw new Error(`No existe el usuario ${email}`);
  }
  return row;
}

async function sessionCount(userId: string): Promise<number> {
  const [row] = await sql<
    { n: number }[]
  >`select count(*)::int as n from sessions where user_id = ${userId}`;
  return row?.n ?? 0;
}

function verificationUrl(email: string): string {
  const messages = readOutbox().filter((message) => message.to === email);
  expect(messages).toHaveLength(1);
  const match = messages[0]?.text.match(/https?:\/\/\S+/);
  if (!match) {
    throw new Error("El correo de verificación no trae enlace");
  }
  return match[0];
}

describe("registro, verificación e ingreso", () => {
  it("registra sin verificar y escribe un único correo de verificación", async () => {
    const email = newEmail();
    await signUp(email);
    expect((await userRow(email)).email_verified).toBe(false);
    verificationUrl(email);
  });

  it("rechaza el ingreso sin verificar y no crea sesiones", async () => {
    const email = newEmail();
    await signUp(email);
    await expect(
      auth.api.signInEmail({ body: { email, password: PASSWORD } }),
    ).rejects.toMatchObject({
      body: { code: "EMAIL_NOT_VERIFIED" },
    });
    expect(await sessionCount((await userRow(email)).id)).toBe(0);
  });

  it("el enlace del outbox verifica la cuenta y luego el ingreso funciona", async () => {
    const email = newEmail();
    await signUp(email);
    const response = await auth.handler(new Request(verificationUrl(email)));
    expect(response.status).toBeLessThan(400);
    expect((await userRow(email)).email_verified).toBe(true);

    const result = await auth.api.signInEmail({ body: { email, password: PASSWORD } });
    expect(result.token).toBeTruthy();
  });
});

describe("roles", () => {
  it("asigna admin a los emails de ADMIN_EMAILS y user al resto", async () => {
    const adminEmail = "admin@cotimporta.test";
    await sql`delete from users where email = ${adminEmail}`;
    await signUp(adminEmail);
    expect((await userRow(adminEmail)).role).toBe("admin");

    const email = newEmail();
    await signUp(email);
    expect((await userRow(email)).role).toBe("user");
  });
});

describe("rate limit", () => {
  it("permite 10 golpes en la ventana y rechaza el 11.º", async () => {
    const key = `test:${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(await hit(key, 10, 60));
    }
    expect(results.slice(0, 10).every((result) => result.allowed)).toBe(true);
    const last = results[10];
    expect(last?.allowed).toBe(false);
    expect(last?.retryAfterSeconds).toBeGreaterThan(0);
  });
});
