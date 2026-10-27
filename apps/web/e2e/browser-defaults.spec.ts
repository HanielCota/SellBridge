import { expect, test } from "@playwright/test";
import { suppliers } from "@sellbridge/database/schema";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";

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
  const database = e2eDatabase();
  const [supplier] = await database.select({ id: suppliers.id }).from(suppliers).limit(1);
  await database.$client.end();
  await gotoHydrated(page, `/admin/fornecedores/${supplier?.id ?? ""}`);
  await expect(page.getByLabel("UF de origem")).toBeVisible();
  await expect(page.locator("select:not([aria-hidden='true'])")).toHaveCount(0);
});

test("switching the theme swaps colors at once, with no reveal or fading", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sellbridge-theme", "dark");
    Reflect.set(window, "viewTransitionCount", 0);
    if (typeof document.startViewTransition !== "function") {
      return;
    }
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (...args: Parameters<typeof original>) => {
      Reflect.set(
        window,
        "viewTransitionCount",
        Number(Reflect.get(window, "viewTransitionCount")) + 1,
      );
      return original(...args);
    };
  });
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/publicacoes");
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitemradio", { name: "Claro" }).click();
  const afterSwitch = await page.evaluate(() => ({
    isDark: document.documentElement.classList.contains("dark"),
    viewTransitions: Number(Reflect.get(window, "viewTransitionCount")),
    runningTransitions: document
      .getAnimations()
      .filter((animation) => animation instanceof CSSTransition).length,
  }));
  expect(afterSwitch).toEqual({ isDark: false, viewTransitions: 0, runningTransitions: 0 });
});
