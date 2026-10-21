import { expect, test } from "@playwright/test";
import { signUp, waitForHydration } from "./helpers";

test("shows plans and keeps checkout unavailable until billing is configured", async ({ page }) => {
  test.skip(Boolean(process.env.STRIPE_SECRET_KEY), "Requires billing disabled");
  await signUp(page, "Assinatura E2E");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Planos e assinatura" }).click();
  await expect(page).toHaveURL(/\/assinatura\?perfil=[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { name: "Planos e assinatura" })).toBeVisible();
  await expect(page.getByText("Seu plano: Gratuito")).toBeVisible();
  await expect(page.getByText("0 de 2 lojas · 0 de 25 anúncios")).toBeVisible();
  await expect(page.getByRole("button", { name: "Selecionar plano" })).toHaveCount(2);
  for (const button of await page.getByRole("button", { name: "Selecionar plano" }).all()) {
    await expect(button).toBeDisabled();
  }
  await page.goto("/assinatura?retorno=sucesso");
  await expect(page.getByText("Seu plano: Gratuito")).toBeVisible();
  await expect(page.getByText(/Pagamento enviado/)).toBeVisible();
});
