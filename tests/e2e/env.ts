// Constantes compartidas por playwright.config.ts, global-setup.ts y helpers.ts.
export const e2ePort = 3100;
export const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
export const e2eDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://cotimporta:cotimporta@localhost:54329/cotimporta_test";
export const e2eOutboxDir = ".data/e2e-outbox";
export const e2eStorageDir = ".data/e2e-storage";
