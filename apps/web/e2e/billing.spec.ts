import { expect, test } from "@playwright/test";
import { gotoHydrated, signUp, waitForHydration } from "./helpers";

test("shows six plans and keeps checkout unavailable until billing is configured", async ({
  page,
}) => {
  await signUp(page, "Assinatura E2E");
  await waitForHydration(page);
  // The plan sits at the foot of the sidebar, under support.
  await page
    .getByRole("complementary", { name: "Menu lateral" })
    .getByRole("link", { name: "Assinatura", exact: true })
    .click();
  await expect(page).toHaveURL(/\/assinatura\?perfil=[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { name: "Planos e assinatura" })).toBeVisible();
  await expect(page.getByText("Tudo liberado", { exact: true })).toBeVisible();
  await expect(page.getByText("0 lojas conectadas · 0 anúncios")).toBeVisible();
  for (const plan of ["Essencial", "Start", "Pro", "Business", "Black", "Elite"]) {
    await expect(page.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  }
  // Plans without a price say when they open instead of showing a dead, grey button.
  await expect(page.getByRole("button", { name: /Assinar o/ })).toHaveCount(0);
  await expect(page.getByText("Disponível quando a cobrança começar")).toHaveCount(6);
  await page.goto("/assinatura?retorno=sucesso");
  await expect(page.getByText(/Pagamento enviado/)).toBeVisible();
});

test("shows the free sales offer only for reseller sign-up", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoHydrated(page, "/cadastro");
  const offer = page.getByText("Primeiras 20 vendas sem mensalidade");
  await expect(offer).toBeVisible();
  await expect(page.getByText(/21ª venda.*R\$\s49,90 por mês/)).toBeVisible();

  await page.getByText("Quero fornecer", { exact: true }).click();
  await expect(offer).toHaveCount(0);
  await page.getByText("Quero vender", { exact: true }).click();
  await expect(offer).toBeVisible();

  await page.goto("/cadastro/fornecedor");
  await expect(page.getByRole("radio", { name: /Quero fornecer/ })).toBeChecked();
  await expect(offer).toHaveCount(0);
});
