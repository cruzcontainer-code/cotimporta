import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { getEnv, requireEnv } from "@/lib/env";
import type { Actor } from "@/server/authz";
import { getEmailProvider } from "@/server/email";
import { AppError } from "@/server/errors";

const DAY = 60 * 60 * 24;

/** Perfil inicial del registro: moneda PEN si el país es PE, si no USD. Idempotente. */
export async function createProfile(
  userId: string,
  input: { locale: "es" | "en"; country: string },
): Promise<void> {
  await db
    .insert(schema.profiles)
    .values({
      userId,
      locale: input.locale,
      country: input.country,
      currency: input.country === "PE" ? "PEN" : "USD",
    })
    .onConflictDoNothing();
}

function adminEmails(): Set<string> {
  return new Set(
    (getEnv().ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

async function sendLinkEmail(
  to: string,
  subject: string,
  intro: string,
  url: string,
): Promise<void> {
  await getEmailProvider().send({
    to,
    subject,
    text: `${intro}\n\n${url}\n\nSi no fuiste tú, ignora este correo.`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>Si no fuiste tú, ignora este correo.</p>`,
  });
}

export const auth = betterAuth({
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: requireEnv("BETTER_AUTH_URL"),
  database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendLinkEmail(
        user.email,
        "Restablece tu contraseña — Cotimporta",
        "Usa este enlace para crear una nueva contraseña. Vence en 1 hora.",
        url,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: DAY,
    sendVerificationEmail: async ({ user, url }) => {
      await sendLinkEmail(
        user.email,
        "Verifica tu correo — Cotimporta",
        "Confirma tu correo para activar tu cuenta. El enlace vence en 24 horas.",
        url,
      );
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const role = adminEmails().has(user.email.toLowerCase()) ? "admin" : "user";
          return { data: { ...user, role } };
        },
      },
    },
  },
  session: {
    expiresIn: 7 * DAY,
    updateAge: DAY,
  },
  // Los límites los aplica src/server/rate-limit.ts en la ruta /api/auth.
  rateLimit: { enabled: false },
  plugins: [nextCookies()],
});

export type Role = "user" | "admin";
export type SessionUser = { id: string; email: string; name: string; role: Role };

export type { Actor };

/** Usuario de la sesión actual, o null. */
export async function getSessionUser(requestHeaders?: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders ?? (await nextHeaders()) });
  if (!session) {
    return null;
  }
  const { id, email, name } = session.user;
  const role: Role = (session.user as { role?: string }).role === "admin" ? "admin" : "user";
  return { id, email, name, role };
}

/** Para páginas: sin sesión redirige a /auth/sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/auth/sign-in");
  }
  return user;
}

/** Para actions y route handlers: sin sesión lanza UNAUTHENTICATED. */
export async function requireActor(requestHeaders?: Headers): Promise<Actor> {
  const user = await getSessionUser(requestHeaders);
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Debes iniciar sesión");
  }
  return { userId: user.id, role: user.role };
}
