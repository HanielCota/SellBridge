import { expect, test, type Page } from "@playwright/test";
import { gotoHydrated, signUp, waitForHydration } from "./helpers";

async function onboardInBeloHorizonte(page: Page) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("CEP").fill("30130010");
  await page.getByRole("button", { name: "Salvar região" }).click();
  await expect(page).toHaveURL(/\/fornecedores/);
}

async function connectMockStore(page: Page, shopName: string) {
  await gotoHydrated(page, "/lojas");
  await expect(page.getByText("Nenhuma loja conectada").filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();

  // The consent page arrives through a server redirect, i.e. a full page load.
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill(shopName);
  await page.getByRole("button", { name: "Autorizar acesso" }).click();

  await expect(page).toHaveURL(/\/lojas/);
  await expect(
    page.getByText(`Loja "${shopName}" conectada com sucesso`).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText(shopName, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(
    page.getByText("Conectada", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
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
  await expect(page.getByText("Lucro estimado").filter({ visible: true })).toBeVisible();
  await page.getByLabel("Título").fill("Produto publicado pelo teste E2E");
  await page.getByRole("button", { name: "Publicar" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(
    page.getByText("Produto publicado pelo teste E2E").filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("Publicado", { exact: true }).filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("link", { name: "Ver anúncio em Loja E2E" })).toBeVisible();
  await expect(page.getByText("Simulada", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/^margem de \d+%$/).filter({ visible: true })).toBeVisible();
});

test("edita preço, pausa e reativa uma publicação", async ({ page }) => {
  await signUp(page, "Revendedora Ações");
  await onboardInBeloHorizonte(page);
  await connectMockStore(page, "Loja Ações");
  await openPublishFormForFirstProduct(page);
  await page.getByLabel("Título").fill("Produto com ações");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Publicado", { exact: true }).filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Ações de Produto com ações" }).click();
  await page.getByRole("menuitem", { name: "Editar preço" }).click();
  const price = page.getByLabel("Preço de venda (R$)");
  await price.fill("0,50");
  await expect(
    page.getByText(/O preço precisa ser maior que o custo/).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar preço" })).toBeDisabled();
  await price.fill("999,90");
  await page.getByRole("button", { name: "Salvar preço" }).click();
  await expect(page.getByText(/^Preço atualizado/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("R$ 999,90").filter({ visible: true })).toBeVisible();

  await page.getByRole("button", { name: "Ações de Produto com ações" }).click();
  await page.getByRole("menuitem", { name: "Pausar" }).click();
  await expect(page.getByText("Pausado em 1 loja").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Pausado", { exact: true }).filter({ visible: true })).toBeVisible();

  await page.getByRole("checkbox", { name: "Selecionar Produto com ações" }).click();
  await page
    .getByRole("region", { name: "Ações em lote" })
    .getByRole("button", { name: "Reativar" })
    .click();
  await expect(page.getByText("Reativado em 1 loja").filter({ visible: true })).toBeVisible();
  await expect(
    page.getByText("Publicado", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Ações em lote" })).toHaveCount(0);
});

test("mostra erro com motivo e permite reprocessar", async ({ page }) => {
  await signUp(page, "Revendedor Erro");
  await onboardInBeloHorizonte(page);
  await connectMockStore(page, "Loja Recusa");

  await openPublishFormForFirstProduct(page);
  await page.getByLabel("Título").fill("Produto recusado [falha] no marketplace");
  await page.getByRole("button", { name: "Publicar" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(page.getByText("Erro", { exact: true }).filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page
      .getByText("Anúncio recusado: o título contém termos não permitidos")
      .filter({ visible: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reprocessar" }).click();
  await expect(
    page.getByText("Publicação reenviada para a fila").filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("Erro", { exact: true }).filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });
});

test("valida o formulário de publicação e bloqueia preço abaixo do custo", async ({ page }) => {
  await signUp(page, "Revendedor Validação");
  await onboardInBeloHorizonte(page);
  await connectMockStore(page, "Loja Validação");

  await openPublishFormForFirstProduct(page);
  await page.getByLabel("Título").fill("curto");
  await page.getByLabel("Preço de venda (R$)").fill("0,01");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(
    page.getByText("O título deve ter ao menos 10 caracteres").filter({ visible: true }),
  ).toBeVisible();

  await page.getByLabel("Título").fill("Título válido para o anúncio");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(
    page
      .getByText("O preço de venda precisa ser maior que o custo do fornecedor")
      .filter({ visible: true }),
  ).toBeVisible();
});

test("publicar sem lojas conectadas leva à conexão de loja", async ({ page }) => {
  await signUp(page, "Revendedor Sem Loja");
  await onboardInBeloHorizonte(page);
  await openPublishFormForFirstProduct(page);
  await expect(
    page.getByText("Conecte uma loja antes de publicar").filter({ visible: true }),
  ).toBeVisible();
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
  await expect(page.getByText("Loja desconectada").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Nenhuma loja conectada").filter({ visible: true })).toBeVisible();
});

test("publica vários produtos do catálogo de uma vez com regra de preço", async ({ page }) => {
  await signUp(page, "Revendedora Lote");
  await onboardInBeloHorizonte(page);
  await connectMockStore(page, "Loja Lote");

  await gotoHydrated(page, "/catalogo");
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  const boxes = page.getByRole("checkbox", { name: /^Selecionar / });
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await page.getByRole("button", { name: "Publicar selecionados" }).click();

  const dialog = page.getByRole("dialog", { name: "Publicar 2 produtos" });
  await expect(dialog.getByText("Loja Lote").filter({ visible: true })).toBeVisible();
  await dialog.getByLabel("Percentual sobre o custo").fill("2");
  await expect(
    dialog.getByText("Use um valor entre 5% e 300%").filter({ visible: true }),
  ).toBeVisible();
  await dialog.getByLabel("Percentual sobre o custo").fill("80");
  await expect(dialog.getByText(/,90$/).filter({ visible: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Publicar 2 produtos" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(
    page.getByText("2 produtos enviados para publicação").filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Publicado", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({
    timeout: 20_000,
  });

  await gotoHydrated(page, "/catalogo");
  await expect(page.getByText("Publicado", { exact: true }).filter({ visible: true })).toHaveCount(
    2,
  );
});
