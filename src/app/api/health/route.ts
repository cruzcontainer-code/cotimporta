import postgres, { type Sql } from "postgres";
import { getEnv } from "@/lib/env";
import journal from "../../../../drizzle/meta/_journal.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 2_000;

type Health =
  | { status: 200; body: { ok: true; data: { db: "up"; migrations: "current" } } }
  | { status: 503; body: { ok: false; error: { code: "UPSTREAM_UNAVAILABLE"; message: string } } };

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
  ]);
}

const down = (message: string): Health => ({
  status: 503,
  body: { ok: false, error: { code: "UPSTREAM_UNAVAILABLE", message } },
});

/** Base alcanzable (select 1, 2 s) y migraciones aplicadas = entradas del journal de drizzle. */
export async function checkHealth(sql: Sql): Promise<Health> {
  try {
    await withTimeout(sql`select 1`);
  } catch {
    return down("La base de datos no responde");
  }
  try {
    const [row] = await withTimeout(
      sql<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    if ((row?.n ?? 0) !== journal.entries.length) return down("Migraciones pendientes");
  } catch {
    return down("Migraciones pendientes");
  }
  return { status: 200, body: { ok: true, data: { db: "up", migrations: "current" } } };
}

let client: Sql | undefined;

export async function GET(): Promise<Response> {
  client ??= postgres(getEnv().DATABASE_URL, { max: 1, connect_timeout: 2, prepare: false });
  const health = await checkHealth(client);
  return Response.json(health.body, {
    status: health.status,
    headers: { "Cache-Control": "no-store" },
  });
}
