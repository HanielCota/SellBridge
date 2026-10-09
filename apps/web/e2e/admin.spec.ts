import { expect, test } from "@playwright/test";
import {
  ADMIN_USER,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";

test("admin edita um cliente, entra como ele e volta", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  const email = await signUp(customerPage, "Cliente Painel Admin");
  await customerContext.close();

  const page = await browser.newPage();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
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

test("modo administrador começa desligado e liga as ferramentas de admin", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Modo administrador" });
  if ((await toggle.getAttribute("aria-checked")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await page.goto("/admin/clientes");
  await expect(page).toHaveURL(/\/dashboard/);

  await enableAdminMode(page);
  await expect(page.getByText("Modo admin ativo")).toBeVisible();
  await page.getByRole("link", { name: "Clientes" }).click();
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
});

test("revendedor não vê o modo administrador", async ({ page }) => {
  await signUp(page, "Revendedor Sem Toggle");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Modo administrador" })).toHaveCount(0);
});
