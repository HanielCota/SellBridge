import { expect, test, type Page } from "@playwright/test";
import { ADMIN_USER, DEMO_USER, signIn, waitForHydration } from "./helpers";

/** The mode is kept between sessions: each test starts from it switched off. */
async function startWithAdminModeOff(page: Page) {
  await signIn(page, ADMIN_USER);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Modo administrador" });
  if ((await toggle.getAttribute("aria-checked")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }
  await page.keyboard.press("Escape");
}

/*
 * Regression: the team's tools only appeared after a switch hidden inside the account menu, so an
 * admin could not find the admin area. The way in now sits in the header, and in the phone menu.
 */
test("no computador, o botão do topo liga o modo e abre a área de admin", async ({ page }) => {
  await startWithAdminModeOff(page);
  const toggle = page.getByRole("button", { name: "Modo administrador", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page).toHaveURL(/\/admin\//);
  await expect(page.getByRole("region", { name: "Administração" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Produtos", level: 1 })).toBeVisible();
  await expect(toggle).toHaveCount(0);
});

test("the account switch leaves admin mode and returns to the dashboard", async ({ page }) => {
  await startWithAdminModeOff(page);
  const toggle = page.getByRole("button", { name: "Modo administrador", exact: true });
  await toggle.click();
  await expect(page).toHaveURL(/\/admin\//);

  await page.getByRole("button", { name: "Menu do usuário" }).click();
  const menuToggle = page.getByRole("menuitemcheckbox", { name: "Modo administrador" });
  await expect(menuToggle).toHaveAttribute("aria-checked", "true");
  await menuToggle.click();
  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("region", { name: "Administração" })).toHaveCount(0);
});

test("no celular, o primeiro item do menu liga o modo e abre a área de admin", async ({ page }) => {
  await startWithAdminModeOff(page);
  // On phones the account sits inside the menu sheet, so the mode is switched off on desktop first.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const navigation = page.getByRole("navigation", { name: "Principal" });
  await navigation.getByRole("button", { name: "Modo administrador" }).click();
  await expect(page).toHaveURL(/\/admin\//);
});

test("o revendedor não vê o caminho da equipe", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: "Modo administrador", exact: true })).toHaveCount(
    0,
  );
});

// Regression: an /admin link opened with the mode off bounced to the sales dashboard in silence.
test("um link da área de admin abre a tela e liga o modo", async ({ page }) => {
  await startWithAdminModeOff(page);
  await page.goto("/admin/clientes");
  await expect(page).toHaveURL(/\/admin\/clientes/);
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Administração" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clientes", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

// Regression: the team answering tickets in admin mode saw the reseller's support chat button.
test("o botão de suporte do revendedor some no modo administrador", async ({ page }) => {
  await startWithAdminModeOff(page);
  const launcher = page.getByRole("complementary", { name: "Suporte" }).getByRole("button");
  await expect(launcher).toBeVisible();
  await page.getByRole("button", { name: "Modo administrador", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\//);
  await expect(launcher).toHaveCount(0);
});
