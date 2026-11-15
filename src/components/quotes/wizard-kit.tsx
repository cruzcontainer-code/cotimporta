"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { cloneElement, type ReactElement, useId, useState, useTransition } from "react";
import { type Copy, isLocale, type Locale } from "@/i18n/messages";
import type { CostLine } from "@/lib/engine/types";

// Tipos y utilidades compartidos por los pasos del asistente (sin importar src/server ni src/app).

export type Res<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
export type Product = {
  title: string;
  productDescription: string;
  clientName: string;
  originCountry: string | null;
  hasOriginCertificate: boolean;
  importerCondition: string;
  dutiableUnits: number;
};
export type Item = { description: string; quantity: number; totalMinor: number };
export type Line = Omit<CostLine, "id">;
export type Terms = {
  advanceBps: number;
  balanceBps: number;
  productionDaysMin: number;
  productionDaysMax: number;
  shippingCoordinationDays: number;
  transitDaysMin: number;
  transitDaysMax: number;
};
export type Fx = { penPerUsdE4: number; date: string; source: string };
export type Heading = { code: string; descriptionEs: string; descriptionEn: string };
export type WizardActions = {
  updateProduct: (id: string, input: Product) => Promise<Res>;
  saveItems: (id: string, input: Item[]) => Promise<Res>;
  searchHeadings: (query: string) => Promise<Res<Heading[]>>;
  suggestHeadings: (id: string) => Promise<Res<Heading[]>>;
  confirmHeading: (id: string, code: string) => Promise<Res>;
  saveCostLines: (id: string, input: Line[]) => Promise<Res>;
  saveSupplierTerms: (id: string, input: Terms) => Promise<Res>;
  saveFx: (id: string, input: Fx) => Promise<Res>;
  calculate: (id: string) => Promise<Res>;
};

/** "12000.5" → 1200050 con `scale` decimales; null si no es un número válido. */
export function toInt(text: string, scale: number): number | null {
  const match = text.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > scale) return null;
  const value = Number(match[1]) * 10 ** scale + Number((match[2] ?? "").padEnd(scale, "0") || 0);
  return Number.isSafeInteger(value) ? value : null;
}

/** 1200050 → "12000.50" (aritmética entera). */
export function fromInt(value: number, scale: number): string {
  const unit = 10 ** scale;
  return `${Math.floor(value / unit)}.${String(value % unit).padStart(scale, "0")}`;
}

const common = {
  es: {
    remove: "Quitar",
    aiDown: "La IA no está disponible; continúa manualmente",
    invalidNumber: "Revisa los montos: usa números con punto decimal",
  },
  en: {
    remove: "Remove",
    aiDown: "AI is unavailable; continue manually",
    invalidNumber: "Check the amounts: use numbers with a decimal point",
  },
} satisfies Copy<Record<string, string>>;

/** Locale actual y textos del paso (más los comunes). */
export function useCopy<T>(copy: Copy<T>): { locale: Locale; t: T & (typeof common)["es"] } {
  const value = useLocale();
  const locale: Locale = isLocale(value) ? value : "es";
  return { locale, t: { ...common[locale], ...copy[locale] } };
}

/**
 * Corre actions en orden; se detiene en el primer error (lo muestra en role="alert")
 * y, si todas salen bien, navega al paso siguiente.
 */
export function useWizardRun(quoteId: string) {
  const router = useRouter();
  const { t } = useCopy({ es: {}, en: {} });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(steps: (() => Promise<Res>)[], next?: string) {
    setError(null);
    startTransition(async () => {
      for (const action of steps) {
        const result = await action();
        if (!result.ok) {
          setError(result.error.code === "UPSTREAM_UNAVAILABLE" ? t.aiDown : result.error.message);
          return;
        }
      }
      if (next) router.push(`/app/quotes/${quoteId}?paso=${next}`);
      router.refresh();
    });
  }

  return { pending, error, setError, run, startTransition };
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}

export function ErrorAlert({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}
