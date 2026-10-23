import { expect, test, type Page } from "@playwright/test";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn, signUp } from "./helpers";

/** The lit pill under the active tab; the team divider is another hidden span in the nav. */
const PILL_SELECTOR = ":scope > span.bg-foreground[aria-hidden='true']";

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

/** The capsule has no scroll cue: a tab past its edge is clipped (Financeiro, 1536px+). */
async function expectEveryTabVisible(page: Page) {
  for (const width of DESKTOP_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const nav = page.getByRole("navigation", { name: "Principal" });
    if (!(await nav.isVisible())) {
      continue;
    }
    const clippedWidth = await nav.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(clippedWidth, `every tab fits the capsule at ${width}px`).toBeLessThanOrEqual(0);
  }
}

test("admin header keeps the tab capsule clear of the logo and the actions", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await expectClearHeader(page);
  await expectEveryTabVisible(page);
  // The seller tabs fold into one menu tab; its pages stay one click away.
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("button", { name: "Revendedor" }).click();
  await page.getByRole("menuitem", { name: "Pedidos" }).click();
  await expect(page).toHaveURL(/\/pedidos/);
  await expect(nav.getByRole("link", { name: "Chamados" })).toBeVisible();
});

test("opening a profile page in a new tab leaves the admin pill on the current tab", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = page.getByRole("navigation", { name: "Principal" });
  const tickets = nav.getByRole("link", { name: "Chamados" });
  await tickets.click();
  await expect(page).toHaveURL(/\/admin\/chamados/);
  await expect(tickets).toHaveAttribute("aria-current", "page");
  await nav.getByRole("button", { name: "Revendedor" }).click();
  const newTab = page.context().waitForEvent("page");
  await page.getByRole("menuitem", { name: "Pedidos" }).click({ modifiers: ["ControlOrMeta"] });
  await (await newTab).close();
  await expect(page).toHaveURL(/\/admin\/chamados/);
  await expect(tickets).toHaveAttribute("aria-current", "page");
});

// Regression (main CI after #85 and #87): the Chamados count arrived after the page, widened
// its tab, and the pill glided for 400 ms from under that count to Equipe. axe caught the count
// on the white pill (contrast 1.2) whenever it ran inside that glide.
test("the admin pill lands at once on its tab when a count beside it appears", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHydrated(page, "/admin/equipe");
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Equipe" })).toHaveAttribute("aria-current", "page");
  const pillGap = async () =>
    nav.evaluate((element, selector) => {
      const pill = element.querySelector(selector);
      const active = element.querySelector("a[aria-current='page']");
      if (pill === null || active === null) {
        return null;
      }
      return Math.abs(pill.getBoundingClientRect().left - active.getBoundingClientRect().left);
    }, PILL_SELECTOR);
  // The pill first lands where the page opened; only a later layout change is under test.
  await expect.poll(pillGap).toBeLessThanOrEqual(1);
  const gap = await nav.evaluate(async (element, selector) => {
    const pill = element.querySelector(selector);
    const active = element.querySelector("a[aria-current='page']");
    const tickets = [...element.querySelectorAll("a")].find((link) =>
      link.textContent.startsWith("Chamados"),
    );
    if (pill === null || active === null || tickets === undefined) {
      return null;
    }
    const count = document.createElement("span");
    count.textContent = "99";
    count.style.width = "40px";
    count.style.display = "inline-block";
    tickets.append(count);
    for (let frame = 0; frame < 4; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return Math.abs(pill.getBoundingClientRect().left - active.getBoundingClientRect().left);
  }, PILL_SELECTOR);
  expect(gap).not.toBeNull();
  expect(gap).toBeLessThanOrEqual(1);
});

test("the admin pill moves without a glide when the system asks for reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHydrated(page, "/admin/equipe");
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Equipe" })).toHaveAttribute("aria-current", "page");
  await expect(nav.locator(PILL_SELECTOR)).toHaveCount(1);
  // Sampled two frames after the click: a glide would still be running then.
  const transition = await nav.evaluate(async (element, selector) => {
    const pill = element.querySelector(selector);
    const tickets = [...element.querySelectorAll("a")].find((link) =>
      link.textContent.startsWith("Chamados"),
    );
    if (pill === null || tickets === undefined) {
      return null;
    }
    tickets.click();
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const style = getComputedStyle(pill);
    return { property: style.transitionProperty, duration: style.transitionDuration };
  }, PILL_SELECTOR);
  expect(transition).not.toBeNull();
  const glides = transition?.property !== "none" && transition?.duration !== "0s";
  expect(glides).toBe(false);
});

test("seller header stays clear with a long account name", async ({ page }) => {
  await signUp(page, "Seller with a deliberately long account display name");
  await gotoHydrated(page, "/dashboard");
  await expectClearHeader(page);
  await expectEveryTabVisible(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByText("Seller with a deliberately long account display name", { exact: true }),
  ).toBeVisible();
});
