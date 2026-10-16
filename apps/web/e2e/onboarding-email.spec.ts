import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  confirmEmail,
  gotoHydrated,
  signUp,
  waitForHydration,
} from "./helpers";

// Item 26.b (L1): a new store waits for the confirmed e-mail; the setup says so and resends it.
test("a conta sem e-mail confirmado vê a etapa e não conecta loja nova", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revendedora Sem Confirmar", { confirm: false });
  await completeOnboarding(page);
  await expect(page).toHaveURL(/\/lojas/);
  await waitForHydration(page);
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill("Loja Sem Confirmar");
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page).toHaveURL(/erro=email_not_verified/);
  await expect(
    page.getByText("Confirme seu e-mail antes de conectar uma loja nova.", { exact: false }),
  ).toBeVisible();

  await gotoHydrated(page, "/dashboard");
  await expect(page.getByText("Confirme seu e-mail")).toBeVisible();
  await page.getByRole("button", { name: "Reenviar e-mail" }).click();
  await expect(page.getByText("Enviamos o link de confirmação para o seu e-mail.")).toBeVisible();

  await confirmEmail(email);
  await gotoHydrated(page, "/dashboard");
  await expect(page.getByRole("link", { name: "Conectar loja" })).toBeVisible();
});
