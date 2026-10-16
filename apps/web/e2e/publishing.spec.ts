import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, gotoHydrated, signUp, waitForHydration } from "./helpers";

/** Worker round trip (queue + mocked marketplace latency) before a status settles. */
const STATUS_TIMEOUT = 20_000;

/** The status line of a listing card ("No ar na Loja X", "Erro na Loja X"...). */
function cardStatus(page: Page, status: string) {
  return page.getByText(status, { exact: true }).filter({ visible: true });
}

async function onboardWithBhBeauty(page: Page) {
  await expect(page).toHaveURL(/\/onboarding/);
  await completeOnboarding(page, "BH Beauty Distribuidora");
  // Next setup step: connect a store.
  await expect(page).toHaveURL(/\/lojas/);
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
  // The toast only shows once /lojas hydrates, which a busy dev server can take a while to do.
  await expect(
    page.getByText(`Loja "${shopName}" conectada`).filter({ visible: true }),
  ).toBeVisible({ timeout: STATUS_TIMEOUT });
  await expect(page.getByText(shopName, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(
    page.getByText("Conectada", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
}

/** The supplier's cost shown on the publish form, plus one cent, in the field's format. */
async function centAboveCost(page: Page): Promise<string> {
  const hint = await page.locator("#price-hint").innerText();
  const match = /Custo do fornecedor:\s*R\$\s*([\d.]+),(\d{2})/.exec(hint);
  if (!match) throw new Error(`Custo não encontrado em: ${hint}`);
  const cents = Number(`${match[1]?.replaceAll(".", "")}${match[2]}`) + 1;
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
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
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja E2E");

  await openPublishFormForFirstProduct(page);
  await expect(page.getByText("Lucro estimado").filter({ visible: true })).toBeVisible();
  await page.getByLabel("Título").fill("Produto publicado pelo teste E2E");
  await page.getByRole("button", { name: "Publicar" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(
    page.getByText("Produto publicado pelo teste E2E").filter({ visible: true }),
  ).toBeVisible();
  await expect(cardStatus(page, "No ar na Loja E2E")).toBeVisible({ timeout: STATUS_TIMEOUT });
  await expect(page.getByText(/^margem \d+%$/).filter({ visible: true })).toBeVisible();
  // The marketplace ad is one click away, in the card's menu.
  await page.getByRole("button", { name: "Ações de Produto publicado pelo teste E2E" }).click();
  await expect(page.getByRole("menuitem", { name: /^Loja E2E/ })).toHaveAttribute(
    "href",
    /\/oauth\/mock\/anuncio\//,
  );
});

test("avisa a descrição que não chegou ao marketplace e reenvia", async ({ page }) => {
  await signUp(page, "Revendedora Descrição");
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja Descrição");

  // The mock marketplace takes the listing but refuses the description of this title.
  await openPublishFormForFirstProduct(page);
  await page.getByLabel("Título").fill("Produto lindo [sem descricao]");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(cardStatus(page, "No ar na Loja Descrição")).toBeVisible({
    timeout: STATUS_TIMEOUT,
  });
  const card = page.getByRole("article", { name: "Produto lindo [sem descricao]" });
  await expect(card.getByText("Descrição não enviada")).toBeVisible({ timeout: STATUS_TIMEOUT });

  await card.getByRole("button", { name: "Reenviar descrição" }).click();
  await expect(page.getByText(/^Descrição reenviada/).filter({ visible: true })).toBeVisible();
  await expect(card.getByText("Descrição não enviada")).toBeHidden({ timeout: STATUS_TIMEOUT });
});

test("não deixa publicar o mesmo produto duas vezes na mesma loja", async ({ page }) => {
  await signUp(page, "Revendedora Duplicado");
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja Única");

  await openPublishFormForFirstProduct(page);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page).toHaveURL(/\/publicacoes/);

  // Same product again: the store that already has it is shown and cannot be chosen.
  await openPublishFormForFirstProduct(page);
  const store = page.getByRole("checkbox", { name: /Loja Única/ });
  await expect(store).toBeDisabled();
  await expect(store).not.toBeChecked();
  await expect(page.getByText("Já publicado aqui").filter({ visible: true })).toBeVisible();
});

test("edita preço, pausa e reativa uma publicação", async ({ page }) => {
  await signUp(page, "Revendedora Ações");
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja Ações");
  await openPublishFormForFirstProduct(page);
  const justAboveCost = await centAboveCost(page);
  await page.getByLabel("Título").fill("Produto com ações");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(cardStatus(page, "No ar na Loja Ações")).toBeVisible({ timeout: STATUS_TIMEOUT });

  await page.getByRole("button", { name: "Ações de Produto com ações" }).click();
  await page.getByRole("menuitem", { name: "Editar preço" }).click();
  const price = page.getByLabel("Preço de venda (R$)");
  await price.fill("0,50");
  await expect(
    page.getByText(/O preço precisa ser maior que o custo/).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar preço" })).toBeDisabled();
  // Above the cost but under the break-even: the dialog names the lowest price that pays.
  await price.fill(justAboveCost);
  await expect(
    page
      .getByText(/Abaixo de R\$\s[\d.,]+ você tem prejuízo depois das taxas/)
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar preço" })).toBeDisabled();
  await price.fill("999,90");
  await page.getByRole("button", { name: "Salvar preço" }).click();
  await expect(page.getByText(/^Preço atualizado/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("R$ 999,90").filter({ visible: true })).toBeVisible();

  await page.getByRole("button", { name: "Ações de Produto com ações" }).click();
  await page.getByRole("menuitem", { name: "Pausar" }).click();
  await expect(page.getByText("Pausado em 1 loja").filter({ visible: true })).toBeVisible();
  await expect(cardStatus(page, "Pausado na Loja Ações")).toBeVisible();
  // Pausing keeps the menu open so the new state shows in place; close it to reach the card.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Ações de Produto com ações" })).toBeHidden();

  await page.getByRole("checkbox", { name: "Selecionar Produto com ações" }).click();
  await page
    .getByRole("region", { name: "Ações em lote" })
    .getByRole("button", { name: "Reativar" })
    .click();
  await expect(page.getByText("Reativado em 1 loja").filter({ visible: true })).toBeVisible();
  await expect(cardStatus(page, "No ar na Loja Ações")).toBeVisible();
  await expect(page.getByRole("region", { name: "Ações em lote" })).toHaveCount(0);
});

test("mostra erro com motivo e permite reprocessar", async ({ page }) => {
  await signUp(page, "Revendedor Erro");
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja Recusa");

  await openPublishFormForFirstProduct(page);
  await page.getByLabel("Título").fill("Produto recusado [falha] no marketplace");
  await page.getByRole("button", { name: "Publicar" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(cardStatus(page, "Erro na Loja Recusa")).toBeVisible({ timeout: STATUS_TIMEOUT });
  await expect(
    page
      .getByText("Anúncio recusado: o título contém termos não permitidos")
      .filter({ visible: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reprocessar" }).click();
  await expect(
    page.getByText("Publicação reenviada para a fila").filter({ visible: true }),
  ).toBeVisible();
  await expect(cardStatus(page, "Erro na Loja Recusa")).toBeVisible({ timeout: STATUS_TIMEOUT });
});

test("valida o formulário de publicação e bloqueia preço abaixo do custo", async ({ page }) => {
  await signUp(page, "Revendedor Validação");
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja Validação");

  await openPublishFormForFirstProduct(page);
  await page.getByLabel("Título").fill("curto");
  await page.getByLabel("Preço de venda", { exact: true }).fill("0,01");
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

  // One cent above the cost: no longer below it, but the fees turn it into a loss.
  await page.getByLabel("Preço de venda", { exact: true }).fill(await centAboveCost(page));
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(
    page
      .getByText(/Com as taxas, o preço mínimo para não ter prejuízo é R\$\s[\d.,]+/)
      .filter({ visible: true }),
  ).toBeVisible();
});

test("publicar sem lojas conectadas leva à conexão de loja", async ({ page }) => {
  await signUp(page, "Revendedor Sem Loja");
  await onboardWithBhBeauty(page);
  await openPublishFormForFirstProduct(page);
  await expect(
    page.getByText("Conecte uma loja antes de publicar").filter({ visible: true }),
  ).toBeVisible();
  // The setup strip above also links to stores; this is the form's own link.
  await page.getByRole("link", { name: "Conectar loja" }).last().click();
  await expect(page).toHaveURL(/\/lojas/);
});

test("desconecta uma loja após confirmação", async ({ page }) => {
  await signUp(page, "Revendedor Desconecta");
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja Temporária");
  await page.getByRole("button", { name: "Opções de Loja Temporária" }).click();
  await page.getByRole("menuitem", { name: "Desconectar" }).click();
  await expect(page.getByRole("dialog")).toContainText("Desconectar Loja Temporária?");
  await page.getByRole("dialog").getByRole("button", { name: "Desconectar" }).click();
  await expect(page.getByText("Loja desconectada").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Nenhuma loja conectada").filter({ visible: true })).toBeVisible();
});

test("publica vários produtos do catálogo de uma vez com regra de preço", async ({ page }) => {
  await signUp(page, "Revendedora Lote");
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja Lote");

  // The store sells BH Beauty only: pick two of its products.
  await gotoHydrated(page, "/catalogo?query=BH%20Beauty");
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  const boxes = page.getByRole("checkbox", { name: /^Selecionar / });
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await page.getByRole("button", { name: "Publicar selecionados" }).click();

  const dialog = page.getByRole("dialog", { name: "Publicar 2 produtos" });
  await expect(dialog.getByText("Loja Lote").filter({ visible: true })).toBeVisible();
  await dialog.getByLabel("Acréscimo sobre o custo").fill("2");
  await expect(
    dialog.getByText("Use um valor entre 5% e 300%").filter({ visible: true }),
  ).toBeVisible();
  // 5% over the cost does not pay the 14% marketplace fee: the dialog says so and holds the batch.
  await dialog.getByLabel("Acréscimo sobre o custo").fill("5");
  await expect(
    dialog
      .getByRole("alert")
      .filter({ hasText: /Com as taxas, o preço mínimo para não ter prejuízo é R\$\s[\d.,]+/ }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Publicar em 1 loja" })).toBeDisabled();
  await dialog.getByLabel("Acréscimo sobre o custo").fill("80");
  await expect(dialog.getByText(/,90$/).filter({ visible: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Publicar em 1 loja" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(
    page.getByText("2 produtos enviados para publicação").filter({ visible: true }),
  ).toBeVisible();
  await expect(cardStatus(page, "No ar na Loja Lote")).toHaveCount(2, {
    timeout: STATUS_TIMEOUT,
  });

  await gotoHydrated(page, "/catalogo?query=BH%20Beauty");
  await expect(page.getByText("Publicado", { exact: true }).filter({ visible: true })).toHaveCount(
    2,
  );
});

test("publica em lote com margem própria para um dos produtos", async ({ page }) => {
  await signUp(page, "Revendedora Margem");
  await onboardWithBhBeauty(page);
  await connectMockStore(page, "Loja Margem");

  // The store sells BH Beauty only: pick two of its products.
  await gotoHydrated(page, "/catalogo?query=BH%20Beauty");
  const boxes = page.getByRole("checkbox", { name: /^Selecionar / });
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await page.getByRole("button", { name: "Publicar selecionados" }).click();

  const dialog = page.getByRole("dialog", { name: "Publicar 2 produtos" });
  const salePrice = dialog
    .locator("dt", { hasText: "Preço de venda" })
    .locator("xpath=following-sibling::dd[1]");
  const sharedPrice = await salePrice.textContent();

  await dialog.getByRole("button", { name: "Usar outra margem neste produto" }).click();
  await dialog.getByLabel("Acréscimo deste produto").fill("150");
  await expect(salePrice).not.toHaveText(sharedPrice ?? "");
  const adjustedPrice = (await salePrice.textContent()) ?? "";
  await expect(dialog.getByText("Vale para 1 de 2", { exact: false })).toBeVisible();
  await expect(dialog.getByText("1 com margem própria", { exact: false })).toBeVisible();

  // The other product keeps the shared markup; coming back keeps the override.
  await dialog.getByRole("button", { name: "Próximo produto" }).click();
  await expect(
    dialog.getByRole("button", { name: "Usar outra margem neste produto" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Produto anterior" }).click();
  await expect(dialog.getByLabel("Acréscimo deste produto")).toHaveValue("150");

  await dialog.getByLabel("Acréscimo deste produto").fill("2");
  await expect(dialog.getByText("Use um valor entre 5% e 300%")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Publicar em 1 loja" })).toBeDisabled();
  await dialog.getByLabel("Acréscimo deste produto").fill("150");
  await dialog.getByRole("button", { name: "Publicar em 1 loja" }).click();

  await expect(page).toHaveURL(/\/publicacoes/);
  await expect(cardStatus(page, "No ar na Loja Margem")).toHaveCount(2, {
    timeout: STATUS_TIMEOUT,
  });
  await expect(
    page.getByText(adjustedPrice, { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
});
