---
topic: tax-rates
status: verified
checked_on: 2026-11-16
source_url: https://busquedas.elperuano.pe/dispositivo/EX/2410141-1
decision: IGV 15,5 % + IPM 2,5 % en 2026 (Ley 32387, luego 0,5 puntos por año hasta IGV 14 % + IPM 4 % en 2029); UIT 2026 S/ 5 500; percepción 3,5 / 5 / 10 %; A/V de 8477300000 = 0 %. Se cargan con pnpm db:load-official. La tasa de despacho aduanero queda pendiente.
---

# Tasas reales para producción

Leído el 2026-11-16 en fuentes oficiales. Los valores están en `src/db/official-rules.ts` y se cargan
con `pnpm db:load-official <email-del-admin>`. El comando borra las filas `seed://demo`, inserta estas
reglas como `verified` a nombre de ese admin y deja el evento de auditoría `rules.official_loaded`.

## IGV e IPM — Ley N.º 32387

`https://busquedas.elperuano.pe/dispositivo/EX/2410141-1` (El Peruano, 16-06-2025).
- El artículo 2 sube el IPM de forma gradual "a partir del 1 de enero de 2026": 0,5 puntos por año
  de 2026 a 2029.
- La Tercera Disposición Complementaria Modificatoria deja el artículo 17 de la Ley del IGV en
  "La tasa del impuesto es 14 %". La Primera deja el IPM en 4 %.
- La Cuarta Disposición Complementaria Final dice que esos cambios "rigen progresivamente".

| Desde | IGV | IPM | Total |
|---|---|---|---|
| 2025-01-01 | 16 % | 2 % | 18 % |
| 2026-01-01 | 15,5 % | 2,5 % | 18 % |
| 2027-01-01 | 15 % | 3 % | 18 % |
| 2028-01-01 | 14,5 % | 3,5 % | 18 % |
| 2029-01-01 | 14 % | 4 % | 18 % |

La fila de 2025 sale de la orientación aduanera de SUNAT
(`https://www.sunat.gob.pe/orientacionaduanera/pagosgarantias/index.html`), que todavía muestra
16 % y 2 %. **Esa página no está actualizada para 2026.**

## UIT 2026 — D.S. N.º 301-2025-EF

`https://busquedas.elperuano.pe/dispositivo/NL/2469116-1` (El Peruano, 17-12-2025). El artículo 1
dice que la UIT "será de S/ 5 500,00".

## Percepción del IGV en importaciones — SUNAT

`https://orientacion.sunat.gob.pe/node/1189`:
- **10 %:** primera importación, sin RUC, no habido, RUC de baja o suspendido, omiso, o sin capacidad
  operativa. El D. Leg. 1714 (feb. 2026) amplió estos supuestos; en Cotimporta se agrupan en `riesgo`.
- **5 %:** nacionaliza bienes usados.
- **3,5 %:** resto de importadores.
- **No se aplica:** a las operaciones de agentes de retención del IGV, entre otras.

En Cotimporta se cargan como condiciones `general`, `bienes_usados`, `primera_importacion`, `riesgo`
y `no_aplica`.

**Fuera de alcance:** las mercancías "sensibles al fraude" (D.S. 104-2026-EF) usan el mayor entre la
tasa y un monto fijo por unidad. Cotimporta no lo calcula.

## Ad valorem de 8477300000 — Arancel de Aduanas 2022

En la p. 362 del Arancel: "8477.30.00.00 - Máquinas de moldear por soplado 0". El resto del arancel se
importa por CSV desde el admin (ver `tariff-source.md`).

## Pendiente: no se carga

- **Tasa de despacho aduanero.** Las fuentes se contradicen: 2,35 % de la UIT según el
  D.S. 072-2004-EF, citado por terceros, y 0,686 % de la UIT según una presentación de 2014. No se
  encontró la norma vigente. El admin la publica en `/admin` con su fuente. Mientras tanto el cálculo
  la omite.
- **TLC Perú–China y demás acuerdos.** No se cargan exoneraciones. Para 8477300000 no cambia nada,
  porque el ad valorem ya es 0 %.
