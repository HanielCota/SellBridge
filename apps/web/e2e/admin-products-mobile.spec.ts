import { expect, test } from "@playwright/test";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";

/*
 * Regression: at 375 px the search box shrank to a sliver beside the origin picker (its label
 * broke into four lines) and the pager ran 8 px past the screen.
 */
test("no celular, a gestão de produtos cabe na tela", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  // The helper checks the desktop tabs; the phone size comes after.
  await enableAdminMode(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoHydrated(page, "/admin/products");
  await expect(page.getByRole("button", { name: "Próxima página" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  const search = await page
    .getByLabel("Buscar produto, código, cliente ou fornecedor")
    .boundingBox();
  expect(search?.width ?? 0).toBeGreaterThan(300);
});

/*
 * Regression: the filters' labels sat glued to their boxes ("Buscar produto…" touched the
 * search box), as the fields had no gap between label and input.
 */
test("os filtros da gestão de produtos deixam espaço entre o título e o campo", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHydrated(page, "/admin/products");

  for (const name of ["Buscar produto, código, cliente ou fornecedor", "Origem do produto"]) {
    const label = await page.locator("label", { hasText: name }).boundingBox();
    const field = await page.getByLabel(name).boundingBox();
    const gap = (field?.y ?? 0) - ((label?.y ?? 0) + (label?.height ?? 0));
    expect(gap, `space under "${name}"`).toBeGreaterThanOrEqual(6);
  }
});
