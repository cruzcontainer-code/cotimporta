---
description: Motor de cálculo puro de la cotización
paths:
  - "src/lib/engine/**"
  - "tests/unit/engine/**"
---

# Motor de cálculo

- Puro: sin I/O, sin `fetch`, sin `node:*`, sin importar `@/server` ni `@/db`. Entrada → salida.
- Ninguna tasa literal en el código: IGV, IPM, derechos, percepción y tasa de despacho llegan en `EngineInput`.
- Solo enteros. Montos en centavos de USD; tasas en bps; TC en PEN×10 000; factor en ppm.
- Redondeo único `roundDiv(a, b)` = mitad hacia arriba para enteros ≥ 0 (`Math.floor((2a + b) / (2b))`),
  con `Number.isSafeInteger` verificado. Cada línea tributaria se redondea por separado y el total es
  la suma de líneas redondeadas.
- IGV/IPM por línea: base DUA (CIF + derechos con `inIgvBase`) y, aparte, cada línea local con
  `igvApplicable=true` e `inCif=false`. Nunca un 18 % plano sobre la suma.
- Líneas en PEN se convierten a USD una sola vez al entrar al motor con el TC de la cotización.
  La conversión final USD→PEN usa el mismo TC, una vez por cifra mostrada.
- Etapa 3 = FOB − etapa 1 (sin redondear dos veces). La suma de las 6 etapas siempre es el total.
- Cada línea tributaria lleva su regla (`table`, `id`, `effectiveFrom`, `sourceUrl`) y, si se
  exonera, el motivo. El resultado incluye el snapshot de todas las reglas usadas.
- Las pruebas golden (`tests/unit/engine/golden.test.ts`) son el contrato; no se ajustan para pasar.
