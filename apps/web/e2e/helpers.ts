import { expect, type Page } from "@playwright/test";

/** Navigates and waits until the client bundle has loaded so React handlers are attached. */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
}

export const DEMO_USER = { email: "demo@sellbridge.local", password: "demo12345" } as const;
export const ADMIN_USER = { email: "admin@sellbridge.local", password: "admin12345" } as const;

export async function signIn(page: Page, credentials: { email: string; password: string }) {
  await gotoHydrated(page, "/login");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@sellbridge.test`;
}

export async function signUp(page: Page, name: string): Promise<string> {
  const email = uniqueEmail();
  await gotoHydrated(page, "/cadastro");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-segura-123");
  await page.getByLabel("Confirmar senha").fill("senha-segura-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/\/cadastro/);
  return email;
}
