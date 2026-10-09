import { expect, type Page } from "@playwright/test";
import { requireEnvironmentVariable } from "./environment";

/**
 * Waits until React has hydrated the current document. Needed after any full page load:
 * before hydration a click submits the form natively and the page just reloads.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/** Opens a page and waits until React has hydrated it, so typed values are not reset. */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
  await waitForHydration(page);
}

export const DEMO_USER = {
  email: "demo@sellbridge.local",
  password: requireEnvironmentVariable("SEED_DEMO_PASSWORD"),
} as const;
export const ADMIN_USER = {
  email: "admin@sellbridge.local",
  password: requireEnvironmentVariable("SEED_ADMIN_PASSWORD"),
} as const;

export async function signIn(page: Page, credentials: { email: string; password: string }) {
  await gotoHydrated(page, "/login");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
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
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/\/cadastro/);
  return email;
}

/** Turns on admin mode from the profile menu (admins only; it is off by default). */
export async function enableAdminMode(page: Page): Promise<void> {
  // The menu only opens once React owns the page; callers may arrive from a full page load.
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Modo administrador" });
  if ((await toggle.getAttribute("aria-checked")) !== "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Clientes" })).toBeVisible();
}
