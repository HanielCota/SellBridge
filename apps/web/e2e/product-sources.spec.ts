import { expect, test } from "@playwright/test";
import { fillBillingHolder, gotoHydrated, pickSupplier, signUp } from "./helpers";

// MVP (function 1): the platform sells only supplier products, so the onboarding asks only for
// the supplier; the own and mixed choices are gone and the saved mode is always "suppliers".
test("the supplier step works on a phone and needs a supplier to continue", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signUp(page, "Mobile Supplier Customer");
  await fillBillingHolder(page);
  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "De qual fornecedor você vai vender os produtos?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Meus próprios produtos/ })).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: /^Produtos próprios e de fornecedores/ }),
  ).toHaveCount(0);
  const save = page.getByRole("button", { name: "Salvar fornecedor", exact: true });
  await expect(save).toBeDisabled();
  await pickSupplier(page, "BH Beauty Distribuidora");
  await expect(save).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath("supplier-step-mobile.png"), fullPage: true });
  await save.click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
});

test("the profile shows the chosen supplier and lets the seller change it", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Profile Supplier Customer");
  await fillBillingHolder(page, "Profile Supplier Customer");
  await pickSupplier(page, "BH Beauty Distribuidora");
  await page.getByRole("button", { name: "Salvar fornecedor", exact: true }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await gotoHydrated(page, "/onboarding");
  await expect(page.getByRole("heading", { name: "Seu fornecedor", exact: true })).toBeVisible();
  await expect(page.getByText("BH Beauty Distribuidora", { exact: true })).toBeVisible();
  await expect(page.getByText("Meus próprios produtos", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Trocar fornecedor", exact: true }).click();
  await expect(page).toHaveURL(/step=supplier/);
  await expect(page.getByRole("radio", { name: /BH Beauty Distribuidora/ })).toBeChecked();
});
