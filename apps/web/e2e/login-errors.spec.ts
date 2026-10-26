import { expect, test } from "@playwright/test";
import { user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated, SIGN_UP_PASSWORD, signUp } from "./helpers";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

// Regression (25/10/2026, idioma-pt): every login error read "E-mail ou senha incorretos.", so a
// blocked customer kept retyping a password that was right.
test("conta bloqueada vê o motivo ao entrar, não 'senha incorreta'", async ({ browser }) => {
  const signUpContext = await browser.newContext({ locale: "pt-BR" });
  const email = await signUp(await signUpContext.newPage(), "Conta Bloqueada");
  await signUpContext.close();
  await database.update(user).set({ banned: true }).where(eq(user.email, email));

  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  await gotoHydrated(page, "/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(SIGN_UP_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(
    page.getByText("Esta conta está bloqueada. Fale com o suporte para entender o motivo."),
  ).toBeVisible();
  await expect(page.getByText("E-mail ou senha incorretos.")).toHaveCount(0);
  await context.close();
});
