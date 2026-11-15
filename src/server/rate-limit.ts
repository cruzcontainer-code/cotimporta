import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Ventana fija en Postgres con un único upsert atómico: si la ventana de la clave venció,
 * reinicia en 1; si no, suma 1. Golpes concurrentes se serializan en la fila de la clave.
 */
export async function hit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await db.execute<{ count: number; retry_after: number }>(sql`
    insert into rate_limit_buckets as b (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      window_start = case
        when b.window_start <= now() - make_interval(secs => ${windowSeconds}) then now()
        else b.window_start
      end,
      count = case
        when b.window_start <= now() - make_interval(secs => ${windowSeconds}) then 1
        else b.count + 1
      end
    returning
      count,
      greatest(
        0,
        ceil(extract(epoch from (window_start + make_interval(secs => ${windowSeconds}) - now())))
      )::int as retry_after
  `);
  const row = rows[0];
  if (!row) {
    throw new Error("rate-limit: el upsert no devolvió fila");
  }
  const count = Number(row.count);
  const allowed = count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Number(row.retry_after)),
  };
}

/** IP del cliente: primer valor de x-forwarded-for, luego x-real-ip; "unknown" si no hay. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) {
    return forwarded;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
