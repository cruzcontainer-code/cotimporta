export type Locale = "es" | "en";

export const locales: readonly Locale[] = ["es", "en"];

export const defaultLocale: Locale = "es";

export type Copy<T> = Record<Locale, T>;

export function isLocale(value: unknown): value is Locale {
  return value === "es" || value === "en";
}

export const messages: Copy<{
  common: { appName: string; signIn: string; signUp: string; disclaimer: string };
}> = {
  es: {
    common: {
      appName: "Cotimporta",
      signIn: "Iniciar sesión",
      signUp: "Crear cuenta",
      disclaimer: "Estimación referencial, no es una liquidación oficial de aduanas.",
    },
  },
  en: {
    common: {
      appName: "Cotimporta",
      signIn: "Sign in",
      signUp: "Sign up",
      disclaimer: "Reference estimate, not an official customs assessment.",
    },
  },
};
