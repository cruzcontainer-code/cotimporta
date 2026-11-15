import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Compuerta de hechos externos: cada docs/verified/*.md abre con un front matter de líneas
// "clave: valor" entre dos "---". Parser propio (sin dependencias) + Zod.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const yesNo = z.enum(["yes", "no"]);
const filled = z.string().trim().min(1);

function frontMatter(file: string): Record<string, string> {
  const lines = readFileSync(join("docs", "verified", file), "utf8").split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error(`${file}: la primera línea debe ser ---`);
  }
  const end = lines.indexOf("---", 1);
  if (end < 0) {
    throw new Error(`${file}: falta el --- de cierre`);
  }
  const data: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match?.[1]) {
      throw new Error(`${file}: línea inválida en el front matter: ${line}`);
    }
    data[match[1]] = (match[2] ?? "").trim();
  }
  return data;
}

const common = z.object({
  topic: filled,
  status: z.enum(["verified", "deferred"]),
  checked_on: z.string().regex(ISO_DATE),
  source_url: z.string().regex(/^https:\/\//),
});

const deferred = z.object({
  next_action: filled,
  owner_ack: z.string().regex(ISO_DATE),
});

const verifiedByTopic = {
  "gemini-model": z.object({
    model_id: filled,
    supports_pdf_input: z.literal("yes"),
    supports_json_schema: z.literal("yes"),
    decision: filled,
  }),
  izipay: z.object({
    recurring_supported: yesNo,
    usd_supported: yesNo,
    ipn_signature: filled,
    integration: z.literal("hosted_redirect"),
    mode: z.enum(["recurring", "manual_renewal"]),
    decision: filled,
  }),
  "tariff-source": z.object({
    machine_readable: yesNo,
    format: z.enum(["csv", "xlsx", "html", "pdf", "none"]),
    fallback: z.literal("csv_upload"),
    decision: filled,
  }),
} as const;

const FILES = {
  "gemini-model.md": "gemini-model",
  "izipay.md": "izipay",
  "tariff-source.md": "tariff-source",
} as const;

describe.each(Object.entries(FILES))("docs/verified/%s", (file, topic) => {
  const data = frontMatter(file);

  it("tiene topic, status, checked_on y source_url válidos", () => {
    const parsed = common.parse(data);
    expect(parsed.topic).toBe(topic);
  });

  it("verified exige las claves del topic; deferred exige next_action y owner_ack", () => {
    const { status } = common.parse(data);
    if (status === "verified") {
      verifiedByTopic[topic].parse(data);
    } else {
      deferred.parse(data);
    }
  });

  it("izipay sin recurrencia usa manual_renewal", () => {
    if (topic === "izipay" && data.status === "verified" && data.recurring_supported === "no") {
      expect(data.mode).toBe("manual_renewal");
    }
  });
});

describe("parser y reglas de la compuerta", () => {
  it("rechaza un status distinto de verified|deferred", () => {
    expect(() =>
      common.parse({
        topic: "x",
        status: "pending",
        checked_on: "2026-11-15",
        source_url: "https://x",
      }),
    ).toThrow();
  });

  it("deferred sin owner_ack falla", () => {
    expect(() => deferred.parse({ next_action: "Pedir acceso" })).toThrow();
  });

  it("source_url sin https falla", () => {
    expect(() =>
      common.parse({
        topic: "x",
        status: "verified",
        checked_on: "2026-11-15",
        source_url: "http://x",
      }),
    ).toThrow();
  });
});
