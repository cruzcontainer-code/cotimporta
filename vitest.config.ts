import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Alias "@/" -> src/ (igual que tsconfig.json "paths"). Vitest no hereda los paths de tsconfig.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Las pruebas nunca comparten base con desarrollo: siempre cotimporta_test (docker-compose.yml).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://cotimporta:cotimporta@localhost:54329/cotimporta_test";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
  },
  test: {
    // Sin passWithNoTests: un gate de un solo archivo debe fallar si el archivo no existe.
    exclude: [
      "**/node_modules/**",
      "blueprints/**",
      "reference/**",
      ".next/**",
      ".data/**",
      "tests/e2e/**",
    ],
    // Cargador de entorno de Vitest: valores locales y falsos, nunca secretos reales.
    env: {
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_SECRET: "test-only-secret-not-for-production-0000000000",
      BETTER_AUTH_URL: "http://localhost:3000",
      ADMIN_EMAILS: "admin@cotimporta.test",
      EMAIL_DRIVER: "log",
      EMAIL_FROM: "Cotimporta <no-reply@cotimporta.test>",
      EMAIL_OUTBOX_DIR: ".data/test-outbox",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: ".data/test-storage",
      AI_DRIVER: "fake",
      AI_TIMEOUT_MS: "2000",
      PAYMENT_PROVIDER: "fake",
      FAKE_PAYMENT_WEBHOOK_SECRET: "test-only-fake-webhook-secret",
      CRON_SECRET: "test-only-cron-secret",
      LOG_LEVEL: "error",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
