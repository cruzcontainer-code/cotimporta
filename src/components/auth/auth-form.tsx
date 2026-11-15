"use client";

import { createAuthClient } from "better-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { type ComponentProps, type FormEvent, useActionState, useEffect, useState } from "react";
import { type Copy, isLocale } from "@/i18n/messages";

export type AuthMode = "sign-in" | "sign-up" | "forgot" | "reset";
export type SignUpState = {
  error: "invalid" | "rateLimited" | "weakPassword" | null;
  done?: boolean;
};
// Misma lista que valida la server action de registro en (auth)/auth/[mode]/page.tsx.
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

const authClient = createAuthClient();

type FormCopy = {
  titles: Record<AuthMode, string>;
  name: string;
  email: string;
  password: string;
  country: string;
  countries: Record<(typeof COUNTRIES)[number], string>;
  submit: Record<AuthMode, string>;
  privacy: string;
  toSignUp: string;
  toSignIn: string;
  toForgot: string;
  errors: {
    badCredentials: string;
    notVerified: string;
    invalid: string;
    rateLimited: string;
    weakPassword: string;
    missingToken: string;
    generic: string;
  };
  forgotSent: string;
};

const copy: Copy<FormCopy> = {
  es: {
    titles: {
      "sign-in": "Iniciar sesión",
      "sign-up": "Crear cuenta",
      forgot: "Recuperar contraseña",
      reset: "Nueva contraseña",
    },
    name: "Nombre",
    email: "Correo electrónico",
    password: "Contraseña",
    country: "País",
    countries: {
      PE: "Perú",
      AR: "Argentina",
      BO: "Bolivia",
      BR: "Brasil",
      CL: "Chile",
      CN: "China",
      CO: "Colombia",
      EC: "Ecuador",
      ES: "España",
      MX: "México",
      US: "Estados Unidos",
      VE: "Venezuela",
      ZZ: "Otro",
    },
    submit: {
      "sign-in": "Ingresar",
      "sign-up": "Crear cuenta",
      forgot: "Enviar enlace",
      reset: "Guardar contraseña",
    },
    privacy: "Usamos tus datos solo para tus cotizaciones y tu cuenta (Ley N.° 29733).",
    toSignUp: "¿No tienes cuenta? Crea una",
    toSignIn: "¿Ya tienes cuenta? Ingresa",
    toForgot: "¿Olvidaste tu contraseña?",
    errors: {
      badCredentials: "Correo o contraseña incorrectos",
      notVerified: "Verifica tu correo antes de ingresar",
      invalid: "Revisa los datos del formulario",
      rateLimited: "Demasiados intentos. Espera un momento y vuelve a intentar.",
      weakPassword: "La contraseña debe tener al menos 10 caracteres",
      missingToken: "El enlace no es válido o ya venció",
      generic: "No pudimos completar la acción. Intenta de nuevo.",
    },
    forgotSent:
      "Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.",
  },
  en: {
    titles: {
      "sign-in": "Sign in",
      "sign-up": "Sign up",
      forgot: "Recover password",
      reset: "New password",
    },
    name: "Name",
    email: "Email",
    password: "Password",
    country: "Country",
    countries: {
      PE: "Peru",
      AR: "Argentina",
      BO: "Bolivia",
      BR: "Brazil",
      CL: "Chile",
      CN: "China",
      CO: "Colombia",
      EC: "Ecuador",
      ES: "Spain",
      MX: "Mexico",
      US: "United States",
      VE: "Venezuela",
      ZZ: "Other",
    },
    submit: {
      "sign-in": "Sign in",
      "sign-up": "Sign up",
      forgot: "Send link",
      reset: "Save password",
    },
    privacy: "We use your data only for your quotes and your account (Peru Law 29733).",
    toSignUp: "No account? Sign up",
    toSignIn: "Already have an account? Sign in",
    toForgot: "Forgot your password?",
    errors: {
      badCredentials: "Incorrect email or password",
      notVerified: "Verify your email before signing in",
      invalid: "Check the form fields",
      rateLimited: "Too many attempts. Wait a moment and try again.",
      weakPassword: "Password must be at least 10 characters",
      missingToken: "The link is invalid or has expired",
      generic: "We couldn't complete the action. Try again.",
    },
    forgotSent: "If the email is registered, we sent you a link to reset your password.",
  },
};

type Props = {
  mode: AuthMode;
  token?: string;
  signUpAction: (state: SignUpState, formData: FormData) => Promise<SignUpState>;
};

function Field({ id, label, ...input }: { id: string; label: string } & ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input id={id} name={id} className="input" {...input} />
    </div>
  );
}

export function AuthForm({ mode, token, signUpAction }: Props) {
  const locale = useLocale();
  const t = copy[isLocale(locale) ? locale : "es"];
  const router = useRouter();
  const [signUpState, formAction, signUpPending] = useActionState(signUpAction, { error: null });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Carga completa (no navegación de cliente): Next no anuncia la primera carga en su
  // role="alert", así "Revisa tu correo" aparece una sola vez en la página.
  useEffect(() => {
    if (signUpState.done) {
      window.location.assign("/auth/check-email");
    }
  }, [signUpState.done]);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          if (result.error.status === 429) setError(t.errors.rateLimited);
          else if (result.error.code === "EMAIL_NOT_VERIFIED") setError(t.errors.notVerified);
          else setError(t.errors.badCredentials);
          return;
        }
        router.push("/app");
        router.refresh();
      } else if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({ email, redirectTo: "/auth/reset" });
        if (result.error?.status === 429) setError(t.errors.rateLimited);
        else setNotice(t.forgotSent);
      } else if (mode === "reset") {
        if (!token) {
          setError(t.errors.missingToken);
          return;
        }
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) {
          setError(password.length < 10 ? t.errors.weakPassword : t.errors.missingToken);
          return;
        }
        router.push("/auth/sign-in");
      }
    } catch {
      setError(t.errors.generic);
    } finally {
      setPending(false);
    }
  }

  const shownError = mode === "sign-up" && signUpState.error ? t.errors[signUpState.error] : error;
  const busy = mode === "sign-up" ? signUpPending : pending;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">{t.titles[mode]}</h1>
      <form
        className="card flex flex-col gap-4"
        {...(mode === "sign-up" ? { action: formAction } : { onSubmit })}
        noValidate={false}
      >
        {mode === "sign-up" && <Field id="name" label={t.name} autoComplete="name" required />}
        {mode !== "reset" && (
          <Field id="email" label={t.email} type="email" autoComplete="email" required />
        )}
        {mode !== "forgot" && (
          <Field
            id="password"
            label={t.password}
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={mode === "sign-in" ? undefined : 10}
            required
          />
        )}
        {mode === "sign-up" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="country" className="text-sm font-medium">
              {t.country}
            </label>
            <select id="country" name="country" className="input" defaultValue="PE">
              {COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {t.countries[code]}
                </option>
              ))}
            </select>
          </div>
        )}
        {shownError && (
          <p role="alert" className="text-sm text-destructive">
            {shownError}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-success">
            {notice}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t.submit[mode]}
        </button>
        {mode === "sign-up" && <p className="text-xs text-fg-muted">{t.privacy}</p>}
      </form>
      <nav className="flex flex-col gap-2 text-sm">
        {mode === "sign-in" && <Link href="/auth/sign-up">{t.toSignUp}</Link>}
        {mode === "sign-in" && <Link href="/auth/forgot">{t.toForgot}</Link>}
        {mode !== "sign-in" && <Link href="/auth/sign-in">{t.toSignIn}</Link>}
      </nav>
    </div>
  );
}
