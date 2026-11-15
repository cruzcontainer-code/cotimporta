import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { type Copy, isLocale } from "@/i18n/messages";
import { auth, requireUser } from "@/lib/auth";

const ONE_YEAR = 60 * 60 * 24 * 365;

async function setLocale(formData: FormData): Promise<void> {
  "use server";
  const value = formData.get("locale");
  if (isLocale(value)) {
    (await cookies()).set("NEXT_LOCALE", value, { maxAge: ONE_YEAR, path: "/", sameSite: "lax" });
    revalidatePath("/", "layout");
  }
}

async function setTheme(formData: FormData): Promise<void> {
  "use server";
  const value = formData.get("theme");
  if (value === "light" || value === "dark") {
    (await cookies()).set("theme", value, { maxAge: ONE_YEAR, path: "/", sameSite: "lax" });
    revalidatePath("/", "layout");
  }
}

async function signOut(): Promise<void> {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

type ShellCopy = {
  nav: { quotes: string; billing: string; settings: string; admin: string };
  language: string;
  theme: string;
  light: string;
  dark: string;
  signOut: string;
};

const copy: Copy<ShellCopy> = {
  es: {
    nav: { quotes: "Cotizaciones", billing: "Plan", settings: "Ajustes", admin: "Admin" },
    language: "Idioma",
    theme: "Tema",
    light: "Claro",
    dark: "Oscuro",
    signOut: "Salir",
  },
  en: {
    nav: { quotes: "Quotes", billing: "Plan", settings: "Settings", admin: "Admin" },
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    signOut: "Sign out",
  },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];
  const links = [
    { href: "/app/quotes", label: t.nav.quotes },
    { href: "/app/billing", label: t.nav.billing },
    { href: "/app/settings", label: t.nav.settings },
    ...(user.role === "admin" ? [{ href: "/admin/charges", label: t.nav.admin }] : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <nav aria-label="Principal" className="flex flex-wrap gap-4">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="font-medium">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <form action={setLocale} className="flex items-center gap-1">
            <span className="text-fg-muted">{t.language}:</span>
            <button
              type="submit"
              name="locale"
              value="es"
              className="btn btn-ghost"
              aria-pressed={locale === "es"}
            >
              ES
            </button>
            <button
              type="submit"
              name="locale"
              value="en"
              className="btn btn-ghost"
              aria-pressed={locale === "en"}
            >
              EN
            </button>
          </form>
          <form action={setTheme} className="flex items-center gap-1">
            <span className="text-fg-muted">{t.theme}:</span>
            <button type="submit" name="theme" value="light" className="btn btn-ghost">
              {t.light}
            </button>
            <button type="submit" name="theme" value="dark" className="btn btn-ghost">
              {t.dark}
            </button>
          </form>
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost">
              {t.signOut}
            </button>
          </form>
        </div>
      </div>
      {children}
    </div>
  );
}
