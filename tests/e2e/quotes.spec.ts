import { expect, type Page, test } from "@playwright/test";
import { grantActiveSubscription, quoteDeletedAt, signUpAndVerify, uniqueEmail } from "./helpers";

// Etiquetas en español (helpers y asistente); el Chrome de Playwright pide en-US por defecto.
test.use({ locale: "es-PE" });

const PASSWORD = "contraseña-e2e-segura";

/** Crea una cotización desde el listado y la lleva hasta el resultado; devuelve id y código. */
async function buildQuote(page: Page): Promise<{ id: string; code: string }> {
  await page.goto("/app/quotes");
  await page.getByRole("button", { name: "Nueva cotización" }).click();
  await page.waitForURL(/\/app\/quotes\/[0-9a-f-]{36}\?paso=producto$/);
  const id = page.url().match(/quotes\/([0-9a-f-]{36})/)?.[1] ?? "";
  const code = (await page.getByText(/^COT-\d{4}-\d{4}$/).textContent()) ?? "";

  // Producto: un ítem de factura de 12000.00 USD.
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await page.getByLabel("Descripción del ítem").fill("Planta BG-880 + set auxiliar + 5 moldes");
  await page.getByLabel("Total USD").fill("12000.00");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await page.waitForURL(/paso=partida$/);

  // Partida: búsqueda manual y confirmación de 8477300000.
  await page.getByLabel("Buscar partida").fill("8477");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar 8477300000" }).click();
  await page.waitForURL(/paso=costos$/);

  // Costos: gastos demo copiados al confirmar la partida; TC 3.50 con fecha y fuente.
  await page.getByLabel("Tipo de cambio (S/ por US$)").fill("3.50");
  await page.getByLabel("Fecha del tipo de cambio").fill("2026-10-29");
  await page.getByLabel("Fuente del tipo de cambio").fill("T.C. referencial E2E");
  await page.getByRole("button", { name: "Guardar y calcular" }).click();
  await page.waitForURL(/paso=resultado$/);
  return { id, code };
}

test("listado vacío, cotización calculada, comparación y borrado lógico", async ({ page }) => {
  const email = uniqueEmail("cotizaciones");
  await signUpAndVerify(page, { email, password: PASSWORD });

  // 1. Cuenta nueva: estado vacío y botón para crear.
  await page.goto("/app/quotes");
  await expect(page.getByRole("heading", { level: 1, name: "Cotizaciones" })).toBeVisible();
  await expect(page.getByText("Aún no tienes cotizaciones")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva cotización" })).toBeVisible();

  // 2. Cotización completa: total en USD y en PEN.
  const first = await buildQuote(page);
  expect(first.code).toMatch(/^COT-\d{4}-\d{4}$/);
  const summary = page.getByRole("row", { name: /^Total/ });
  await expect(summary).toContainText("$17,332.30");
  await expect(summary).toContainText("S/ 60,663.05");
  await expect(page.getByText(/^Estimación referencial\./)).toBeVisible();

  // 3. El listado la muestra con su código COT-.
  await page.goto("/app/quotes");
  await expect(page.getByRole("link", { name: first.code })).toBeVisible();

  // 5. Comparación de dos cotizaciones propias (la segunda necesita plan: la gratis ya se usó).
  await grantActiveSubscription(email);
  const second = await buildQuote(page);
  await page.goto(`/app/quotes/compare?ids=${first.id},${second.id}`);
  for (const code of [first.code, second.code]) {
    await expect(page.getByRole("columnheader", { name: new RegExp(code) })).toBeVisible();
  }
  await expect(page.getByRole("row", { name: /^Total/ }).getByText("$17,332.30")).toHaveCount(2);
  await expect(page.getByRole("row", { name: /^Factor de importación/ })).toContainText("1.444358");
  await expect(page.getByRole("row", { name: /^Tributos de compra/ })).toContainText("$2,415.10");

  // El formulario del listado lleva a la misma comparación.
  await page.goto("/app/quotes");
  await page.getByLabel(`Comparar ${first.code}`).check();
  await page.getByLabel(`Comparar ${second.code}`).check();
  await page.getByRole("button", { name: "Comparar", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Comparar cotizaciones" }),
  ).toBeVisible();

  // 4. Borrado lógico con confirmación: sale del listado y la fila conserva deleted_at.
  await page.goto("/app/quotes");
  await page.getByRole("button", { name: `Borrar ${first.code}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Borrar", exact: true }).click();
  await expect(page.getByRole("link", { name: first.code })).toHaveCount(0);
  await expect.poll(() => quoteDeletedAt(first.code)).not.toBeNull();
  await expect(page.getByRole("link", { name: second.code })).toBeVisible();
});

test("una cotización ajena en la comparación da 404", async ({ page }) => {
  await signUpAndVerify(page, { email: uniqueEmail("ajena"), password: PASSWORD });
  const response = await page.goto(
    "/app/quotes/compare?ids=00000000-0000-4000-8000-000000000000,00000000-0000-4000-8000-000000000001",
  );
  expect(response?.status()).toBe(404);
});
