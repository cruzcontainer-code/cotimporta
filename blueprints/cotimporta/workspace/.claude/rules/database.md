---
description: Esquema, migraciones y seed de Postgres (Drizzle)
paths:
  - "src/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
---

# Base de datos

- `src/db/schema.ts` es la única definición de tablas. Cambiarlo → `pnpm db:generate` → `pnpm db:migrate`.
- `src/db/schema.ts` y `src/db/seed*.ts` importan solo paquetes y archivos relativos con extensión
  `.ts` (`./schema.ts`). Nunca `@/…`: `pnpm db:seed` los ejecuta Node 24 sin bundler, que resuelve
  rutas literalmente. `schema.ts` no importa nada interno.
- Sintaxis TypeScript borrable solamente (`erasableSyntaxOnly`): sin `enum`, sin `namespace`, sin
  parámetros-propiedad. Importaciones de tipos con `import type` (`verbatimModuleSyntax`).
- Nunca editar ni renombrar a mano un archivo de `drizzle/`; la migración la nombra `drizzle-kit`.
  Se describe como "la migración que emite `pnpm db:generate`".
- Dinero: `bigint` modo `number`, unidades menores (centavos). Tasas: `integer` en puntos básicos
  (1 bps = 0,01 %). Tipo de cambio: `integer` PEN por USD × 10 000.
- Fechas-hora: `timestamp with time zone` (UTC). Vigencias de reglas: `date` (`effective_from`
  inclusivo, `effective_to` exclusivo, nulo = vigente).
- Toda fila de usuario lleva `user_id` con índice. `quotes` se borra lógicamente (`deleted_at`);
  el resto de hijas se borra en cascada al borrar la cuenta.
- El seed es idempotente: `insert … on conflict do nothing` sobre claves naturales únicas.
- Migraciones de producción: expandir → desplegar → contraer. Nunca borrar o renombrar una columna
  en el mismo despliegue que deja de usarla.
