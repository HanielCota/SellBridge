import { expect, type Page, test } from "@playwright/test";
import { createEmailVerificationToken } from "better-auth/api";
import { requireEnvironmentVariable } from "./environment";
import { gotoHydrated, SIGN_UP_PASSWORD, uniqueEmail } from "./helpers";

/** The link of the confirmation e-mail, signed like the one the server sends. */
async function confirmationLink(email: string): Promise<string> {
  const token = await createEmailVerificationToken(
    requireEnvironmentVariable("BETTER_AUTH_SECRET"),
    email,
  );
  return `/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent("/onboarding")}`;
}

async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("a conta nova só entra depois de abrir o link de confirmação", async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("confirmar");
  await gotoHydrated(page, "/cadastro");
  await page.getByLabel("Nome").fill("Revendedora Confirmação");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(SIGN_UP_PASSWORD);
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/confirme-seu-email$/);
  await expect(page.getByRole("heading", { name: "Confira seu e-mail" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Reenviar e-mail" }).click();
  await expect(
    page.getByText("Enviamos um novo link. Confira sua caixa de entrada."),
  ).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  await gotoHydrated(page, "/login");
  await fillLogin(page, email, "senha-errada-123");
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page.getByText("Falta confirmar seu e-mail")).toHaveCount(0);

  await fillLogin(page, email, SIGN_UP_PASSWORD);
  const notice = page.getByRole("status").filter({ hasText: "Falta confirmar seu e-mail" });
  await expect(notice).toBeVisible();
  await expect(notice.getByText(email)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  await page.goto(await confirmationLink(email));
  await expect(page).toHaveURL(/^[^?]*\/onboarding(?:[?#]|$)/);
  await expect(page.getByRole("heading", { name: "Configure sua conta" })).toBeVisible();
});
