import { expect, test, type Page } from "@playwright/test";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn, signUp } from "./helpers";

const DESKTOP_WIDTHS = [1024, 1280, 1366, 1440, 1536, 1600, 1920] as const;

async function headerBoxes(page: Page) {
  const header = page.locator("header").first();
  const logo = await header.getByRole("link", { name: "SellBridge, visão geral" }).boundingBox();
  const nav = header.getByRole("navigation", { name: "Principal" });
  const navBox = (await nav.isVisible()) ? await nav.boundingBox() : null;
  const actions = await header.getByRole("button", { name: "Menu do usuário" }).boundingBox();
  const search = await header.getByRole("button", { name: /Buscar/ }).boundingBox();
  return { logo, nav: navBox, search, actions };
}

async function expectClearHeader(page: Page) {
  for (const width of DESKTOP_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await headerBoxes(page);
    expect(boxes.logo, `logo at ${width}px`).not.toBeNull();
    expect(boxes.search, `search at ${width}px`).not.toBeNull();
    expect(boxes.actions, `account at ${width}px`).not.toBeNull();
    if (boxes.logo === null || boxes.search === null || boxes.actions === null) {
      return;
    }
    expect(boxes.actions.x + boxes.actions.width, `account inside ${width}px`).toBeLessThanOrEqual(
      width,
    );
    if (boxes.nav === null) {
      await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeVisible();
      continue;
    }
    expect(boxes.nav.x, `capsule clears the logo at ${width}px`).toBeGreaterThanOrEqual(
      boxes.logo.x + boxes.logo.width,
    );
    expect(
      boxes.nav.x + boxes.nav.width,
      `capsule clears search at ${width}px`,
    ).toBeLessThanOrEqual(boxes.search.x);
  }
}

test("admin header keeps the tab capsule clear of the logo and the actions", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await expectClearHeader(page);
});

test("seller header stays clear with a long account name", async ({ page }) => {
  await signUp(page, "Seller with a deliberately long account display name");
  await gotoHydrated(page, "/dashboard");
  await expectClearHeader(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByText("Seller with a deliberately long account display name", { exact: true }),
  ).toBeVisible();
});
