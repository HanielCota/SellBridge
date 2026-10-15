import { expect, test } from "@playwright/test";
import {
  ADMIN_USER,
  completeOnboarding,
  enableAdminMode,
  gotoHydrated,
  pickSupplier,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";

test("admin vê o fornecedor de cada loja do cliente e troca o de uma delas", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const email = await signUp(customer, "Cliente Fornecedor Admin");
  await completeOnboarding(customer, "BH Beauty Distribuidora");
  await expect(customer).toHaveURL(/\/lojas/);
  await customer.getByRole("link", { name: "Conectar Loja simulada" }).click();
  await expect(customer.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(customer);
  await customer.getByLabel("Nome da loja").fill("Loja Cliente Admin");
  await customer.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(
    customer.getByText('Loja "Loja Cliente Admin" conectada').filter({ visible: true }),
  ).toBeVisible({ timeout: 20_000 });
  await customerContext.close();

  const page = await browser.newPage();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/clientes?query=${encodeURIComponent(email)}`);
  await expect(page.getByRole("columnheader", { name: "Lojas e fornecedores" })).toBeVisible();
  await expect(
    page.getByText("BH Beauty Distribuidora").filter({ visible: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Cliente Fornecedor Admin/ }).click();
  await page
    .getByRole("region", { name: "Resumo de Cliente Fornecedor Admin" })
    .getByRole("link", { name: "Ficha completa" })
    .click();
  await expect(page.getByRole("heading", { name: "Cliente Fornecedor Admin" })).toBeVisible();
  // The team sees whether the CPF was informed, never the number.
  await expect(page.getByText("CPF informado")).toBeVisible();
  await expect(page.getByText(/\d{3}\.\d{3}\.\d{3}-\d{2}/)).toHaveCount(0);
  await expect(page.getByLabel("CEP")).toHaveCount(0);

  await page.getByRole("button", { name: "Trocar fornecedor" }).click();
  const dialog = page.getByRole("dialog", { name: "Trocar o fornecedor de Loja Cliente Admin" });
  await pickSupplier(page, "Rio Pet Atacado");
  await expect(dialog.getByText("Nenhuma publicação desta loja é afetada.")).toBeVisible();
  await dialog.getByRole("button", { name: "Trocar fornecedor" }).click();
  await expect(
    page.getByText("Fornecedor de Loja Cliente Admin atualizado").filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("Vende Rio Pet Atacado")).toBeVisible();
  await expect(
    page.getByText(/Trocou o fornecedor de uma loja para Rio Pet Atacado/),
  ).toBeVisible();
});
