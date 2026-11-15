---
topic: tariff-source
status: verified
checked_on: 2026-11-15
source_url: https://www.sunat.gob.pe/orientacionaduanera/aranceles/2022/arancel-ad-2022.pdf
machine_readable: no
format: pdf
fallback: csv_upload
decision: No hay fuente oficial legible por máquina. TARIFF_SOURCE_URL queda vacía; E2-T6 importa solo por CSV manual (formato de §4) y el adaptador oficial devuelve "sin fuente" sin publicar nada.
---

# Fuente oficial del arancel de aduanas

Leído el 2026-11-15.

## Qué se pudo leer

- `https://www.sunat.gob.pe/orientacionaduanera/aranceles/2022/arancel-ad-2022.pdf`: PDF de
  434 páginas. Portada: "ANEXO ARANCEL DE ADUANAS 2022". En la página 362:
  "8477.30.00.00 - Máquinas de moldear por soplado 0" (subpartida y A/V en texto corrido, no en tabla de datos).
- `https://www.sunat.gob.pe/operatividadaduanera/index.html` enlaza la consulta
  "Una Partida (Arancel)" → `http://www.aduanet.gob.pe/itarancel/arancelS01Alias`: una consulta
  por partida, no una descarga masiva.
- `https://www.sunat.gob.pe/orientacionaduanera/aranceles/index.html`: no ofrece archivos
  descargables (ni XLS/XLSX, CSV ni TXT).

## Qué no se pudo leer

- `https://www.aduanet.gob.pe/itarancel/arancelS01Alias` y `.../aduanas/informao/tgbajarc.htm`
  rechazan la conexión desde fuera ("connect ECONNREFUSED"), también en navegador.
- `https://www.gob.pe/mef` devolvió HTTP 418.

Ninguna fuente leída ofrece el arancel en CSV, XLSX ni API. Por eso `machine_readable: no` y la
importación queda en CSV manual. Si más adelante SUNAT publica un archivo descargable, actualizar
este documento y `TARIFF_SOURCE_URL`.
