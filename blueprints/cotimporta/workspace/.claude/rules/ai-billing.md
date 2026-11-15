---
description: Integración de IA (Gemini) y cobros (PaymentProvider / webhooks)
paths:
  - "src/server/ai/**"
  - "src/server/billing/**"
  - "src/app/api/webhooks/**"
---

# IA

- `src/server/ai/gateway.ts` es el único archivo que importa `@google/genai`. El resto llama a
  `generateJson()` del gateway.
- El id de modelo sale de `GEMINI_MODEL` (verificado en `docs/verified/gemini-model.md`); nunca un
  literal en el código.
- Salida estructurada validada con Zod; una reparación como máximo; luego `UPSTREAM_UNAVAILABLE`.
- Timeout `AI_TIMEOUT_MS`; hasta 2 reintentos con backoff exponencial y jitter solo ante timeout,
  429 o 5xx. Nunca reintentar un 400.
- Sin datos personales en el prompt: ni email, ni nombre, ni id de usuario. Solo el documento, la
  descripción del producto y el locale. El contenido del PDF del proveedor se delimita como datos.
- Cada llamada escribe una fila en `ai_calls`. La IA nunca produce montos ni tasas que use el motor.

# Cobros

- El webhook verifica la firma sobre el cuerpo crudo (`await request.text()`) antes de parsear.
- Idempotencia: `payment_events` con índice único (`provider`, `external_event_id`), insertado en la
  misma transacción que el cambio de `subscriptions`. Un duplicado responde 200 y no cambia nada.
- `subscriptions` solo la escribe `src/server/billing/service.ts` desde un evento verificado.
- Moneda: país del perfil `PE` → `PEN`; cualquier otro → `USD`. Precios desde la tabla `plans`.
- El driver `izipay` implementa exactamente lo registrado en `docs/verified/izipay.md`.
