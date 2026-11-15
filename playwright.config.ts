import { defineConfig, devices } from "@playwright/test";
import { e2eBaseUrl, e2eDatabaseUrl, e2eOutboxDir, e2ePort, e2eStorageDir } from "./tests/e2e/env";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/blueprints/**", "**/reference/**"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `pnpm exec` en vez de ./node_modules/.bin/next: cmd.exe (Windows) no ejecuta rutas "./".
    command: `pnpm build && pnpm exec next start --port ${e2ePort}`,
    url: `${e2eBaseUrl}/`,
    reuseExistingServer: false,
    timeout: 300_000,
    // Se suma a process.env y a .env (Next no sobrescribe variables ya definidas).
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      BETTER_AUTH_URL: e2eBaseUrl,
      EMAIL_DRIVER: "log",
      EMAIL_OUTBOX_DIR: e2eOutboxDir,
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: e2eStorageDir,
      AI_DRIVER: "fake",
      PAYMENT_PROVIDER: "fake",
    },
  },
});
