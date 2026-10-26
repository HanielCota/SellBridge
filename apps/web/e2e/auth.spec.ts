import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, uniqueEmail } from "./helpers";

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
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/\/cadastro/);

  await gotoHydrated(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
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

test("cadastro mostra a força da senha enquanto ela é digitada", async ({ page }) => {
  await gotoHydrated(page, "/cadastro");
  const password = page.getByLabel("Senha", { exact: true });
  const strength = page.locator("output[aria-live]");
  await expect(strength).toBeHidden();

  await password.fill("casa");
  await expect(strength).toHaveText("Senha fraca");
  await expect(page.getByText("Mínimo de 8 caracteres")).toBeVisible();

  await password.fill("Casa7mar");
  await expect(strength).toHaveText("Senha média");
  await expect(page.getByText("Mínimo de 8 caracteres")).toBeHidden();

  await password.fill("Casa7mar!");
  await expect(strength).toHaveText("Senha forte");
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

for (const redirect of ["//example.com/dashboard", "/\\example.com/dashboard"]) {
  test(`o login ignora um redirect para outro site (${redirect})`, async ({ page }) => {
    await gotoHydrated(page, `/login?redirect=${encodeURIComponent(redirect)}`);
    await page.getByLabel("E-mail").fill(DEMO_USER.email);
    await page.getByLabel("Senha", { exact: true }).fill(DEMO_USER.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    // The default destination, on this site: not example.com, nor a path made from it.
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/dashboard(\?|$)/);
  });
}

test("termos e privacidade são páginas públicas", async ({ page }) => {
  await page.goto("/termos");
  await expect(page.getByRole("heading", { name: "Termos de uso" })).toBeVisible();
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: "Política de privacidade" })).toBeVisible();
});
