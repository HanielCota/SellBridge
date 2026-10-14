import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database";
import { suppliers } from "@sellbridge/database/schema";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { requireEnvironmentVariable } from "./environment";

test("the dark theme tells the browser, so native controls and scrollbars turn dark", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("sellbridge-theme", "dark"));
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/publicacoes");
  const colorScheme = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  );
  expect(colorScheme).toBe("dark");
});

test("fields are at least 16px on phones, so iOS does not zoom in on focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/publicacoes");
  const search = page.getByRole("searchbox").or(page.getByPlaceholder("Buscar produto")).first();
  const fontSize = await search.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(fontSize).toBeGreaterThanOrEqual(16);
});

test("the admin supplier form uses the app's own select, never the native one", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
  const [supplier] = await database.select({ id: suppliers.id }).from(suppliers).limit(1);
  await database.$client.end();
  await gotoHydrated(page, `/admin/fornecedores/${supplier?.id ?? ""}`);
  await expect(page.getByLabel("UF de origem")).toBeVisible();
  await expect(page.locator("select:not([aria-hidden='true'])")).toHaveCount(0);
});
