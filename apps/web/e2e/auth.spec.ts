import { expect, test } from "@playwright/test";
import { gotoHydrated, uniqueEmail } from "./helpers";

test("redireciona visitante sem sessão para o login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("mostra erros de validação ao enviar cadastro vazio", async ({ page }) => {
  await gotoHydrated(page, "/cadastro");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Informe seu nome")).toBeVisible();
  await expect(page.getByText("Informe um e-mail válido")).toBeVisible();
});

test("cadastra, sai e entra novamente", async ({ page }) => {
  const email = uniqueEmail();
  await gotoHydrated(page, "/cadastro");
  await page.getByLabel("Nome").fill("Revendedora Teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-segura-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/\/cadastro/);

  await gotoHydrated(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Painel de vendas" })).toBeVisible();
  await expect(page.getByText("Revendedora Teste")).toBeVisible();

  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

  await page.getByLabel("Senha", { exact: true }).fill("senha-segura-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

test("cadastro só marca erro depois que o campo é deixado e mostra a regra da senha", async ({
  page,
}) => {
  await gotoHydrated(page, "/cadastro");
  await expect(page.getByText("Mínimo de 8 caracteres")).toBeVisible();

  await page.getByLabel("Nome").fill("A");
  await expect(page.getByText("Informe seu nome")).toBeHidden();
  await page.getByLabel("E-mail").focus();
  await expect(page.getByText("Informe seu nome")).toBeVisible();
  await expect(page.getByText("Informe um e-mail válido")).toBeHidden();

  await expect(page.getByRole("link", { name: "Termos de uso" })).toHaveAttribute(
    "href",
    "/termos",
  );
});

test("pede link de redefinição de senha sem revelar se a conta existe", async ({ page }) => {
  await gotoHydrated(page, "/login");
  await page.getByRole("link", { name: "Esqueceu a senha?" }).click();
  await expect(page.getByRole("heading", { name: "Esqueceu a senha?" })).toBeVisible();

  await page.getByLabel("E-mail").fill(uniqueEmail("sem-conta"));
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Verifique sua caixa de entrada.")).toBeVisible();
});

test("link de redefinição inválido oferece pedir um novo", async ({ page }) => {
  await gotoHydrated(page, "/redefinir-senha?error=INVALID_TOKEN");
  await expect(page.getByText("Este link é inválido ou expirou.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pedir um novo link" })).toBeVisible();
});

test("termos e privacidade são páginas públicas", async ({ page }) => {
  await page.goto("/termos");
  await expect(page.getByRole("heading", { name: "Termos de uso" })).toBeVisible();
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: "Política de privacidade" })).toBeVisible();
});
