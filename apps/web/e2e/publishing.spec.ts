import { expect, test, type Page } from "@playwright/test";
import { gotoHydrated, signUp } from "./helpers";

async function onboardInBeloHorizonte(page: Page) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("CEP").fill("30130010");
  await page.getByRole("button", { name: "Salvar região" }).click();
  await expect(page).toHaveURL(/\/fornecedores/);
}

async function connectMockStore(page: Page, shopName: string) {
  await gotoHydrated(page, "/lojas");
  await expect(page.getByText("Nenhuma loja conectada")).toBeVisible();
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();

  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Nome da loja").fill(shopName);
  await page.getByRole("button", { name: "Autorizar acesso" }).click();

  await expect(page).toHaveURL(/\/lojas/);
  await expect(page.getByText(`Loja "${shopName}" conectada com sucesso`)).toBeVisible();
  await expect(page.getByText(shopName, { exact: true })).toBeVisible();
  await expect(page.getByText("Conectada", { exact: true })).toBeVisible();
}

async function openPublishFormForFirstProduct(page: Page) {
  await gotoHydrated(page, "/fornecedores");
  await page.getByRole("link", { name: "BH Beauty Distribuidora" }).click();
  await page.getByLabel("Somente com estoque").click();
  await expect(page).toHaveURL(/inStock=true/);
  await page.getByRole("link", { name: "Publicar" }).first().click();
  await expect(page.getByRole("heading", { name: "Nova publicação" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("conecta loja simulada, publica produto e acompanha o status", async ({ page }) => {
  await signUp(page, "Revendedora Publicação");
  await onboardInBeloHorizonte(page);
  await connectMockStore(page, "Loja E2E");

  await openPublishFormForFirstProduct(page);
  await expect(page.getByText("Lucro estimado")).toBeVisible();
  await page.getByLabel("Título").fill("Produto publicado pelo teste E2E");
  await page.getByRole("button", { name: "Publicar" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(page.getByText("Produto publicado pelo teste E2E")).toBeVisible();
  await expect(page.getByText("Publicado", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Ver anúncio" })).toBeVisible();
});

test("mostra erro com motivo e permite reprocessar", async ({ page }) => {
  await signUp(page, "Revendedor Erro");
  await onboardInBeloHorizonte(page);
  await connectMockStore(page, "Loja Recusa");

  await openPublishFormForFirstProduct(page);
  await page.getByLabel("Título").fill("Produto recusado [falha] no marketplace");
  await page.getByRole("button", { name: "Publicar" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(page.getByText("Erro", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("Anúncio recusado: o título contém termos não permitidos"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reprocessar" }).click();
  await expect(page.getByText("Publicação reenviada para a fila")).toBeVisible();
  await expect(page.getByText("Erro", { exact: true })).toBeVisible({ timeout: 20_000 });
});

test("valida o formulário de publicação e bloqueia preço abaixo do custo", async ({ page }) => {
  await signUp(page, "Revendedor Validação");
  await onboardInBeloHorizonte(page);
  await connectMockStore(page, "Loja Validação");

  await openPublishFormForFirstProduct(page);
  await page.getByLabel("Título").fill("curto");
  await page.getByLabel("Preço de venda (R$)").fill("0,01");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("O título deve ter ao menos 10 caracteres")).toBeVisible();

  await page.getByLabel("Título").fill("Título válido para o anúncio");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(
    page.getByText("O preço de venda precisa ser maior que o custo do fornecedor"),
  ).toBeVisible();
});

test("publicar sem lojas conectadas leva à conexão de loja", async ({ page }) => {
  await signUp(page, "Revendedor Sem Loja");
  await onboardInBeloHorizonte(page);
  await openPublishFormForFirstProduct(page);
  await expect(page.getByText("Conecte uma loja antes de publicar")).toBeVisible();
  await page.getByRole("link", { name: "Conectar loja" }).click();
  await expect(page).toHaveURL(/\/lojas/);
});

test("desconecta uma loja após confirmação", async ({ page }) => {
  await signUp(page, "Revendedor Desconecta");
  await onboardInBeloHorizonte(page);
  await connectMockStore(page, "Loja Temporária");
  await page.getByRole("button", { name: "Desconectar" }).click();
  await expect(page.getByRole("dialog")).toContainText("Desconectar Loja Temporária?");
  await page.getByRole("dialog").getByRole("button", { name: "Desconectar" }).click();
  await expect(page.getByText("Loja desconectada")).toBeVisible();
  await expect(page.getByText("Nenhuma loja conectada")).toBeVisible();
});
