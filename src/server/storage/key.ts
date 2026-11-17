import { isAbsolute } from "node:path";
import { AppError } from "@/server/errors";

/** Clave válida: relativa, con "/" y sin segmentos "..", "." ni vacíos. */
export function assertKey(key: string): void {
  const segments = key.split("/");
  const unsafe =
    key.length === 0 ||
    key.length > 512 ||
    isAbsolute(key) ||
    /^[a-zA-Z]:/.test(key) ||
    key.includes("\\") ||
    key.includes("\0") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..");
  if (unsafe) {
    throw new AppError("VALIDATION", "Clave de almacenamiento inválida");
  }
}
