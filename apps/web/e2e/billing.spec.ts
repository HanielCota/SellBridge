import { expect, test } from "@playwright/test";
import { signUp, waitForHydration } from "./helpers";

test("shows the five plans and keeps checkout unavailable until billing is configured", async ({
  page,
}) => {
  test.skip(Boolean(process.env.STRIPE_SECRET_KEY), "Requires billing disabled");
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
  // The client's five paid plans, with no free plan.
  for (const plan of ["Start", "Pro", "Business", "Black", "Elite"]) {
    await expect(page.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Gratuito")).toHaveCount(0);
  // Plans without a price say when they open instead of showing a dead, grey button.
  await expect(page.getByRole("button", { name: /Assinar o/ })).toHaveCount(0);
  await expect(page.getByText("Disponível quando a cobrança começar")).toHaveCount(5);
  await page.goto("/assinatura?retorno=sucesso");
  await expect(page.getByText(/Pagamento enviado/)).toBeVisible();
});
