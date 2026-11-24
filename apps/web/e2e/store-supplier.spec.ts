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

test("cada loja vende os fornecedores escolhidos, adicionados e tirados depois", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page, "Revendedora Duas Lojas");
  await completeOnboarding(page, "BH Beauty Distribuidora");
  await expect(page).toHaveURL(/\/lojas/);

  // The first shop sells the supplier picked during onboarding, without asking again.
  await expect(page.getByText("A nova loja vende")).toBeVisible();
  await expect(page.getByText("BH Beauty Distribuidora", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await authorizeMockStore(page, "Loja Beleza");
  await expect(storeRow(page, "Loja Beleza").getByText("BH Beauty Distribuidora")).toBeVisible();

  // A second shop waits for its own supplier.
  await expect(page.getByText("Nenhum fornecedor escolhido")).toBeVisible();
  await expect(page.getByRole("link", { name: "Conectar Mercado Livre" })).toHaveCount(0);
  await page.getByRole("button", { name: "Escolher", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Fornecedor da nova loja" });
  await pickSupplier(page, "Rio Pet Atacado");
  await picker.getByRole("button", { name: "Usar este fornecedor" }).click();
  await page.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await authorizeMockStore(page, "Loja Pet");
  await expect(storeRow(page, "Loja Pet").getByText("Rio Pet Atacado")).toBeVisible();

  // A shop adds a second supplier and keeps the first.
  await page.getByRole("button", { name: "Opções de Loja Beleza" }).click();
  await page.getByRole("menuitem", { name: "Fornecedores da loja" }).click();
  const suppliers = page.getByRole("dialog");
  await expect(
    suppliers.getByRole("heading", { name: "Fornecedores de Loja Beleza" }),
  ).toBeVisible();
  await expect(suppliers.getByText("a loja precisa vender pelo menos um")).toBeVisible();
  await suppliers.getByRole("button", { name: "Adicionar fornecedor" }).click();
  await expect(
    suppliers.getByRole("heading", { name: "Adicionar fornecedor a Loja Beleza" }),
  ).toBeVisible();
  await pickSupplier(page, "Rio Pet Atacado");
  await suppliers.getByRole("button", { name: "Adicionar fornecedor" }).click();
  await expect(
    page.getByText("Rio Pet Atacado adicionado a Loja Beleza").filter({ visible: true }),
  ).toBeVisible();
  await expect(suppliers.getByRole("button", { name: "Tirar Rio Pet Atacado" })).toBeVisible();
  await suppliers.getByRole("button", { name: "Pronto" }).click();
  await expect(
    storeRow(page, "Loja Beleza").getByText("BH Beauty Distribuidora e Rio Pet Atacado"),
  ).toBeVisible();

  // Removing one shows what happens to its listings before it goes.
  await page.getByRole("button", { name: "Opções de Loja Beleza" }).click();
  await page.getByRole("menuitem", { name: "Fornecedores da loja" }).click();
  await suppliers.getByRole("button", { name: "Tirar BH Beauty Distribuidora" }).click();
  await expect(
    suppliers.getByRole("heading", { name: "Tirar BH Beauty Distribuidora de Loja Beleza" }),
  ).toBeVisible();
  await expect(suppliers.getByText("Nenhum anúncio desta loja é afetado.")).toBeVisible();
  await suppliers.getByRole("button", { name: "Tirar fornecedor" }).click();
  await expect(
    page
      .getByText("BH Beauty Distribuidora não é mais fornecedor de Loja Beleza")
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(suppliers.getByRole("button", { name: /^Tirar/ })).toHaveCount(0);
  await suppliers.getByRole("button", { name: "Pronto" }).click();
  await expect(storeRow(page, "Loja Beleza").getByText("Rio Pet Atacado")).toBeVisible();

  // No shop sells BH Beauty anymore: its products can't be published until one does.
  await gotoHydrated(page, "/fornecedores");
  await page.getByRole("link", { name: "BH Beauty Distribuidora" }).click();
  await page.getByLabel("Só com estoque").click();
  await expect(page).toHaveURL(/inStock=true/);
  await expect(
    page.getByText("Para publicar, adicione este fornecedor a uma das suas lojas."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar" }).first()).toBeDisabled();
  await page.getByRole("link", { name: "Vender os produtos dele" }).click();

  // The shops already connected can start selling it right there.
  await expect(page).toHaveURL(/\/lojas/);
  const addStore = page.getByRole("region", { name: "Adicionar loja" });
  await expect(
    addStore.getByText("Vender BH Beauty Distribuidora numa loja que você já tem"),
  ).toBeVisible();
  await addStore
    .getByRole("button", { name: "Adicionar BH Beauty Distribuidora a Loja Beleza" })
    .click();
  await expect(
    page.getByText("BH Beauty Distribuidora adicionado a Loja Beleza").filter({ visible: true }),
  ).toBeVisible();
  await expect(
    addStore.getByRole("listitem").filter({ hasText: "Loja Beleza" }).getByText("Já vende"),
  ).toBeVisible();
  await expect(
    storeRow(page, "Loja Beleza").getByText("Rio Pet Atacado e BH Beauty Distribuidora"),
  ).toBeVisible();

  // A new shop can still start with that supplier picked.
  await expect(page.getByText("BH Beauty Distribuidora", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Conectar Mercado Livre" }).click();

  // A name the account already uses is refused, ignoring case.
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill("loja pet");
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page.getByText('O nome "loja pet" não está disponível')).toBeVisible({
    timeout: SETTLE_TIMEOUT,
  });
  await expect(page).toHaveURL(/\/__e2e\/consent/);

  await authorizeMockStore(page, "Loja Beleza Nova");
  await expect(
    storeRow(page, "Loja Beleza Nova").getByText("BH Beauty Distribuidora"),
  ).toBeVisible();

  // The catalog of a shop with two suppliers shows both, and filters by one of them.
  await gotoHydrated(page, "/catalogo");
  await page.getByRole("combobox", { name: "Loja" }).click();
  await page.getByRole("option", { name: /^Loja Beleza · / }).click();
  await expect(
    page.getByText(
      "Produtos de Rio Pet Atacado e BH Beauty Distribuidora para a loja Loja Beleza.",
    ),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Fornecedor" }).click();
  await page.getByRole("option", { name: "BH Beauty Distribuidora" }).click();
  await expect(page).toHaveURL(/supplier=/);
  await expect(
    page.getByText("Produtos de BH Beauty Distribuidora para a loja Loja Beleza."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver fornecedor" })).toBeVisible();
});
