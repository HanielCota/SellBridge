import { expect, test } from "@playwright/test";
import { gotoHydrated } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

test("o fornecedor fecha a loja, vê o aviso em outra página e reabre com um clique", async ({
  page,
}) => {
  const email = await accounts.signUp(page, "Ateliê Loja Fechada E2E");
  await giveTestBrand(database, email, "Ateliê Loja Fechada E2E");

  await gotoHydrated(page, "/fornecedor/painel");
  const storeSwitch = page.getByRole("switch", { name: "Loja aberta para vendas" });
  await expect(storeSwitch).toBeChecked();
  await storeSwitch.click();
  const dialog = page.getByRole("dialog", { name: "Fechar a loja para vendas?" });
  await expect(dialog).toContainText("o estoque volta sozinho");
  await dialog.getByRole("button", { name: "Fechar loja" }).click();

  const banner = page.getByRole("note").filter({ hasText: "Sua loja está fechada para vendas" });
  await expect(banner).toBeVisible();
  await expect(storeSwitch).not.toBeChecked();

  // The banner follows the supplier on every panel page, with the way back.
  await gotoHydrated(page, "/fornecedor/painel/pedidos");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Reabrir loja" }).click();
  await expect(banner).toBeHidden();

  await gotoHydrated(page, "/fornecedor/painel");
  await expect(storeSwitch).toBeChecked();
});
