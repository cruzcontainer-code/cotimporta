import type { Bps, Minor } from "@/lib/engine/types";

function assertSafe(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} debe ser un entero seguro (recibido ${value})`);
  }
}

/** División entera con redondeo mitad hacia arriba, para a ≥ 0 y b > 0. */
export function roundDiv(a: number, b: number): number {
  assertSafe(a, "a");
  assertSafe(b, "b");
  if (a < 0 || b <= 0) {
    throw new RangeError(`roundDiv requiere a ≥ 0 y b > 0 (a=${a}, b=${b})`);
  }
  const numerator = 2 * a + b;
  assertSafe(numerator, "2a + b");
  return Math.floor(numerator / (2 * b));
}

export function applyBps(base: Minor, bps: Bps): Minor {
  return roundDiv(base * bps, 10_000);
}

/** USD (centavos) → PEN (céntimos) con TC = PEN por USD × 10 000. */
export function toPen(usdMinor: Minor, penPerUsdE4: number): Minor {
  return roundDiv(usdMinor * penPerUsdE4, 10_000);
}

/** PEN (céntimos) → USD (centavos) con TC = PEN por USD × 10 000. */
export function toUsd(penMinor: Minor, penPerUsdE4: number): Minor {
  return roundDiv(penMinor * 10_000, penPerUsdE4);
}

/** 1733230 → "17,332.30" (aritmética entera, sin Intl). */
export function formatMinor(value: Minor): string {
  assertSafe(value, "value");
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const units = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}.${String(cents).padStart(2, "0")}`;
}

export function formatUsd(value: Minor): string {
  return value < 0 ? `-$${formatMinor(-value)}` : `$${formatMinor(value)}`;
}

export function formatPen(value: Minor): string {
  return value < 0 ? `-S/ ${formatMinor(-value)}` : `S/ ${formatMinor(value)}`;
}
