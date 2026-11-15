---
topic: gemini-model
status: verified
checked_on: 2026-11-15
source_url: https://aistudio.google.com/docs/models/gemini-3.8-flash
model_id: gemini-3.8-flash
supports_pdf_input: yes
supports_json_schema: yes
decision: Usar gemini-3.8-flash (Flash estable más reciente con entrada PDF y salida estructurada) en AI_DRIVER=gemini; GEMINI_MODEL=gemini-3.8-flash.
---

# Modelo Gemini para extracción de fichas y sugerencia de partidas

Leído el 2026-11-15. `https://ai.google.dev/gemini-api/docs/models` responde 301 a
`https://aistudio.google.com/docs/models`; las citas salen de esa página y de las fichas por modelo.

## Citas de la fuente

- Ficha del modelo (`/docs/models/gemini-3.8-flash`), versiones: "Stable: `gemini-3.8-flash`".
- Misma ficha, entradas: "Text, Image, Video, Audio, and PDF"; salida: "Text".
- Misma ficha: "Structured outputs" figura como *supported*.
- Página de modelos: `gemini-2.5-pro` está deprecado y, desde el 1 de diciembre de 2026, sus
  solicitudes se enrutan a `gemini-3.8-flash`.
- Guía de salida estructurada (`/docs/structured-output`): para JSON Schema hay que
  "set its `mime_type` to `application/json`" y "The schema should be provided in the `schema` field".
  Advierte: "Not all JSON Schema features are supported".
- Guía de documentos (`/docs/document-processing`): "Gemini supports PDF files up to 50MB or 1000 pages."

## Alternativa evaluada

- `gemini-3.6-flash`: también "Stable", con entradas "Text, Image, Video, Audio, and PDF" y
  "Structured outputs" *supported*. Queda como respaldo si el costo de 3.8 no conviene.

## Notas para E3-T2

- La guía muestra la salida estructurada con la Interactions API (`response_format` con
  `mime_type` y `schema`). Antes de escribir `src/server/ai/gateway.ts`, confirmar el nombre exacto
  del parámetro en la versión instalada de `@google/genai` (léelo de `pnpm-lock.yaml` y sus tipos).
- `minLength`, `maxLength`, `uniqueItems` y similares no se aplican al decodificar: validar siempre
  la respuesta con Zod en el servidor.
