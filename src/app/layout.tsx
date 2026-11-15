import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "Cotimporta" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  const locale = await getLocale();
  const hasLogo = existsSync(join(process.cwd(), "public/brand/logo.svg"));

  return (
    <html lang={locale} className={theme}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>
          <a
            href="#contenido"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
          >
            Saltar al contenido
          </a>
          <header className="border-b border-border">
            <div className="mx-auto flex max-w-page items-center px-4 py-4">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                {hasLogo ? (
                  // biome-ignore lint/performance/noImgElement: logo SVG reemplazable por el dueño
                  <img src="/brand/logo.svg" alt="Cotimporta" className="h-8 w-auto" />
                ) : (
                  "Cotimporta"
                )}
              </Link>
            </div>
          </header>
          <main id="contenido" className="mx-auto max-w-page px-4 py-12">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
