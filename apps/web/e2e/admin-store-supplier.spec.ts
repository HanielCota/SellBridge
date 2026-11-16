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

test("admin vê os fornecedores de cada loja do cliente, adiciona um e tira outro", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const email = await signUp(customer, "Cliente Fornecedor Admin");
  await completeOnboarding(customer, "BH Beauty Distribuidora");
  await expect(customer).toHaveURL(/\/lojas/);
  await customer.getByRole("link", { name: "Conectar Mercado Livre" }).click();
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

  // The team adds a second supplier to the shop, as the customer would.
  await page.getByRole("button", { name: "Fornecedores de Loja Cliente Admin" }).click();
  const suppliers = page.getByRole("dialog");
  await expect(
    suppliers.getByRole("heading", { name: "Fornecedores de Loja Cliente Admin" }),
  ).toBeVisible();
  await suppliers.getByRole("button", { name: "Adicionar fornecedor" }).click();
  await pickSupplier(page, "Rio Pet Atacado");
  await suppliers.getByRole("button", { name: "Adicionar fornecedor" }).click();
  await expect(
    page.getByText("Rio Pet Atacado adicionado a Loja Cliente Admin").filter({ visible: true }),
  ).toBeVisible();

  // Removing one shows what happens to the customer's listings before it goes.
  await suppliers.getByRole("button", { name: "Tirar BH Beauty Distribuidora" }).click();
  await expect(suppliers.getByText("Nenhum anúncio desta loja é afetado.")).toBeVisible();
  await suppliers.getByRole("button", { name: "Tirar fornecedor" }).click();
  await expect(
    page
      .getByText("BH Beauty Distribuidora não é mais fornecedor de Loja Cliente Admin")
      .filter({ visible: true }),
  ).toBeVisible();
  await suppliers.getByRole("button", { name: "Pronto" }).click();
  await expect(page.getByText("Vende Rio Pet Atacado")).toBeVisible();
  await expect(page.getByText("Adicionou Rio Pet Atacado a uma loja")).toBeVisible();
  await expect(page.getByText("Tirou BH Beauty Distribuidora de uma loja")).toBeVisible();
});
