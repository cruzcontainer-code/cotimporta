---
name: add-migration
description: Cambia el esquema de Postgres de Cotimporta y genera/aplica la migración con Drizzle. Úsalo cuando haya que agregar o modificar una tabla, columna, índice o enum en src/db/schema.ts, o cuando digan "nueva columna", "nueva tabla", "migración".
---

# Agregar una migración

## Cuándo usarlo
- Hay que cambiar `src/db/schema.ts` (tabla, columna, índice, enum).
- Un test de integración falla por una columna que no existe.

## Pasos
1. `pnpm db:up` (Postgres local con healthcheck).
2. Edita solo `src/db/schema.ts`. Importaciones: paquetes o relativas con `.ts`; nunca `@/`.
3. Si es producción-sensible, expande primero (columna nullable o con default); contrae en otro despliegue.
4. `pnpm db:generate` — revisa la migración que emite en `drizzle/` (nombre elegido por drizzle-kit).
5. `pnpm db:migrate` contra la base de desarrollo.
6. Corre la prueba que cubre la tabla.

## Verify
```bash
pnpm db:migrate                                     # expect: exit 0
pnpm test tests/integration/db.test.ts              # expect: exit 0 — toda tabla del esquema existe
n=$(ls drizzle/*.sql | wc -l); pnpm db:generate; test "$(ls drizzle/*.sql | wc -l)" -eq "$n"
                                                    # expect: exit 0 — no hay deriva entre esquema y migraciones
```

## No hagas
- Editar, renombrar o borrar a mano un archivo de `drizzle/`.
- Borrar o renombrar una columna en el mismo despliegue que deja de usarla.
- Usar `pnpm exec drizzle-kit push`: este proyecto solo migra con archivos versionados.
