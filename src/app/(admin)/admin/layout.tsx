import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { type Copy, isLocale } from "@/i18n/messages";
import { requireUser } from "@/lib/auth";

const copy: Copy<{
  label: string;
  charges: string;
  settings: string;
  rules: string;
  back: string;
}> = {
  es: {
    label: "Administración",
    charges: "Gastos",
    settings: "Tasas y plan",
    rules: "Reglas",
    back: "Volver a la app",
  },
  en: {
    label: "Administration",
    charges: "Charges",
    settings: "Rates and plan",
    rules: "Rules",
    back: "Back to the app",
  },
};

/** Solo admins: cualquier otro usuario recibe 404, nunca 403. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (user.role !== "admin") {
    notFound();
  }
  const locale = await getLocale();
  const t = copy[isLocale(locale) ? locale : "es"];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <nav aria-label={t.label} className="flex flex-wrap gap-4">
          <Link href="/admin/charges" className="font-medium">
            {t.charges}
          </Link>
          <Link href="/admin/settings" className="font-medium">
            {t.settings}
          </Link>
          <Link href="/admin/rules" className="font-medium">
            {t.rules}
          </Link>
        </nav>
        <Link href="/app" className="text-sm">
          {t.back}
        </Link>
      </div>
      {children}
    </div>
  );
}
