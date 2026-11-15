import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "@/lib/env";

export type EmailMessage = { to: string; subject: string; text: string; html: string };
export type OutboxEntry = EmailMessage & { createdAt: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

// Driver "log": guarda cada correo en memoria y, si hay EMAIL_OUTBOX_DIR, como
// <dir>/<epoch-ms>-<aleatorio>.json (contrato de tests/e2e/helpers.ts).
const outbox: OutboxEntry[] = [];

const logProvider: EmailProvider = {
  async send(message) {
    const entry: OutboxEntry = { ...message, createdAt: new Date().toISOString() };
    outbox.push(entry);
    const dir = getEnv().EMAIL_OUTBOX_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}.json`);
      writeFileSync(file, JSON.stringify(entry, null, 2));
    }
  },
};

export function getEmailProvider(): EmailProvider {
  const driver = getEnv().EMAIL_DRIVER ?? "log";
  switch (driver) {
    case "log":
      return logProvider;
  }
}

/** Correos enviados por el driver "log" en este proceso (más antiguo primero). */
export function readOutbox(): readonly OutboxEntry[] {
  return [...outbox];
}

export function clearOutbox(): void {
  outbox.length = 0;
}
