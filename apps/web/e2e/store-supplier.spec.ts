import { expect, test, type Page } from "@playwright/test";
import {
  completeOnboarding,
  gotoHydrated,
  pickSupplier,
  signUp,
  waitForHydration,
} from "./helpers";

/** Worker round trip and a busy dev server before the stores page settles. */
const SETTLE_TIMEOUT = 20_000;

async function authorizeMockStore(page: Page, shopName: string) {
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill(shopName);
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page).toHaveURL(/\/lojas/);
  await expect(
    page.getByText(`Loja "${shopName}" conectada`).filter({ visible: true }),
  ).toBeVisible({ timeout: SETTLE_TIMEOUT });
}

function storeRow(page: Page, shopName: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: shopName }) });
}

test("cada loja vende um único fornecedor, escolhido ao conectar e trocado depois", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Revendedora Duas Lojas");
  await completeOnboarding(page, "BH Beauty Distribuidora");
  await expect(page).toHaveURL(/\/lojas/);

  // The first shop sells the supplier picked during onboarding, without asking again.
  await expect(page.getByText("A nova loja vende")).toBeVisible();
  await expect(page.getByText("BH Beauty Distribuidora", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();
  await authorizeMockStore(page, "Loja Beleza");
  await expect(storeRow(page, "Loja Beleza").getByText("BH Beauty Distribuidora")).toBeVisible();

  // A second shop waits for its own supplier.
  await expect(page.getByText("Nenhum fornecedor escolhido")).toBeVisible();
  await expect(page.getByRole("link", { name: "Conectar Loja simulada" })).toHaveCount(0);
  await page.getByRole("button", { name: "Escolher", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Fornecedor da nova loja" });
  await pickSupplier(page, "Rio Pet Atacado");
  await picker.getByRole("button", { name: "Usar este fornecedor" }).click();
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();
  await authorizeMockStore(page, "Loja Pet");
  await expect(storeRow(page, "Loja Pet").getByText("Rio Pet Atacado")).toBeVisible();

  // Changing the supplier of a shop shows the impact first.
  await page.getByRole("button", { name: "Opções de Loja Beleza" }).click();
  await page.getByRole("menuitem", { name: "Trocar fornecedor" }).click();
  const change = page.getByRole("dialog", { name: "Trocar o fornecedor de Loja Beleza" });
  await pickSupplier(page, "Rio Pet Atacado");
  await expect(change.getByText("Nenhuma publicação desta loja é afetada.")).toBeVisible();
  await change.getByRole("button", { name: "Salvar fornecedor" }).click();
  await expect(
    page.getByText("Fornecedor de Loja Beleza atualizado").filter({ visible: true }),
  ).toBeVisible();
  await expect(storeRow(page, "Loja Beleza").getByText("Rio Pet Atacado")).toBeVisible();

  // No shop sells BH Beauty anymore: its products can't be published until one does.
  await gotoHydrated(page, "/fornecedores");
  await page.getByRole("link", { name: "BH Beauty Distribuidora" }).click();
  await page.getByLabel("Somente com estoque").click();
  await expect(page).toHaveURL(/inStock=true/);
  await page.getByRole("link", { name: "Publicar" }).first().click();
  await expect(page.getByText("Nenhuma loja vende BH Beauty Distribuidora")).toBeVisible();
  await page.getByRole("link", { name: "Conectar uma loja para este fornecedor" }).click();

  // The new shop comes with that supplier picked, so connecting it unblocks publishing.
  await expect(page).toHaveURL(/\/lojas/);
  await expect(page.getByText("BH Beauty Distribuidora", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();

  // A name the account already uses is refused, ignoring case.
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill("loja pet");
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page.getByText('O nome "loja pet" não está disponível')).toBeVisible({
    timeout: SETTLE_TIMEOUT,
  });
  await expect(page).toHaveURL(/\/oauth\/mock\/autorizar/);

  await authorizeMockStore(page, "Loja Beleza Nova");
  await expect(
    storeRow(page, "Loja Beleza Nova").getByText("BH Beauty Distribuidora"),
  ).toBeVisible();
});
