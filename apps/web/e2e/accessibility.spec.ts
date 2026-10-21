import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";

const APP_PAGES = [
  "/dashboard",
  "/catalogo",
  "/publicacoes",
  "/pedidos",
  "/fornecedores",
  "/lojas",
  "/financeiro",
  "/suporte",
  "/perfil",
  "/onboarding",
];

/** Team pages, opened as the admin in admin mode. */
const TEAM_PAGES = ["/admin/auditoria"];

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => `${node.html.slice(0, 120)} → ${node.failureSummary ?? ""}`).join(" | ")}`,
  );
}

for (const theme of ["dark", "light"] as const) {
  test(`páginas sem problemas de acessibilidade no tema ${theme === "dark" ? "escuro" : "claro"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.addInitScript((value) => localStorage.setItem("sellbridge-theme", value), theme);
    await gotoHydrated(page, "/login");
    expect(await violations(page), "/login").toEqual([]);
    await signIn(page, DEMO_USER);
    for (const path of APP_PAGES) {
      await gotoHydrated(page, path);
      expect(await violations(page), path).toEqual([]);
    }
    // An order page, reached the way the reseller reaches it: from the operations list.
    await gotoHydrated(page, "/pedidos");
    await page.locator('a[href^="/pedidos/"]').first().click();
    await expect(page.getByRole("heading", { level: 1, name: /^Pedido / })).toBeVisible();
    expect(await violations(page), "/pedidos/$orderId").toEqual([]);
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`páginas da equipe sem problemas de acessibilidade no tema ${theme === "dark" ? "escuro" : "claro"}`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem("sellbridge-theme", value), theme);
    await signIn(page, ADMIN_USER);
    await enableAdminMode(page);
    for (const path of TEAM_PAGES) {
      await gotoHydrated(page, path);
      expect(await violations(page), path).toEqual([]);
    }
  });
}
