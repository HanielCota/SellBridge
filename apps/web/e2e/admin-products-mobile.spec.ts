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
