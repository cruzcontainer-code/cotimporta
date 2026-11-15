import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit es una CLI independiente: Next.js no le carga .env. Este es su cargador.
// process.loadEnvFile no sobrescribe variables ya exportadas (CI exporta las suyas).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// Migraciones de producción usan la URL directa (sin pooler); local usa DATABASE_URL.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL no está definido (copia .env.example a .env)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  verbose: true,
});
