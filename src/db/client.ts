import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { getEnv } from "@/lib/env";

export type Db = PostgresJsDatabase<typeof schema>;

let instance: Db | undefined;

// Perezoso: importar este módulo no lee el entorno ni abre conexiones (el build no necesita base).
function getDb(): Db {
  instance ??= drizzle(postgres(getEnv().DATABASE_URL, { max: 5, prepare: false }), { schema });
  return instance;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
