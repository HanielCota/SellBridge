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
  await page.getByLabel("Confirmar senha").fill("senha-segura-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/\/cadastro/);

  await gotoHydrated(page, "/dashboard");
  await expect(page.getByRole("heading", { name: /Olá, Revendedora Teste/ })).toBeVisible();

  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

  await page.getByLabel("Senha").fill("senha-segura-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
});
