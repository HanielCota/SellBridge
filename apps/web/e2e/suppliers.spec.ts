import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  DEMO_USER,
  fillBillingAddress,
  gotoHydrated,
  pickSupplier,
  signIn,
  signUp,
  testCpf,
} from "./helpers";

const PHONE = "(11) 98765-4321";

test.describe("cadastro do revendedor", () => {
  test("novo usuário informa nome, CPF e telefone e escolhe o fornecedor", async ({ page }) => {
    const cpf = testCpf();
    await signUp(page, "Revendedor Onboarding");
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Configure sua conta" })).toBeVisible();
    await expect(page.getByText("Etapa 1 de 2 · Seus dados")).toBeVisible();
    await expect(
      page.getByText(
        "Usamos estes dados só para emitir notas fiscais e fazer cobranças. O endereço é o da cobrança: não tem relação com a entrega dos pedidos dos fornecedores. Confira se está tudo certo.",
      ),
    ).toBeVisible();

    // The account name fills the full name; the CPF is checked before the supplier step.
    await expect(page.getByLabel("Nome completo")).toHaveValue("Revendedor Onboarding");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Informe os 11 dígitos do CPF")).toBeVisible();
    // Item 26.a: the phone is asked too.
    await expect(page.getByText("Informe o telefone com DDD", { exact: false })).toBeVisible();
    await page.getByLabel("Telefone com DDD").fill(PHONE);
    await page.getByLabel("CPF").fill("52998224726");
    await expect(page.getByLabel("CPF")).toHaveValue("529.982.247-26");
    await expect(page.getByText("Confira o CPF: os dígitos não batem")).toBeVisible();
    await page.getByLabel("CPF").fill(cpf);
    await fillBillingAddress(page);
    await page.getByRole("button", { name: "Continuar" }).click();

    // The billing address stays in step 1: the second step picks the supplier, from any state.
    await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
    await expect(page.getByLabel("CEP")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Salvar fornecedor", exact: true }),
    ).toBeDisabled();

    // Going back keeps the saved data.
    await page.getByRole("button", { name: "Voltar" }).click();
    await expect(page.getByLabel("CPF")).toHaveValue(cpf);
    await expect(page.getByLabel("Telefone com DDD")).toHaveValue(PHONE);
    // The saved address stays hidden until the eye shows it.
    await expect(page.getByTestId("billing-address")).toHaveText("•••, ••• · São Paulo/SP");
    await page.getByRole("button", { name: "Mostrar endereço" }).click();
    await expect(page.getByTestId("billing-address")).toContainText("Avenida Paulista, 1578");
    await page.getByRole("button", { name: "Continuar" }).click();

    await pickSupplier(page, "Rio Pet Atacado");
    await page.getByRole("button", { name: "Salvar fornecedor" }).click();

    // After the profile the guide sends to the next step (stores).
    await expect(page).toHaveURL(/\/lojas/);
    await gotoHydrated(page, "/onboarding");
    await expect(page.getByRole("heading", { name: "Meu cadastro" })).toBeVisible();
    await expect(page.getByLabel("Nome completo")).toHaveValue("Revendedor Onboarding");
    await expect(page.getByLabel("CPF")).toHaveValue(cpf);
    await expect(page.getByLabel("Telefone com DDD")).toHaveValue(PHONE);
    await expect(page.getByText("Rio Pet Atacado", { exact: true })).toBeVisible();
  });

  test("recusa um CPF já usado por outra conta", async ({ page }) => {
    const cpf = testCpf();
    await signUp(page, "Primeira Conta");
    await page.getByLabel("CPF").fill(cpf);
    await page.getByLabel("Telefone com DDD").fill(PHONE);
    await fillBillingAddress(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();

    await page.context().clearCookies();
    await signUp(page, "Segunda Conta");
    await page.getByLabel("CPF").fill(cpf);
    await page.getByLabel("Telefone com DDD").fill(PHONE);
    await fillBillingAddress(page);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByText("Este CPF já está cadastrado em outra conta do SellBridge.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Etapa 1 de 2 · Seus dados")).toBeVisible();
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

  // MVP function 1: the catalog shows only one supplier, the store's (or the starter one).
  test("sem fornecedor escolhido, o catálogo pede um em vez de mostrar outros", async ({
    page,
  }) => {
    await signUp(page, "Catálogo Sem Fornecedor");
    await gotoHydrated(page, "/catalogo");
    await expect(page).toHaveURL(/\/catalogo/);
    await expect(
      page.getByRole("heading", {
        name: "Escolha um fornecedor para ver os produtos",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  });

  test("sem loja, mostra só o fornecedor inicial, mesmo com outra loja na URL", async ({
    page,
  }) => {
    await signUp(page, "Catálogo Fornecedor Inicial");
    await completeOnboarding(page, "BH Beauty Distribuidora");
    await gotoHydrated(page, `/catalogo?store=${crypto.randomUUID()}`);
    await expect(
      page.getByText("Produtos de BH Beauty Distribuidora, o fornecedor que você escolheu.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Para publicar estes produtos, conecte uma loja primeiro."),
    ).toBeVisible();
    const cards = page.getByRole("article");
    await expect(cards.first()).toBeVisible();
    await expect(cards.filter({ hasNotText: "BH Beauty Distribuidora" })).toHaveCount(0);
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

    await page.getByLabel("Só com estoque").click();
    await expect(page).toHaveURL(/inStock=true/);
    await expect(page.getByLabel("Só com estoque")).toBeChecked();
    await expect(page.getByText("Esgotado")).toHaveCount(0);

    await page.getByLabel("Buscar produto").fill("vestido");
    await expect(page).toHaveURL(/query=vestido/);
    // The supplier's reviews have their own heading, so look only at the product titles.
    await expect(page.getByRole("heading", { level: 3, name: /Vestido/ }).first()).toBeVisible();
  });

  test("mostra um fornecedor de outro estado e pede uma loja dele antes de publicar", async ({
    page,
  }) => {
    // The demo account is in Belo Horizonte and no store of it sells Rio Pet (Rio de Janeiro).
    await gotoHydrated(page, "/fornecedores");
    await page.getByRole("link", { name: "Rio Pet Atacado" }).click();
    await expect(page.getByRole("heading", { name: "Rio Pet Atacado" })).toBeVisible();
    await expect(page.getByText(/não entrega/)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible();
    await expect(
      page.getByText("Para publicar, escolha este fornecedor para uma das suas lojas."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Publicar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publicar" }).first()).toBeDisabled();
    await expect(page.getByRole("link", { name: "Vender este fornecedor" })).toBeVisible();
  });

  test("filtra fornecedores pelo estado e pela cidade de onde enviam", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores");
    const stateFilter = page.getByRole("combobox", { name: "Estado do fornecedor" });
    // Measured before opening: an open select hides the rest of the page from the a11y tree.
    const field = await stateFilter.boundingBox();
    await stateFilter.click();
    // The list opens below the field: laid over it, it read as a broken card.
    const list = await page.getByRole("listbox").boundingBox();
    expect(list?.y ?? 0).toBeGreaterThanOrEqual((field?.y ?? 0) + (field?.height ?? 0));
    await expect(page.getByRole("option", { name: "Roraima RR" })).toBeVisible();
    await page.getByRole("option", { name: "Minas Gerais MG" }).click();
    await expect(page).toHaveURL(/state=MG/);
    await expect(page.getByRole("link", { name: "BH Beauty Distribuidora" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Cidade do fornecedor" }).click();
    await page.getByRole("option", { name: "Divinópolis", exact: true }).click();
    await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toBeVisible();
    await expect(page.getByRole("link", { name: "BH Beauty Distribuidora" })).toHaveCount(0);

    await page.getByPlaceholder("Qual nicho ou produto você quer vender?").fill("zzz-inexistente");
    await expect(page.getByText("Nenhum fornecedor encontrado")).toBeVisible();
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toBeVisible();
  });

  test("leva do fornecedor à conexão de uma loja que vende ele", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores");
    await page.getByRole("link", { name: "Rio Pet Atacado" }).click();
    await page.getByRole("link", { name: "Vender este fornecedor" }).click();
    await expect(page).toHaveURL(/\/lojas/);
    const addStore = page.getByRole("region", { name: "Adicionar loja" });
    await expect(addStore.getByText("A nova loja vende")).toBeVisible();
    await expect(addStore.getByText("Rio Pet Atacado", { exact: true })).toBeVisible();
    await expect(addStore.getByRole("link", { name: "Conectar Loja simulada" })).toHaveAttribute(
      "href",
      /fornecedor=/,
    );
  });

  test("mostra erro amigável para fornecedor inexistente", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Fornecedor não encontrado")).toBeVisible();
  });
});
