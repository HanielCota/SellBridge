import { expect, test, type Page } from "@playwright/test";

// MVP (function 1): the seller's own-product screens are hidden; data and server functions stay
// for phase 2, so these screen tests are skipped until the feature comes back.
test.skip(true, "Own products are hidden from sellers in the MVP (phase 2).");
import { fillBillingHolder, gotoHydrated, signUp, waitForHydration } from "./helpers";

const TITLE = "Seller-owned cotton accessory";

async function createOwnProduct(page: Page) {
  await gotoHydrated(page, "/products");
  await page.getByRole("button", { name: "Cadastrar produto", exact: true }).click();
  await page.getByLabel("SKU", { exact: true }).fill(`OWN-PUBLISH-${Date.now()}`);
  await page.getByLabel("Nome do produto", { exact: true }).fill(TITLE);
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("A handmade cotton accessory shipped by this seller, with all materials described.");
  await page.getByLabel("Custo por unidade (R$)").fill("12,00");
  await page.getByLabel("Preço de venda (R$)").fill("30,00");
  await page.getByLabel("Estoque total").fill("7");
  await page.getByLabel("Categoria", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Enviar imagens", { exact: true }).setInputFiles({
    name: "product.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.getByText("Todas as alterações foram salvas", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Deixar pronto para publicar", exact: true }).click();
  await expect(page.getByText("Pronto para publicar", { exact: true })).toBeVisible();
}

test("seller-owned product publishes and archives through a supplier-free store", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Own Publishing Customer");
  await fillBillingHolder(page);
  await page.getByRole("radio", { name: /^Meus próprios produtos/ }).check();
  await page.getByRole("button", { name: "Salvar origem dos produtos", exact: true }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await page.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill("Own Publishing Store");
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await createOwnProduct(page);
  await page.getByRole("link", { name: "Publicar produto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova publicação", exact: true })).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Meus produtos", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(TITLE);
  await expect(page.getByText("Enviado por você", { exact: true })).toBeVisible();
  await expect(page.getByText("Enviado pelo fornecedor", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Publicar em 1 loja", exact: true }).click();
  await expect(page).toHaveURL(/\/publicacoes(?:\?|$)/);
  await expect(
    page.getByText("No ar na Own Publishing Store", { exact: true }).filter({ visible: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Seu produto", { exact: true })).toBeVisible();
  await gotoHydrated(page, "/products");
  await page.getByRole("button", { name: "Editar produto", exact: true }).click();
  await page.getByRole("button", { name: "Arquivar produto", exact: true }).click();
  await expect(page.getByText("Arquivado", { exact: true })).toBeVisible();
  await gotoHydrated(page, "/publicacoes");
  await expect(page.getByText("Produto indisponível", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Este produto está indisponível. Os anúncios ficam pausados até ele estar disponível novamente e você reativá-los.",
      { exact: true },
    ),
  ).toBeVisible();
});
