import { expect, test, type Page } from "@playwright/test";
import { organization, suppliers, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import {
  ADMIN_USER,
  DEMO_USER,
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

/** From `lg` the sidebar holds the menu; below it the header's menu button opens it. */
const DESKTOP_WIDTHS = [1024, 1280, 1366, 1440, 1920] as const;

function sidebar(page: Page) {
  return page
    .getByRole("complementary", { name: "Menu lateral" })
    .getByRole("navigation", { name: "Principal" });
}

/** How far a menu's content runs past its own box sideways (a sideways scrollbar when > 0). */
async function sidewaysOverflow(menu: ReturnType<Page["getByRole"]>): Promise<number> {
  return await menu.evaluate((element) => element.scrollWidth - element.clientWidth);
}

/** The page never scrolls sideways and the account button stays inside the window. */
async function expectPageFits(page: Page) {
  for (const width of DESKTOP_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expect(sidebar(page), `sidebar at ${width}px`).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(0);
    // Regression: in team mode, long items with counts ("Desempenho do suporte 2") made the
    // sidebar itself scroll sideways and cut the labels.
    expect(await sidewaysOverflow(sidebar(page)), `sidebar fits at ${width}px`).toBeLessThanOrEqual(
      0,
    );
    const account = await page.getByRole("button", { name: /Menu do usuário/ }).boundingBox();
    expect(account, `account at ${width}px`).not.toBeNull();
    expect(
      (account?.x ?? 0) + (account?.width ?? 0),
      `account inside ${width}px`,
    ).toBeLessThanOrEqual(width);
  }
}

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

test("the admin sidebar lists every team page under its heading and the page still fits", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await expectPageFits(page);
  const nav = sidebar(page);
  await expect(nav.getByRole("heading", { name: "Administração", exact: true })).toBeVisible();
  for (const group of ["Contas", "Atendimento", "Moderação", "Equipe"]) {
    await expect(nav.getByRole("group", { name: group, exact: true })).toBeAttached();
  }
  // Pages that before only had a link inside another page or in the account menu.
  for (const label of ["Desempenho do suporte", "Análise de produtos", "Auditoria"]) {
    await expect(nav.getByRole("link", { name: label })).toBeAttached();
  }
  await nav.getByRole("link", { name: "Visão geral" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("a team page under another one lights only its own item", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/chamados/metricas");
  const nav = sidebar(page);
  await expect(nav.getByRole("link", { name: "Desempenho do suporte" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: /^Chamados/ })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("staff can enter team mode from the supplier profile", async ({ page }) => {
  const profile = await signInAdminWithSupplierProfile(
    page,
    "Staff with a deliberately long account display name",
  );
  await gotoHydrated(page, `/fornecedor/painel?perfil=${profile.slug}`);
  await page.getByRole("button", { name: /Menu do usuário/ }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Modo administrador" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expectPageFits(page);
  await page.getByRole("button", { name: "Modo administrador", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products/);
  await expect(page.getByText("Modo admin ativo")).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Menu lateral" })
      .getByRole("button", { name: "Fornecedor" }),
  ).toBeVisible();
});

test("the admin sidebar switches between the reseller and the supplier items", async ({ page }) => {
  const supplierProfile = await signInAdminWithSupplierProfile(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const aside = page.getByRole("complementary", { name: "Menu lateral" });
  const nav = sidebar(page);
  await expect(aside.getByRole("button", { name: "Revendedor" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(nav.getByRole("link", { name: "Catálogo" })).toBeVisible();
  await aside.getByRole("button", { name: "Fornecedor" }).click();
  await expect(nav.getByRole("link", { name: "Catálogo" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Início" }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/fornecedor/painel" &&
      url.searchParams.get("perfil") === supplierProfile.slug,
  );
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
  // The team's own Fornecedores item sits under its title, apart from the supplier profile.
  await expect(nav.getByRole("heading", { name: "Administração" })).toBeVisible();
  expect(
    await sidewaysOverflow(nav),
    "the phone menu does not scroll sideways",
  ).toBeLessThanOrEqual(0);
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

test("the seller page fits with a long account name", async ({ page }) => {
  await signUp(page, "Seller with a deliberately long account display name");
  await gotoHydrated(page, "/dashboard");
  await expectPageFits(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByText("Seller with a deliberately long account display name", { exact: true }),
  ).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: "Integrações" })).toBeVisible();
});

// A supplier looked for the spreadsheet import in the top menu and did not find it.
test("the supplier sidebar has the spreadsheet import as an item of its own", async ({ page }) => {
  await accounts.signUp(page, "Supplier with a deliberately long brand display name");
  await expect(page.getByRole("link", { name: "SellBridge, painel do fornecedor" })).toBeVisible();
  await expectPageFits(page);
  // Regression: a long brand name pushed the account out of the sidebar, over the page.
  const aside = await page.getByRole("complementary", { name: "Menu lateral" }).boundingBox();
  const account = await page
    .getByRole("complementary", { name: "Menu lateral" })
    .getByRole("button", { name: /Menu do usuário/ })
    .boundingBox();
  expect((account?.x ?? 0) + (account?.width ?? 0)).toBeLessThanOrEqual(
    (aside?.x ?? 0) + (aside?.width ?? 0),
  );
  const nav = sidebar(page);
  await nav.getByRole("link", { name: "Importar planilha" }).click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/importar/);
  await expect(nav.getByRole("link", { name: "Importar planilha" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Produtos", exact: true })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the sidebar shrinks to its icons and remembers it after a reload", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  const aside = page.getByRole("complementary", { name: "Menu lateral" });
  const catalog = sidebar(page).getByRole("link", { name: "Catálogo" });
  const catalogWidth = async () => (await catalog.boundingBox())?.width ?? 0;
  await expect.poll(catalogWidth).toBeGreaterThan(150);

  await aside.getByRole("button", { name: "Recolher menu" }).click();
  // The label stays for screen readers; only the icon takes room.
  await expect.poll(catalogWidth).toBeLessThan(64);
  await expect(catalog.locator("svg")).toBeVisible();
  await page.reload();
  await expect(aside.getByRole("button", { name: "Abrir o menu lateral" })).toBeVisible();
  await expect.poll(catalogWidth).toBeLessThan(64);

  await aside.getByRole("button", { name: "Abrir o menu lateral" }).click();
  await expect.poll(catalogWidth).toBeGreaterThan(150);
});

test("the account and support sit at the foot of the menu, the header keeps search and bell", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  const header = page.locator("header").first();
  const aside = page.getByRole("complementary", { name: "Menu lateral" });
  await expect(header.getByRole("button", { name: /^Buscar/ })).toBeVisible();
  // The demo account may have unread notices, which turn the name into "Avisos: N novos".
  await expect(header.getByRole("button", { name: /^Avisos/ })).toBeVisible();
  await expect(header.getByRole("button", { name: /Menu do usuário/ })).toHaveCount(0);
  await expect(header.getByRole("button", { name: /^Suporte/ })).toHaveCount(0);

  await aside.getByRole("button", { name: /^Suporte/ }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Abrir chamado" })).toBeVisible();
  await page.keyboard.press("Escape");
  await aside.getByRole("button", { name: /Menu do usuário/ }).click();
  await expect(page.getByRole("menuitem", { name: "Sair" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Navegação" })
    .getByRole("button", { name: /Menu do usuário/ })
    .click();
  await expect(page.getByRole("menuitem", { name: "Sair" })).toBeVisible();
});

// Regression: beside the sidebar, long ticket subjects kept to one line and pushed Situação and
// Atualizado out of the table at 1366px.
test("the admin ticket table keeps every column in view beside the sidebar", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/admin/chamados");
  const table = page.getByRole("main").getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Atualizado" })).toBeVisible();
  const hiddenWidth = await table.evaluate((element) => {
    const box = element.parentElement ?? element;
    return box.scrollWidth - box.clientWidth;
  });
  expect(hiddenWidth).toBeLessThanOrEqual(0);
});

// Regression: when the browser refused to store the choice, the button reread storage and the
// sidebar never shrank.
test("the sidebar still shrinks when the browser refuses to store the choice", async ({ page }) => {
  await page.addInitScript(() => {
    const original: unknown = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")?.value;
    if (typeof original !== "function") {
      throw new Error("Storage.setItem not found");
    }
    Storage.prototype.setItem = function refuseSidebarChoice(key: string, value: string) {
      if (key === "sellbridge-sidebar-collapsed") {
        throw new DOMException("Storage refused", "QuotaExceededError");
      }
      Reflect.apply(original, this, [key, value]);
    };
  });
  await signIn(page, ADMIN_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  const catalog = sidebar(page).getByRole("link", { name: "Catálogo" });
  const catalogWidth = async () => (await catalog.boundingBox())?.width ?? 0;

  await page
    .getByRole("complementary", { name: "Menu lateral" })
    .getByRole("button", { name: "Recolher menu" })
    .click();

  await expect.poll(catalogWidth).toBeLessThan(64);
});
