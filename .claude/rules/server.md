---
description: Servicios, server actions y route handlers
paths:
  - "src/server/**"
  - "src/app/api/**"
  - "src/app/**/actions.ts"
---

# Servidor

- Transporte delgado: la server action o el route handler valida con Zod, obtiene el actor con
  `requireActor()` y llama a una función de `src/server/**`. La lógica nunca vive en el handler.
- Toda consulta a filas de usuario pasa por `src/server/authz.ts`: `ownedQuoteOrThrow(tx, actor, id)`
  filtra por `user_id` y `deleted_at is null`. Recurso ajeno o inexistente = `NOT_FOUND` (404).
- Admin: `requireAdmin(actor)`; un no-admin recibe `NOT_FOUND`, no 403.
- Errores tipados de `src/server/errors.ts`: `VALIDATION` 422, `UNAUTHENTICATED` 401,
  `NOT_FOUND` 404, `QUOTA_EXCEEDED` 402, `RATE_LIMITED` 429, `CONFLICT` 409,
  `INVALID_SIGNATURE` 400, `UPSTREAM_UNAVAILABLE` 503, `INTERNAL` 500.
- Respuesta JSON única: `{ "ok": true, "data": … }` o
  `{ "ok": false, "error": { "code", "message", "requestId" } }`.
- Escrituras que cambian cuota, dinero o reglas: dentro de `db.transaction`, con `select … for update`
  sobre el contador o la fila afectada.
- `logger` escribe JSON por línea con `requestId`; redacta claves que coincidan con
  `/password|token|secret|key|authorization|cookie/i` como `[REDACTED]`.
- Límites (`src/server/rate-limit.ts`, Postgres): ingreso 10/min por IP; registro 5/h por IP;
  otros POST de `/api/auth` 30/min por IP; IA 20/h por usuario; nuevas cotizaciones 30/h por usuario;
  exportación 5/día por usuario.
- `process.env` solo se lee en `src/lib/env.ts`.
