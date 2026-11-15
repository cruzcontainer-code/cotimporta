---
description: Componentes, páginas, accesibilidad y textos ES/EN
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
---

# Interfaz

- Server Components por defecto; `"use client"` en la hoja más pequeña con estado o eventos.
- Sin librería de componentes: HTML nativo (`<dialog>`, `<details>`, `<select>`, `<table>`) con las
  clases utilitarias de `src/app/globals.css` (`btn`, `btn-primary`, `btn-ghost`, `input`, `card`,
  `table-base`, `badge`). Ningún hex ni px arbitrario fuera de `globals.css`.
- Textos: objeto `copy: Copy<T>` junto al componente (`{ es: T; en: T }`); TypeScript obliga a que
  ambos idiomas tengan las mismas claves. Locale con `getLocale()` (servidor) o `useLocale()` (cliente).
- Montos: siempre `formatMinor()` / `formatPen()` de `src/lib/engine/money.ts`; nunca `toFixed` ni
  `Intl` en componentes.
- Cada input con `<label>` asociado; errores como texto en `role="alert"`; foco visible
  (`outline` 2 px acento); objetivos de 24×24 px mínimo; reordenar con botones, nunca solo arrastre.
- Un `h1` por página. Listas y vistas asíncronas con estado vacío, de carga y de error.
- Sin desplazamiento horizontal a 375 px; tablas anchas dentro de un contenedor con `overflow-x-auto`.
- Aviso obligatorio en resultado y PDF: es "Estimación referencial. No es una liquidación oficial de
  aduanas. Reglas vigentes al AAAA-MM-DD." / en "Reference estimate. Not an official customs
  assessment. Rules in force as of YYYY-MM-DD."
