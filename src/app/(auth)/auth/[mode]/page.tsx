import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { AuthForm, type AuthMode, type SignUpState } from "@/components/auth/auth-form";
import { type Copy, isLocale } from "@/i18n/messages";
import { auth, createProfile, getSessionUser } from "@/lib/auth";
import { clientIp, hit } from "@/server/rate-limit";

const MODES = ["sign-in", "sign-up", "forgot", "reset", "check-email"] as const;
type Mode = (typeof MODES)[number];

const COUNTRIES = [
  "PE",
  "AR",
  "BO",
  "BR",
  "CL",
  "CN",
  "CO",
  "EC",
  "ES",
  "MX",
  "US",
  "VE",
  "ZZ",
] as const;

const signUpSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  password: z.string().min(10).max(128),
  country: z.enum(COUNTRIES),
});

async function signUp(_state: SignUpState, formData: FormData): Promise<SignUpState> {
  "use server";
  const requestHeaders = await headers();
  const limit = await hit(`auth:${clientIp(requestHeaders)}:sign-up`, 5, 3600);
  if (!limit.allowed) {
    return { error: "rateLimited" };
  }
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return { error: passwordIssue ? "weakPassword" : "invalid" };
  }
  const { name, email, password, country } = parsed.data;
  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password, callbackURL: "/app" },
      headers: requestHeaders,
    });
    await createProfile(result.user.id, {
      locale: isLocale(cookieLocale) ? cookieLocale : "es",
      country,
    });
  } catch {
    // Email ya registrado u otro fallo: misma respuesta, no se revela si la cuenta existe.
  }
  // El formulario navega a /auth/check-email con una carga completa (ver auth-form.tsx).
  return { error: null, done: true };
}

const checkEmailCopy: Copy<{ title: string; body: string; back: string }> = {
  es: {
    title: "Revisa tu correo",
    body: "Si los datos son correctos, te enviamos un enlace para verificar tu cuenta. Vence en 24 horas.",
    back: "Volver a iniciar sesión",
  },
  en: {
    title: "Check your email",
    body: "If the details are correct, we sent you a link to verify your account. It expires in 24 hours.",
    back: "Back to sign in",
  },
};

type Props = {
  params: Promise<{ mode: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function AuthPage({ params, searchParams }: Props) {
  const { mode: rawMode } = await params;
  if (!(MODES as readonly string[]).includes(rawMode)) {
    notFound();
  }
  const mode = rawMode as Mode;
  if (await getSessionUser()) {
    redirect("/app");
  }

  if (mode === "check-email") {
    const locale = await getLocale();
    const t = checkEmailCopy[isLocale(locale) ? locale : "es"];
    return (
      <section className="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-fg-muted">{t.body}</p>
        <Link href="/auth/sign-in" className="text-sm">
          {t.back}
        </Link>
      </section>
    );
  }

  const { token } = await searchParams;
  return (
    <AuthForm
      mode={mode satisfies AuthMode}
      token={typeof token === "string" ? token : undefined}
      signUpAction={signUp}
    />
  );
}
