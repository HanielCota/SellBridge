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

function administration(page: Page) {
  return sidebar(page).getByRole("region", { name: "Administração" });
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

test("the sidebar switches between team and business pages without widening the layout", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);
  await gotoHydrated(page, "/admin/clientes");
  await expectPageFits(page);
  const nav = sidebar(page);
  await expect(nav.getByRole("link", { name: "Visão geral" })).toHaveCount(0);
  for (const label of ["Clientes", "Desempenho do suporte", "Auditoria"]) {
    await expect(administration(page).getByRole("link", { name: label })).toBeVisible();
  }
  await nav.getByRole("button", { name: "Meu negócio" }).click();
  await expect(administration(page).getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Visão geral" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

/*
 * Regression: the chosen item faded its pill to white while its white hover text faded to dark,
 * so in the dark theme it flashed white on white after a click (longer on a slow page).
 */
test("a menu item changes its colors at once on hover and click, with no fade", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  const item = sidebar(page).getByRole("link", { name: "Lojas" });
  await item.evaluate((element) => {
    const faded: string[] = [];
    element.setAttribute("data-faded", "");
    element.addEventListener("transitionrun", (event) => {
      if (event instanceof TransitionEvent) {
        faded.push(event.propertyName);
        element.setAttribute("data-faded", faded.join(","));
      }
    });
  });

  await item.hover();
  await item.click();
  await expect(item).toHaveAttribute("aria-current", "page");
  await page.waitForTimeout(400);

  const faded = await item.getAttribute("data-faded");
  expect(faded ?? "").not.toMatch(/color/);
});

/*
 * Regression: the menu's groups sized their column to the widest one-line label, so a long label
 * (the team's "Desempenho do suporte 2", or a sidebar narrowed by Windows' scrollbar) pushed the
 * items past the sidebar, cut them and made it scroll sideways.
 */
test("a long menu label is cut short instead of widening the sidebar", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  const nav = sidebar(page);

  await nav.getByRole("link", { name: "Publicações" }).evaluate((link) => {
    const label = [...link.querySelectorAll("span")].find(
      (span) => span.textContent === "Publicações",
    );
    if (label !== undefined) {
      label.textContent = "Publicações com um nome bem mais comprido que o menu";
    }
  });

  expect(await sidewaysOverflow(nav)).toBeLessThanOrEqual(0);
});

test("a team page under another one lights only its own item", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/chamados/metricas");
  const nav = administration(page);
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
  await expect(administration(page)).toBeVisible();
  await sidebar(page).getByRole("button", { name: "Meu negócio" }).click();
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
  await nav.getByRole("button", { name: "Meu negócio" }).click();
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
  const business = nav.getByRole("button", { name: "Meu negócio" });
  if ((await business.getAttribute("aria-expanded")) === "false") await business.click();
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
  // A long brand name once pushed the account out of the sidebar; the profile card cuts it short,
  // and expectPageFits keeps the card inside the window at every width.
  await expectPageFits(page);
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

// The icons-only mode hid the item names, so the sidebar always stays open, even for a browser
// that kept the old choice to shrink it.
test("the sidebar stays open with no button to shrink it", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sellbridge-sidebar-collapsed", "on");
  });
  await signIn(page, ADMIN_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  const aside = page.getByRole("complementary", { name: "Menu lateral" });
  const catalog = sidebar(page).getByRole("link", { name: "Catálogo" });

  await expect(catalog).toBeVisible();

  await expect.poll(async () => (await catalog.boundingBox())?.width ?? 0).toBeGreaterThan(150);
  await expect(aside.getByRole("button", { name: /Recolher|Abrir o menu lateral/ })).toHaveCount(0);
});

/** Since the new layout, every account opens its menu from the header, not the sidebar. */
function accountButton(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: /Menu do usuário/ });
}

/** The open account menu's rows, in order, by their visible names. */
async function accountMenuRows(page: Page): Promise<string[]> {
  return await page
    .getByRole("menu")
    .locator("[role=menuitem], [role=menuitemcheckbox]")
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
}

test("the header holds search, the bell and the account; help opens from Suporte at the menu's foot", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  const header = page.getByRole("banner");
  const aside = page.getByRole("complementary", { name: "Menu lateral" });
  await expect(header.getByRole("button", { name: /^Buscar/ })).toBeVisible();
  // The demo account may have unread notices, which turn the name into "Avisos: N novos".
  await expect(header.getByRole("button", { name: /^Avisos/ })).toBeVisible();
  await expect(accountButton(page)).toContainText("demo@sellbridge.local");
  await expect(aside.getByRole("button", { name: /Menu do usuário/ })).toHaveCount(0);

  const plan = await aside.getByRole("link", { name: "Assinatura", exact: true }).boundingBox();
  const support = await aside.getByRole("button", { name: /^Suporte/ }).boundingBox();
  expect(plan?.y ?? 0, "support last, under the plan").toBeLessThan(support?.y ?? 0);

  await aside.getByRole("button", { name: /^Suporte/ }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Abrir chamado" })).toBeVisible();
});

test("the sidebar names its groups over their items, the overview under Vendas", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  const nav = sidebar(page);
  // A customer's menu is just their own pages: the team's section titles never show.
  await expect(nav.getByRole("heading", { name: "Meu negócio" })).toHaveCount(0);

  for (const [group, item] of [
    ["Vendas", "Visão geral"],
    ["Vendas", "Catálogo"],
    ["Dinheiro", "Financeiro"],
    ["Canais de venda", "Integrações"],
  ] as const) {
    const heading = nav.getByRole("heading", { name: group, exact: true });
    const named = nav.locator(".staff-nav-group").filter({ has: heading });
    await expect(heading).toBeVisible();
    await expect(named.getByRole("link", { name: item, exact: true })).toBeVisible();
  }
});

test("the header's account button opens the account menu, with no team switch for a reseller", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  // Measured before opening: the open menu hides the rest of the page from the accessibility tree.
  const button = await accountButton(page).boundingBox();

  await accountButton(page).click();

  await expect(page.getByRole("menu")).toBeVisible();
  expect(await accountMenuRows(page)).toEqual([
    "Meu perfil",
    "Meu cadastro",
    "Tema escuro",
    "Sair da conta",
  ]);
  const menu = await page.getByRole("menu").boundingBox();
  expect(menu?.y ?? 0, "menu below the button").toBeGreaterThanOrEqual(
    (button?.y ?? 0) + (button?.height ?? 0),
  );
  await page.getByRole("menuitem", { name: "Meu cadastro" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
});

test("a team account's menu has the team switch between the registration and the theme", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");

  await page
    .getByRole("banner")
    .getByRole("button", { name: /Menu do usuário/ })
    .click();
  const rows = await accountMenuRows(page);
  expect(rows).toHaveLength(5);
  expect(rows.slice(0, 3)).toEqual(["Meu perfil", "Meu cadastro", "Modo administrador"]);
  expect(rows[3]).toBe("Tema escuro");
  expect(rows[4]).toBe("Sair da conta");
});

test("signing out from the header's account menu goes to the login and ends the session", async ({
  page,
}) => {
  await signUp(page, "Revendedor Sai Da Conta");
  await gotoHydrated(page, "/dashboard");

  await accountButton(page).click();
  await page.getByRole("menuitem", { name: "Sair da conta", exact: true }).click();

  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

/*
 * Regression: the page keeps focused elements 5rem clear of its bottom edge, so focusing the
 * account button once scrolled the page by hundreds of pixels.
 */
test("focusing the account button from the keyboard does not scroll the page", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoHydrated(page, "/dashboard");
  await page
    .getByRole("banner")
    .getByRole("button", { name: /^Avisos/ })
    .focus();
  const scrolled = () =>
    page.evaluate(
      () => window.scrollY + (document.querySelector(".staff-main-panel")?.scrollTop ?? 0),
    );
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.keyboard.press("Tab");

  await expect(accountButton(page)).toBeFocused();
  expect(await scrolled()).toBe(0);
});

test("on a phone the header keeps the account and the sheet ends with Suporte", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoHydrated(page, "/dashboard");
  await expect(accountButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Navegação" });
  await expect(sheet.getByRole("link", { name: "SellBridge, visão geral" })).toBeVisible();
  const plan = await sheet.getByRole("link", { name: "Assinatura", exact: true }).boundingBox();
  const support = await sheet.getByRole("button", { name: /^Suporte/ }).boundingBox();
  expect(plan?.y ?? 0, "support last, under the plan").toBeLessThan(support?.y ?? 0);
  await expect(sheet.getByRole("button", { name: /Menu do usuário/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Fechar menu" }).click();
  await expect(sheet).toHaveCount(0);

  await accountButton(page).click();
  expect(await accountMenuRows(page)).toHaveLength(4);
  await page.getByRole("menuitem", { name: "Meu perfil", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil/);
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
