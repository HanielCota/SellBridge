import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn, signUp, testCpf } from "./helpers";

test.describe("cadastro do revendedor", () => {
  test("novo usuário informa nome, CPF e endereço em duas etapas", async ({ page }) => {
    const cpf = testCpf();
    await signUp(page, "Revendedor Onboarding");
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Seu cadastro" })).toBeVisible();
    await expect(page.getByText("Etapa 1 de 2 · Seus dados")).toBeVisible();
    await expect(
      page.getByText(
        "Os dados informados neste cadastro serão utilizados para emissão de notas fiscais e cobranças. Confira se estão corretos.",
      ),
    ).toBeVisible();

    // The account name fills the full name; the CPF is checked before the address step.
    await expect(page.getByLabel("Nome completo")).toHaveValue("Revendedor Onboarding");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Informe os 11 dígitos do CPF")).toBeVisible();
    await page.getByLabel("CPF").fill("52998224726");
    await expect(page.getByLabel("CPF")).toHaveValue("529.982.247-26");
    await expect(page.getByText("Confira o CPF: os dígitos não batem")).toBeVisible();
    await page.getByLabel("CPF").fill(cpf);
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByText("Etapa 2 de 2 · Endereço")).toBeVisible();
    await expect(page.getByLabel("CEP")).toBeFocused();
    await page.getByLabel("CEP").fill("123");
    await page.getByRole("button", { name: "Salvar dados" }).click();
    await expect(page.getByText("Informe um CEP com 8 dígitos")).toBeVisible();
    await expect(page.getByText("Informe o número", { exact: true })).toBeVisible();

    // Going back keeps what was typed.
    await page.getByRole("button", { name: "Voltar" }).click();
    await expect(page.getByLabel("CPF")).toHaveValue(cpf);
    await page.getByRole("button", { name: "Continuar" }).click();

    // CEP pre-cached by the seed: no external API call. It fills street, district, city and state.
    await page.getByLabel("CEP").fill("30130010");
    await expect(page.getByLabel("CEP")).toHaveValue("30130-010");
    await expect(page.getByLabel("Rua ou avenida")).toHaveValue("Avenida Afonso Pena");
    await expect(page.getByLabel("Cidade")).toHaveValue("Belo Horizonte");
    await expect(page.getByLabel("UF")).toHaveValue("MG");
    await page.getByLabel("Sem número").check();
    await page.getByLabel("Complemento (opcional)").fill("Sala 2");
    await page.getByRole("button", { name: "Salvar dados" }).click();

    // After the profile the guide sends to the next step (stores).
    await expect(page).toHaveURL(/\/lojas/);
    await gotoHydrated(page, "/onboarding");
    await expect(page.getByRole("heading", { name: "Alterar seus dados" })).toBeVisible();
    await expect(page.getByLabel("Nome completo")).toHaveValue("Revendedor Onboarding");
    await expect(page.getByLabel("CPF")).toHaveValue(cpf);
  });
});

test.describe("busca de fornecedores", () => {
  test("sem endereço, mostra fornecedores de todo o Brasil, sem falar em região", async ({
    page,
  }) => {
    await signUp(page, "Sem Endereço");
    await gotoHydrated(page, "/fornecedores");
    await expect(page).toHaveURL(/\/fornecedores(\?|$)/);
    await expect(page.getByRole("link", { name: "BH Beauty Distribuidora" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toBeVisible();
    await expect(page.getByText(/sua região|seu CEP/)).toHaveCount(0);
  });

  test("sem endereço, abre o catálogo com produtos de todos os fornecedores", async ({ page }) => {
    await signUp(page, "Catálogo Sem Endereço");
    await gotoHydrated(page, "/catalogo");
    await expect(page).toHaveURL(/\/catalogo/);
    await expect(
      page.getByText("Produtos de fornecedores de todo o Brasil.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("article").first()).toBeVisible();
  });
});

test.describe("fornecedores e catálogo", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, DEMO_USER);
  });

  test("busca pelo nicho ou pelo produto e filtra pelos atalhos de nicho", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores");
    await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toBeVisible();

    const search = page.getByPlaceholder("Qual nicho ou produto você quer vender?");
    await search.fill("vestido");
    await expect(page).toHaveURL(/query=vestido/);
    await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toHaveCount(0);

    await search.fill("calcados");
    await expect(
      page.getByRole("link", { name: "Franca Calçados Direto da Fábrica" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toHaveCount(0);

    await search.fill("zzz-inexistente");
    await expect(page.getByText("Nenhum fornecedor encontrado")).toBeVisible();

    await search.fill("");
    await page.getByRole("button", { name: "Pet", exact: true }).click();
    await expect(page).toHaveURL(/niche=Pet/);
    await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toHaveCount(0);
  });

  test("abre o catálogo, filtra por estoque e pagina pela URL", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores");
    await page.getByRole("link", { name: "Ateliê Divinópolis Confecções" }).click();
    await expect(
      page.getByRole("heading", { name: "Ateliê Divinópolis Confecções" }),
    ).toBeVisible();
    await expect(page.getByText(/produtos · página 1 de/)).toBeVisible();

    await page.getByLabel("Somente com estoque").click();
    await expect(page).toHaveURL(/inStock=true/);
    await expect(page.getByLabel("Somente com estoque")).toBeChecked();
    await expect(page.getByText("Esgotado")).toHaveCount(0);

    await page.getByLabel("Buscar produto").fill("vestido");
    await expect(page).toHaveURL(/query=vestido/);
    // The supplier's reviews have their own heading, so look only at the product titles.
    await expect(page.getByRole("heading", { level: 3, name: /Vestido/ }).first()).toBeVisible();
  });

  test("publica de um fornecedor de outro estado", async ({ page }) => {
    // The demo account is in Belo Horizonte; Rio Pet is in Rio de Janeiro.
    await gotoHydrated(page, "/fornecedores");
    await page.getByRole("link", { name: "Rio Pet Atacado" }).click();
    await expect(page.getByRole("heading", { name: "Rio Pet Atacado" })).toBeVisible();
    await expect(page.getByText(/não entrega/)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Publicar" }).first()).toBeVisible();
  });

  test("mostra erro amigável para fornecedor inexistente", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Fornecedor não encontrado")).toBeVisible();
  });
});
