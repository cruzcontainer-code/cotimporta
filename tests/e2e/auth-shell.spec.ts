import { expect, test } from "@playwright/test";
import { signIn, signUpAndVerify, uniqueEmail } from "./helpers";

const PASSWORD = "contraseña-e2e-segura";

// Los helpers usan las etiquetas en español; el Chrome de Playwright pide en-US por defecto
// y src/i18n/request.ts respondería en inglés.
test.use({ locale: "es-PE" });

test("un visitante anónimo que pide /app va a /auth/sign-in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
});

test("registro, verificación por correo e ingreso llevan al Panel", async ({ page }) => {
  const email = uniqueEmail("registro");
  await signUpAndVerify(page, { email, password: PASSWORD });
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
});

for (const viewport of [
  { width: 375, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`sin desplazamiento horizontal a ${viewport.width}px en / y /auth/sign-in`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/auth/sign-in"]) {
      await page.goto(path);
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      );
      expect(fits, `${path} a ${viewport.width}px`).toBe(true);
    }
  });
}

test("Salir cierra la sesión y /app vuelve a pedir ingreso", async ({ page }) => {
  const email = uniqueEmail("salir");
  await signUpAndVerify(page, { email, password: PASSWORD });
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);

  // La cuenta sigue funcionando: se puede volver a ingresar.
  await signIn(page, email, PASSWORD);
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
});

test("una contraseña incorrecta muestra el error en role=alert y no sale de la página", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Correo electrónico").fill(uniqueEmail("incorrecta"));
  await page.getByLabel("Contraseña").fill("no-es-la-contraseña");
  await page.getByRole("button", { name: "Ingresar" }).click();
  // Next.js agrega su propio role="alert" (anunciador de rutas); se filtra por el texto.
  await expect(
    page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
});
