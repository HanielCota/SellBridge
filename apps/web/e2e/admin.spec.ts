import { expect, test } from "@playwright/test";
import { ADMIN_USER, gotoHydrated, signIn, signUp } from "./helpers";

test("admin edita um cliente, entra como ele e volta", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  const email = await signUp(customerPage, "Cliente Painel Admin");
  await customerContext.close();

  const page = await browser.newPage();
  await signIn(page, ADMIN_USER);
  await gotoHydrated(page, `/admin/clientes?query=${encodeURIComponent(email)}`);
  await page.getByRole("link", { name: "Cliente Painel Admin" }).click();
  await expect(page.getByRole("heading", { name: "Cliente Painel Admin" })).toBeVisible();

  await page.getByLabel("Nome", { exact: true }).fill("Cliente Renomeado");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByRole("heading", { name: "Cliente Renomeado" })).toBeVisible();

  await page.getByRole("button", { name: "Entrar como cliente" }).click();
  await expect(page.getByText("Você está usando a conta de")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Voltar ao admin" }).click();
  await expect(page).toHaveURL(/\/admin\/clientes/);
});

test("revendedor não acessa o painel de clientes", async ({ page }) => {
  await signUp(page, "Revendedor Sem Admin");
  await page.goto("/admin/clientes");
  await expect(page).toHaveURL(/\/dashboard/);
});
