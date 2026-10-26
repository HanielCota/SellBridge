import { expect, test } from "@playwright/test";
import {
  ADMIN_USER,
  completeOnboarding,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";

test("admin vê quem vende o fornecedor e o impacto antes de desativar", async ({ browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const sellerName = `Lojista Vinculado ${stamp}`;
  const shopName = `Loja Pet ${stamp}`;
  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  await signUp(seller, sellerName);
  await completeOnboarding(seller, "Rio Pet Atacado");
  await expect(seller).toHaveURL(/\/lojas/);
  await seller.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await expect(seller.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(seller);
  await seller.getByLabel("Nome da loja").fill(shopName);
  await seller.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(
    seller.getByText(`Loja "${shopName}" conectada`).filter({ visible: true }),
  ).toBeVisible({ timeout: 20_000 });
  await sellerContext.close();

  const page = await browser.newPage();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/fornecedores?query=Rio%20Pet");
  await page
    .getByRole("link", { name: "Rio Pet Atacado" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Rio Pet Atacado" })).toBeVisible();

  // The form only asks where the supplier ships from: there is no delivery area anymore.
  await expect(page.getByText(/Cobertura|Regiões atendidas/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Lojistas vinculados" })).toBeVisible();
  await expect(page.getByRole("link", { name: sellerName })).toBeVisible();
  await expect(page.getByText(shopName)).toBeVisible();

  await page.getByRole("button", { name: "Desativar fornecedor" }).click();
  const confirm = page.getByRole("dialog", { name: "Desativar Rio Pet Atacado?" });
  await expect(confirm.getByText(/lojistas? vendem este fornecedor/)).toBeVisible();
  // Leaves the supplier active: other specs sell it.
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desativar fornecedor" })).toBeVisible();
});
