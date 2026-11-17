import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkHealth } from "@/app/api/health/route";
import { GET as exportRoute } from "@/app/api/v1/account/export/route";
import { db } from "@/db/client";
import { seed } from "@/db/seed";
import { auth, createProfile } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { deleteAccount } from "@/server/account/service";
import type { Actor } from "@/server/authz";
import { signFakeEvent } from "@/server/billing/provider";
import { handleWebhook } from "@/server/billing/service";
import { uploadSupplierDocument } from "@/server/documents/service";
import type { AppError } from "@/server/errors";
import { getOrCreateQuotePdf } from "@/server/pdf/render";
import {
  calculateQuote,
  confirmHeading,
  createQuote,
  saveFx,
  saveItems,
  saveSupplierTerms,
  softDeleteQuote,
} from "@/server/quotes/service";
import { getStorage } from "@/server/storage";
import { createVerifiedSession } from "../helpers/session";

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
// La misma contraseña que usa tests/helpers/session.ts al registrar.
const PASSWORD = "contraseña-de-prueba-123";
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n");

beforeAll(async () => {
  await seed(db);
});

afterAll(async () => {
  await sql.end();
});

/** Cuenta con una cotización calculada (con PDF y ficha subida) y otra borrada lógicamente. */
async function populatedAccount() {
  const session = await createVerifiedSession("cuenta");
  const actor: Actor = { userId: session.userId, role: "user" };
  // El formulario de registro crea el perfil; auth.api.signUpEmail no.
  await createProfile(actor.userId, { locale: "es", country: "PE" });
  const quote = await createQuote(actor, { title: "Calculada", locale: "es" });
  await saveItems(actor, quote.id, [{ description: "Planta", quantity: 1, totalMinor: 1_200_000 }]);
  await confirmHeading(actor, quote.id, "8477300000");
  await saveSupplierTerms(actor, quote.id, {
    advanceBps: 3_000,
    balanceBps: 7_000,
    productionDaysMin: 30,
    productionDaysMax: 35,
    shippingCoordinationDays: 7,
    transitDaysMin: 30,
    transitDaysMax: 40,
  });
  await saveFx(actor, quote.id, { penPerUsdE4: 35_000, date: "2026-10-29", source: "SBS" });
  await calculateQuote(actor, quote.id);
  await uploadSupplierDocument(actor, quote.id, {
    name: "ficha.pdf",
    type: "application/pdf",
    bytes: PDF,
  });
  await getOrCreateQuotePdf(actor, quote.id, "es");

  // La cuenta gratuita permite una sola cotización: la segunda entra con un plan activo.
  const body = JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: "payment.succeeded",
    userId: actor.userId,
    planCode: "mensual",
    currency: "PEN",
    amountMinor: 4900,
    occurredAt: new Date().toISOString(),
    providerRef: `fake_${randomUUID()}`,
  });
  const paid = await handleWebhook(
    "fake",
    body,
    new Headers({ "x-fake-signature": signFakeEvent(body) }),
  );
  expect(paid.status).toBe(200);
  const removed = await createQuote(actor, { title: "Borrada", locale: "es" });
  await softDeleteQuote(actor, removed.id);
  return { session, actor, quoteId: quote.id, removedId: removed.id };
}

const exportOf = (cookie: string) =>
  exportRoute(new Request("http://localhost/api/v1/account/export", { headers: { cookie } }));

describe("exportar datos", () => {
  it("devuelve perfil, todas las cotizaciones con sus hijos y la lista de archivos", async () => {
    const { session, actor, quoteId, removedId } = await populatedAccount();
    const response = await exportOf(session.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="cotimporta-export.json"',
    );
    const data = await response.json();
    expect(data.profile.userId).toBe(actor.userId);
    expect(data.user.email).toBe(session.email);

    const ids = data.quotes.map((q: { id: string }) => q.id);
    expect(ids).toEqual(expect.arrayContaining([quoteId, removedId]));
    const removed = data.quotes.find((q: { id: string }) => q.id === removedId);
    expect(removed.deletedAt).not.toBeNull();
    const calculated = data.quotes.find((q: { id: string }) => q.id === quoteId);
    expect(calculated.lines).toHaveLength(1);
    expect(calculated.costLines.length).toBeGreaterThan(0);
    expect(calculated.stages).toHaveLength(6);
    expect(calculated.taxBreakdown.length).toBeGreaterThan(0);
    expect(calculated.supplierTerms).not.toBeNull();
    expect(calculated.supplierDocuments).toHaveLength(1);
    expect(calculated.generatedDocuments).toHaveLength(1);

    const prefix = `users/${actor.userId}/`;
    expect(data.files.length).toBeGreaterThanOrEqual(2);
    expect(data.files.every((key: string) => key.startsWith(prefix))).toBe(true);
    expect(data.subscription.status).toBe("active");

    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from data_export_requests
      where user_id = ${actor.userId} and status = 'ready'
    `;
    expect(row?.n).toBe(1);
  });

  it("sin sesión responde 401", async () => {
    expect((await exportOf("")).status).toBe(401);
  });
});

describe("borrar cuenta", () => {
  it("con un email distinto se rechaza y no borra nada", async () => {
    const { actor } = await populatedAccount();
    const error = await deleteAccount(actor, "otra@cotimporta.test").then(
      () => null,
      (caught: unknown) => caught,
    );
    expect((error as AppError).code).toBe("VALIDATION");
    const [user] = await sql`select id from users where id = ${actor.userId}`;
    expect(user).toBeDefined();
  });

  it("borra archivos y filas, conserva auditoría y pagos anónimos, y el reingreso falla", async () => {
    const { session, actor } = await populatedAccount();
    const prefix = `users/${actor.userId}/`;
    expect((await getStorage().list(prefix)).length).toBeGreaterThan(0);
    const [payments] = await sql<{ ids: string[] }[]>`
      select array_agg(id::text) as ids from payment_events where user_id = ${actor.userId}
    `;
    const paymentIds = payments?.ids ?? [];
    expect(paymentIds.length).toBe(1);
    const [audits] = await sql<{ ids: string[] | null }[]>`
      select array_agg(id::text) as ids from audit_events where actor_user_id = ${actor.userId}
    `;
    const auditIds = audits?.ids ?? [];

    await deleteAccount(actor, session.email.toUpperCase());

    expect(await getStorage().list(prefix)).toEqual([]);
    const tables = [
      "users",
      "sessions",
      "accounts",
      "profiles",
      "subscriptions",
      "usage_counters",
      "quotes",
      "quote_lines",
      "quote_cost_lines",
      "quote_stages",
      "quote_tax_breakdown",
      "supplier_documents",
      "document_images",
      "generated_documents",
      "data_export_requests",
      "ai_calls",
    ];
    for (const table of tables) {
      const column = table === "users" ? "id" : "user_id";
      const [row] = await sql<{ n: number }[]>`
        select count(*)::int as n from ${sql(table)} where ${sql(column)} = ${actor.userId}
      `;
      expect({ table, n: row?.n }).toEqual({ table, n: 0 });
    }
    const [verifications] = await sql<{ n: number }[]>`
      select count(*)::int as n from verifications where identifier = ${session.email}
    `;
    expect(verifications?.n).toBe(0);

    const kept = await sql<{ user_id: string | null; payload: Record<string, unknown> }[]>`
      select user_id, payload from payment_events where id = any(${paymentIds}::uuid[])
    `;
    expect(kept).toHaveLength(1);
    expect(kept[0]?.user_id).toBeNull();
    expect(kept[0]?.payload).toEqual({
      redacted: true,
      type: "payment.succeeded",
      amountMinor: 4900,
      currency: "PEN",
    });
    if (auditIds.length) {
      const audit = await sql<{ actor_user_id: string | null }[]>`
        select actor_user_id from audit_events where id = any(${auditIds}::uuid[])
      `;
      expect(audit).toHaveLength(auditIds.length);
      expect(audit.every((row) => row.actor_user_id === null)).toBe(true);
    }
    const { createHash } = await import("node:crypto");
    const userHash = createHash("sha256").update(actor.userId).digest("hex");
    const [deleted] = await sql<{ actor_user_id: string | null }[]>`
      select actor_user_id from audit_events
      where action = 'account.deleted' and metadata->>'userHash' = ${userHash}
    `;
    expect(deleted).toEqual({ actor_user_id: null });

    const signIn = await auth.api
      .signInEmail({ body: { email: session.email, password: PASSWORD } })
      .then(
        () => "ok",
        () => "rejected",
      );
    expect(signIn).toBe("rejected");
    expect((await exportOf(session.cookie)).status).toBe(401);
  });
});

describe("health", () => {
  it("con la base de pruebas migrada responde 200 ok", async () => {
    const health = await checkHealth(sql);
    expect(health).toEqual({
      status: 200,
      body: { ok: true, data: { db: "up", migrations: "current" } },
    });
  });

  it("con una base inalcanzable responde 503 ok:false", async () => {
    const unreachable = postgres("postgres://cotimporta:cotimporta@127.0.0.1:1/x", {
      connect_timeout: 1,
    });
    try {
      const health = await checkHealth(unreachable);
      expect(health.status).toBe(503);
      expect(health.body.ok).toBe(false);
    } finally {
      await unreachable.end({ timeout: 0 });
    }
  });
});
