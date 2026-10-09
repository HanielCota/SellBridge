import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const APP_PAGES = [
  "/dashboard",
  "/catalogo",
  "/publicacoes",
  "/lojas",
  "/financeiro",
  "/suporte",
  "/perfil",
  "/onboarding",
];

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
  });
}
