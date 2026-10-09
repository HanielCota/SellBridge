import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn, signUp } from "./helpers";

test.describe("onboarding de região", () => {
  test("novo usuário informa o CEP e vê fornecedores da região", async ({ page }) => {
    await signUp(page, "Revendedor Onboarding");
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { name: "Onde você está?" })).toBeVisible();

    await page.getByLabel("CEP").fill("123");
    await page.getByRole("button", { name: "Salvar região" }).click();
    await expect(page.getByText("Informe um CEP com 8 dígitos")).toBeVisible();

    // CEP pre-cached by the seed: no external API call.
    await page.getByLabel("CEP").fill("30130010");
    await expect(page.getByLabel("CEP")).toHaveValue("30130-010");
    await page.getByRole("button", { name: "Salvar região" }).click();

    await expect(page).toHaveURL(/\/fornecedores/);
    await expect(page.getByRole("link", { name: /Belo Horizonte - MG/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "BH Beauty Distribuidora" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toHaveCount(0);
  });

  test("redireciona para o onboarding quem ainda não tem região", async ({ page }) => {
    await signUp(page, "Sem Região");
    await gotoHydrated(page, "/fornecedores");
    await expect(page).toHaveURL(/\/onboarding\?redirect=/);
  });

  test("mostra estado vazio quando nenhum fornecedor atende a região", async ({ page }) => {
    await signUp(page, "Revendedor Manaus");
    await page.getByLabel("CEP").fill("69005010");
    await page.getByRole("button", { name: "Salvar região" }).click();
    await expect(page).toHaveURL(/\/fornecedores/);
    await expect(page.getByText("Ainda não há fornecedores atendendo a sua região.")).toBeVisible();
  });
});

test.describe("fornecedores e catálogo", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, DEMO_USER);
  });

  test("filtra fornecedores por nicho e busca", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores");
    await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toBeVisible();

    await page.getByLabel("Buscar fornecedor").fill("franca");
    await expect(page).toHaveURL(/query=franca/);
    await expect(
      page.getByRole("link", { name: "Franca Calçados Direto da Fábrica" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toHaveCount(0);

    await page.getByLabel("Buscar fornecedor").fill("zzz-inexistente");
    await expect(page.getByText("Nenhum fornecedor encontrado")).toBeVisible();
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
    await expect(page.getByRole("heading", { level: 3 }).first()).toContainText("Vestido");
  });

  test("mostra erro amigável para fornecedor fora da região", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Fornecedor não encontrado na sua região")).toBeVisible();
  });
});
