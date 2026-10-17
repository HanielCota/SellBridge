import { expect, test, type Page } from "@playwright/test";
import { ADMIN_USER, enableAdminMode, signIn } from "./helpers";

const DESKTOP_WIDTHS = [1280, 1366, 1440, 1536, 1600, 1920] as const;

async function headerBoxes(page: Page) {
  const header = page.locator("header").first();
  const logo = await header.getByRole("link", { name: "SellBridge, visão geral" }).boundingBox();
  const nav = header.getByRole("navigation", { name: "Principal" });
  const navBox = (await nav.isVisible()) ? await nav.boundingBox() : null;
  const actions = await header.getByRole("button", { name: "Menu do usuário" }).boundingBox();
  const search = await header.getByRole("button", { name: /Buscar/ }).boundingBox();
  return { logo, nav: navBox, search, actions };
}

test("admin header keeps the tab capsule clear of the logo and the actions", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
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
});
