import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { e2eBaseUrl } from "./env";
import { resetSignUpLimit, signUpAndVerify, uniqueEmail } from "./helpers";

// Accesibilidad automática (WCAG 2.1 A/AA con axe) en las pantallas principales, más el
// recorrido básico con teclado. No reemplaza la pasada con lector de pantalla (§20.1).
test.use({ locale: "es-PE" });

const PASSWORD = "contraseña-e2e-segura";

async function expectNoViolations(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary, `violaciones en ${label}`).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`pantallas públicas y del usuario sin violaciones WCAG A/AA (${theme})`, async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: "theme", value: theme, url: e2eBaseUrl }]);
    for (const path of ["/", "/auth/sign-in", "/auth/sign-up"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(theme);
      await expectNoViolations(page, path);
    }

    await resetSignUpLimit();
    await signUpAndVerify(page, { email: uniqueEmail(`a11y-${theme}`), password: PASSWORD });
    await expectNoViolations(page, "/app");
    for (const path of ["/app/quotes", "/app/billing", "/app/settings"]) {
      await page.goto(path);
      await expectNoViolations(page, path);
    }

    await page.goto("/app/quotes");
    await page.getByRole("button", { name: "Nueva cotización" }).click();
    await page.waitForURL(/paso=producto$/);
    await page.getByRole("button", { name: "Agregar ítem" }).click();
    await expectNoViolations(page, "asistente: producto");
    await page.getByLabel("Descripción del ítem").fill("Planta BG-880");
    await page.getByLabel("Total USD").fill("12000.00");
    await page.getByRole("button", { name: "Guardar y continuar" }).click();
    await page.waitForURL(/paso=partida$/);
    await page.getByLabel("Buscar partida").fill("8477");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirmar 8477300000" })).toBeVisible();
    await expectNoViolations(page, "asistente: partida");
    await page.getByRole("button", { name: "Confirmar 8477300000" }).click();
    await page.waitForURL(/paso=costos$/);
    await expectNoViolations(page, "asistente: costos");
    await page.getByLabel("Tipo de cambio (S/ por US$)").fill("3.50");
    await page.getByLabel("Fecha del tipo de cambio").fill("2026-10-29");
    await page.getByLabel("Fuente del tipo de cambio").fill("T.C. referencial E2E");
    await page.getByRole("button", { name: "Guardar y calcular" }).click();
    await page.waitForURL(/paso=resultado$/);
    await expectNoViolations(page, "asistente: resultado");
  });
}

test("con teclado: el primer Tab enfoca 'Saltar al contenido' y lleva al main", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#contenido$/);
  // El formulario se completa y envía solo con teclado.
  await page.getByLabel("Correo electrónico").focus();
  await expect(page.getByLabel("Correo electrónico")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Contraseña")).toBeFocused();
});

test("a 375 px no hay desplazamiento horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", "/auth/sign-in", "/auth/sign-up"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
