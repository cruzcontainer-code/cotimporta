import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { readOutbox } from "@/server/email";

const PASSWORD = "contraseña-de-prueba-123";

/**
 * Registra, verifica (token del outbox en memoria) e ingresa una cuenta nueva.
 * Devuelve el id del usuario y la cabecera `cookie` para llamar route handlers.
 */
export async function createVerifiedSession(
  prefix: string,
): Promise<{ userId: string; email: string; cookie: string }> {
  const email = `${prefix}-${randomUUID()}@cotimporta.test`;
  const signUp = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "Prueba" },
  });

  const message = readOutbox().findLast((entry) => entry.to === email);
  const link = message?.text.match(/https?:\/\/\S+/)?.[0];
  const token = link ? new URL(link).searchParams.get("token") : null;
  if (!token) {
    throw new Error(`createVerifiedSession: no hay enlace de verificación para ${email}`);
  }
  await auth.api.verifyEmail({ query: { token } });

  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
  if (!cookie) {
    throw new Error("createVerifiedSession: el ingreso no devolvió cookies de sesión");
  }
  return { userId: signUp.user.id, email, cookie };
}
