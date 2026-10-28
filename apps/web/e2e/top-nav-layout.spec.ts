import { expect, test, type Page } from "@playwright/test";
import { organization, suppliers, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import {
  ADMIN_USER,
  enableAdminMode,
  gotoHydrated,
  SIGN_UP_PASSWORD,
  signIn,
  signUp,
} from "./helpers";
import { accountId, addSupplierProfile } from "./profile-fixtures";
import { supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const extraSupplierProfiles: string[] = [];

test.afterAll(async () => {
  await accounts.removeAll();
  for (const organizationId of extraSupplierProfiles) {
    await database.delete(suppliers).where(eq(suppliers.organizationId, organizationId));
    await database.delete(organization).where(eq(organization.id, organizationId));
  }
  await database.$client.end();
});

/** The lit pill under the active tab; the team divider is another hidden span in the nav. */
const PILL_SELECTOR = ":scope > span.bg-foreground[aria-hidden='true']";

const DESKTOP_WIDTHS = [1024, 1280, 1366, 1440, 1536, 1600, 1920] as const;

async function headerBoxes(page: Page) {
  const header = page.locator("header").first();
  const logo = await header.getByRole("link", { name: /^SellBridge, / }).boundingBox();
  const nav = header.getByRole("navigation", { name: "Principal" });
  const navBox = (await nav.isVisible()) ? await nav.boundingBox() : null;
  const actions = await header.getByRole("button", { name: "Menu do usuário" }).boundingBox();
  // The supplier header has no search; its first control on the right is Suporte.
  const search = await header
    .getByRole("button", { name: /Buscar/ })
    .or(header.getByRole("button", { name: /^Suporte/ }))
    .first()
    .boundingBox();
  return { logo, nav: navBox, search, actions };
}

async function expectClearHeader(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
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
    await expect
      .poll(() => nav.evaluate((element) => element.scrollWidth - element.clientWidth), {
        message: `every tab fits the capsule at ${width}px`,
      })
      .toBeLessThanOrEqual(0);
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

/**
 * A fresh admin account with a supplier profile besides its seller one: adding a profile to the
 * shared admin would change its menus for the specs running beside this one.
 */
async function signInAdminWithSupplierProfile(
  page: Page,
  displayName = "Admin Com Marca",
): Promise<{ slug: string }> {
  const email = await signUp(page, displayName);
  await database.update(user).set({ role: "admin" }).where(eq(user.email, email));
  const supplierProfile = await addSupplierProfile(database, await accountId(database, email));
  extraSupplierProfiles.push(supplierProfile.id);
  await page.context().clearCookies();
  await signIn(page, { email, password: SIGN_UP_PASSWORD });
  await enableAdminMode(page);
  return { slug: supplierProfile.slug };
}

test("staff can enter team mode from the supplier profile without clipping its tabs", async ({
  page,
}) => {
  const profile = await signInAdminWithSupplierProfile(
    page,
    "Staff with a deliberately long account display name",
  );
  await gotoHydrated(page, `/fornecedor/painel?perfil=${profile.slug}`);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Modo administrador" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expectClearHeader(page);
  await expectEveryTabVisible(page);
  await page.getByRole("button", { name: "Modo administrador", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products/);
  await expect(page.getByText("Modo admin ativo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fornecedor" })).toBeVisible();
});

test("admin header gives each profile its own menu and still fits", async ({ page }) => {
  const supplierProfile = await signInAdminWithSupplierProfile(page);
  // Two menus and the six team tabs are the widest admin capsule.
  await expectClearHeader(page);
  await expectEveryTabVisible(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("button", { name: "Revendedor" }).click();
  await expect(page.getByRole("menuitem", { name: "Visão geral" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Meus produtos" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await nav.getByRole("button", { name: "Fornecedor" }).click();
  await expect(page.getByRole("menuitem", { name: "Visão geral" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Início" }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/fornecedor/painel" &&
      url.searchParams.get("perfil") === supplierProfile.slug,
  );
  // On the supplier profile the menus keep their places: Revendedor first, then Fornecedor.
  const menus = nav.getByRole("button", { name: /^(Revendedor|Fornecedor)/ });
  await expect(menus).toHaveText([/Revendedor/, /Fornecedor/]);
});

test("admin phone menu switches between the reseller and the supplier screens", async ({
  page,
}) => {
  const supplierProfile = await signInAdminWithSupplierProfile(page);
  // 375px is the narrowest phone we support: the switch clipped "Fornecedor" there.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Navegação" });
  const nav = sheet.getByRole("navigation", { name: "Principal" });
  const profileSwitch = sheet.getByRole("group", { name: "Perfil" });
  const clippedWidth = await profileSwitch.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(clippedWidth, "both profile options fit the switch").toBeLessThanOrEqual(0);
  await expect(sheet.getByRole("button", { name: "Revendedor" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(nav.getByRole("link", { name: "Catálogo" })).toBeVisible();
  // The team's own Fornecedores tab sits under its title, apart from the supplier profile.
  await expect(nav.getByRole("heading", { name: "Administração" })).toBeVisible();
  await sheet.getByRole("button", { name: "Fornecedor" }).click();
  await expect(nav.getByRole("link", { name: "Catálogo" })).toHaveCount(0);
  await expect(nav.locator('a[href^="/fornecedor/painel/produtos"]')).toHaveText("Produtos");
  await nav.getByRole("link", { name: "Início" }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/fornecedor/painel" &&
      url.searchParams.get("perfil") === supplierProfile.slug,
  );
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

// With "Mensagens" as a seventh tab, icons from 1280px ran the capsule 89px past its track;
// "Vendas" makes seven, so the tabs sit a little tighter and the icons still fit from 1440px.
test("supplier header shows the tab icons from 1440px and stays clear", async ({ page }) => {
  await accounts.signUp(page, "Supplier with a deliberately long brand display name");
  await expect(page.getByRole("link", { name: "SellBridge, painel do fornecedor" })).toBeVisible();
  await expectClearHeader(page);
  await expectEveryTabVisible(page);
  const nav = page.getByRole("navigation", { name: "Principal" });
  for (const [width, hasIcons] of [
    [1280, false],
    [1366, false],
    [1440, true],
    [1920, true],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of ["Início", "Pedidos", "Vendas", "Mensagens", "Desempenho", "Marca"]) {
      const icon = nav.getByRole("link", { name: label, exact: true }).locator("svg");
      if (hasIcons) {
        await expect(icon, `${label} icon at ${width}px`).toBeVisible();
        continue;
      }
      await expect(icon, `${label} icon at ${width}px`).toBeHidden();
    }
  }
});
