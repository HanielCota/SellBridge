import { expect, test } from "@playwright/test";
import { fillBillingHolder, gotoHydrated, pickSupplier, signUp, waitForHydration } from "./helpers";

test("product source choices remain usable on a phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page, "Mobile Source Customer");
  await fillBillingHolder(page);
  await expect(
    page.getByRole("radio", { name: /^Produtos próprios e de fornecedores/ }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Meus próprios produtos/ }).check();
  await expect(
    page.getByRole("button", { name: "Salvar origem dos produtos", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("product-sources-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Salvar origem dos produtos", exact: true }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
});

test("own-only onboarding completes without a supplier and connects a seller store", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Own Product Customer");
  await fillBillingHolder(page, "Own Product Customer");
  await page.getByRole("radio", { name: /^Meus próprios produtos/ }).check();
  await expect(page.getByLabel("Buscar fornecedor por nome, nicho ou produto")).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar origem dos produtos", exact: true }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await expect(page.getByText("Esta loja venderá seus próprios produtos.")).toBeVisible();
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill("Own Products Store");
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "Own Products Store", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Seus produtos · estoque e envio por sua conta")).toBeVisible();
  await gotoHydrated(page, "/dashboard");
  await expect(page.getByRole("link", { name: "Abrir meus produtos", exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Editar origem dos produtos", exact: true }),
  ).toBeVisible();
  await gotoHydrated(page, "/onboarding");
  await expect(page.getByRole("heading", { name: "Meu cadastro", exact: true })).toBeVisible();
  await expect(page.getByText("Meus próprios produtos", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Nome completo", { exact: true })).toHaveValue(
    "Own Product Customer",
  );
});

test("source choices warn before leaving, resume after save, and keep an existing store", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Mixed Product Customer");
  await fillBillingHolder(page, "Mixed Product Customer");
  await page.getByRole("radio", { name: /^Produtos próprios e de fornecedores/ }).check();
  await expect(
    page.getByRole("button", { name: "Salvar origem dos produtos", exact: true }),
  ).toBeDisabled();
  await pickSupplier(page, "BH Beauty Distribuidora");
  await page.getByRole("button", { name: "Salvar origem dos produtos", exact: true }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill("Mixed Products Store");
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await gotoHydrated(page, "/onboarding?step=supplier");
  await expect(
    page.getByRole("radio", { name: /^Produtos próprios e de fornecedores/ }),
  ).toBeChecked();
  await expect(page.getByRole("radio", { name: /BH Beauty Distribuidora/ })).toBeChecked();
  await page.getByRole("radio", { name: /^Meus próprios produtos/ }).check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "Voltar ao painel", exact: true }).click();
  await expect(page).toHaveURL(/step=supplier/);
  await page.getByRole("button", { name: "Salvar origem dos produtos", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.getByRole("link", { name: "Editar origem dos produtos", exact: true }).click();
  await expect(page.getByRole("radio", { name: /^Meus próprios produtos/ })).toBeChecked();
  await gotoHydrated(page, "/lojas");
  const store = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Mixed Products Store", exact: true }) });
  await expect(store.getByText("BH Beauty Distribuidora", { exact: true })).toBeVisible();
});
