import { expect, test, type Page } from "@playwright/test";
import { fillBillingHolder, pickSupplier, signUp } from "./helpers";

async function reachSupplierStep(page: Page) {
  await signUp(page, "Browsing Setup Customer");
  await fillBillingHolder(page);
  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
}

test("a new reseller leaves the supplier step after looking at a supplier", async ({ page }) => {
  test.setTimeout(120_000);
  await reachSupplierStep(page);
  await pickSupplier(page, "BH Beauty Distribuidora");
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await page.getByRole("navigation").getByRole("link", { name: "Pedidos", exact: true }).click();

  await expect(page).toHaveURL(/\/pedidos(?:\?|$)/);
  expect(dialogs).toEqual([]);
});
