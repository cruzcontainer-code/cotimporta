---
description: Convenciones de pruebas (Vitest y Playwright)
paths:
  - "tests/**"
  - "vitest.config.ts"
  - "playwright.config.ts"
---

# Pruebas

- Unitarias: `tests/unit/**/*.test.ts` (sin base de datos). Integración: `tests/integration/**/*.test.ts`
  (base `cotimporta_test`, migrada por `tests/setup/integration.ts`, archivos en serie).
  E2E: `tests/e2e/*.spec.ts` (Playwright levanta el build de producción en el puerto 3100).
- Nunca se trunca ni se comparte estado: cada prueba crea sus propios usuarios con email único
  (`uniqueEmail()` en E2E; `crypto.randomUUID()` en integración).
- Tablas globales de reglas (`tax_rates`, `tariff_headings`, `tariff_rates`, `trade_agreements`,
  `perception_rules`, `default_local_charges`): una prueba que escribe en ellas usa valores únicos por
  corrida — partidas `"99"` + 8 dígitos aleatorios, `concept_code` `test_<uuid>`, fechas
  `effective_from`/`valid_from` únicas con año ≥ 2099, `source_url` `https://` —, nunca escribe filas de
  `kind` `igv` o `ipm`, nunca filas de la partida `8477300000` y nunca actualiza filas del seed
  (`source_url='seed://demo'`). `tests/setup/integration.ts` borra antes de cada archivo toda fila de
  reglas que no sea del seed y todas las corridas de importación.
- Drivers de prueba: `EMAIL_DRIVER=log`, `STORAGE_DRIVER=local`, `AI_DRIVER=fake`,
  `PAYMENT_PROVIDER=fake`. Ninguna prueba sale a la red.
- Sesiones en integración: `createVerifiedSession()` de `tests/helpers/session.ts` (desde el paso 13).
- Prohibido `.skip` y `.only`. Un `verify` en rojo se arregla en el código, no en la prueba.
- Los números golden del motor salen de `reference/cotizacion-bg880-ejemplo.pdf` y del blueprint §9
  paso 7; se comparan como enteros exactos.
