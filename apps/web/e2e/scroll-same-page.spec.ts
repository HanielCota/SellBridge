import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

/*
 * Regression: a click that only changed the address search (period tab, store, filter of a
 * page) used the router's default scroll reset, so the page jumped back to the top every time.
 */

function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

/**
 * Scrolls the window so the control sits right under the sticky top bar, as if the reseller had
 * read past the header (under the bar, Playwright would scroll by itself to reach it). Returns
 * where the control sits on screen.
 */
async function scrollPast(page: Page, control: Locator): Promise<number> {
  const box = await control.boundingBox();
  const topBar = await page.locator("header.sticky").boundingBox();
  if (box === null || topBar === null) {
    throw new Error("the control or the top bar is not on the page");
  }
  const target = Math.round(box.y - topBar.height - 16);
  await page.evaluate((top) => window.scrollTo(0, top), target);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(50);
  return screenTop(control);
}

async function screenTop(control: Locator): Promise<number> {
  const box = await control.boundingBox();
  if (box === null) {
    throw new Error("the control is not on the page");
  }
  return box.y;
}

/**
 * Checked once the new result is on screen. The browser may shift the scroll to keep the content
 * still when text above grows, so what must not move is the control on screen.
 */
async function expectControlInPlace(control: Locator, before: number): Promise<void> {
  await control
    .page()
    .evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  expect(Math.abs((await screenTop(control)) - before)).toBeLessThanOrEqual(2);
  expect(await scrollY(control.page())).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signIn(page, DEMO_USER);
});

test("trocar o período da visão geral mantém a rolagem da página", async ({ page }) => {
  await gotoHydrated(page, "/dashboard?period=180d");
  const periods = page.getByRole("group", { name: "Período" });
  const onScreen = await scrollPast(page, periods);

  await periods.getByText("30 dias", { exact: true }).click();

  await expect(page).toHaveURL(/period=30d/);
  await expect(page.getByText("comparado com os 30 dias anteriores")).toBeVisible();
  await expectControlInPlace(periods, onScreen);
});

test("trocar o período da operação dos pedidos mantém a rolagem da página", async ({ page }) => {
  await gotoHydrated(page, "/pedidos");
  const operations = page.getByRole("region", { name: "Pedidos para enviar" });
  const periods = operations.getByRole("group", { name: "Período" });
  const orders = operations.getByRole("list").first();
  await expect(orders).toHaveAttribute("aria-busy", "false");
  const onScreen = await scrollPast(page, periods);

  await periods.getByText("6 meses", { exact: true }).click();

  await expect(page).toHaveURL(/period=180d/);
  await expect(orders).toHaveAttribute("aria-busy", "false");
  await expectControlInPlace(periods, onScreen);
});

test("um link do menu abre a outra página no topo", async ({ page }) => {
  await gotoHydrated(page, "/dashboard?period=180d");
  await scrollPast(page, page.getByRole("group", { name: "Período" }));

  await page.getByRole("navigation").getByRole("link", { name: "Pedidos", exact: true }).click();

  await expect(page).toHaveURL(/\/pedidos/);
  await expect(page.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(0);
});
