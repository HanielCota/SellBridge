import { expect, type Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));

/** Marks the account's e-mail as confirmed, as opening the link sent on sign-up would. */
export async function confirmEmail(email: string): Promise<void> {
  await database.update(user).set({ emailVerified: true }).where(eq(user.email, email));
}

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
  await acceptTermsIfAsked(page);
}

/**
 * Accounts created outside /cadastro (seed, database fixtures) have not accepted the terms yet:
 * the app asks once on the first page (item 26.a).
 */
export async function acceptTermsIfAsked(page: Page): Promise<void> {
  // Settle on the terms page or a page of the app before deciding (client-side redirects).
  const terms = page.getByRole("heading", { name: "Antes de continuar" });
  const app = page.getByRole("button", { name: "Menu do usuário" });
  await expect(terms.or(app).first()).toBeVisible();
  if (!(await terms.isVisible())) {
    return;
  }
  await waitForHydration(page);
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).not.toHaveURL(/\/aceitar-termos/);
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@sellbridge.test`;
}

/** The password every account made by `signUp` gets, for signing in again. */
export const SIGN_UP_PASSWORD = "senha-segura-123";

/**
 * Creates an account through /cadastro. The e-mail comes back confirmed, since a new store waits
 * for it (item 26.b); `confirm: false` keeps it pending.
 */
export async function signUp(
  page: Page,
  name: string,
  options: { confirm?: boolean } = {},
): Promise<string> {
  const email = uniqueEmail();
  await gotoHydrated(page, "/cadastro");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(SIGN_UP_PASSWORD);
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/\/cadastro/);
  if (options.confirm !== false) {
    await confirmEmail(email);
  }
  return email;
}

/** Creates an account through /cadastro/fornecedor, which opens on "Quero fornecer". */
export async function signUpAsSupplier(page: Page, name: string): Promise<string> {
  const email = uniqueEmail("fornecedor");
  await gotoHydrated(page, "/cadastro/fornecedor");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(SIGN_UP_PASSWORD);
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).not.toHaveURL(/\/cadastro/);
  return email;
}

function cpfCheckDigit(digits: readonly number[]): number {
  const weightedSum = digits.reduce(
    (sum, digit, index) => sum + digit * (digits.length + 1 - index),
    0,
  );
  const remainder = (weightedSum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

/**
 * A random CPF with valid check digits, formatted as typed (000.000.000-00). Each account needs
 * its own: the same CPF is refused on a second account.
 */
export function testCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const first = cpfCheckDigit(base);
  const digits = [...base, first, cpfCheckDigit([...base, first])].join("");
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** First onboarding step: full name, a fresh CPF and the phone of the billing holder. */
export async function fillBillingHolder(page: Page, fullName = "Revendedor Teste Silva") {
  await page.getByLabel("Nome completo").fill(fullName);
  await page.getByLabel("CPF").fill(testCpf());
  await page.getByLabel("Telefone com DDD").fill("(11) 98765-4321");
  await page.getByRole("button", { name: "Continuar" }).click();
}

/** Picks a supplier in the onboarding picker: search by name, then choose its card. */
export async function pickSupplier(page: Page, supplierName: string): Promise<void> {
  await page.getByLabel("Buscar fornecedor por nome, nicho ou produto").fill(supplierName);
  await page
    .getByRole("radiogroup", { name: "Fornecedores" })
    .getByText(supplierName, { exact: true })
    .click();
  await expect(page.getByRole("radio", { name: new RegExp(supplierName) })).toBeChecked();
}

/**
 * Fills the first-visit onboarding: holder step (name and a fresh CPF), then the supplier of the
 * first shop, and continues.
 */
export async function completeOnboarding(
  page: Page,
  supplierName = "BH Beauty Distribuidora",
): Promise<void> {
  await fillBillingHolder(page);
  await expect(page.getByText("Etapa 2 de 2 · Seu fornecedor")).toBeVisible();
  await pickSupplier(page, supplierName);
  await page.getByRole("button", { name: `Continuar com ${supplierName}` }).click();
}

/** Turns on admin mode from the profile menu (team accounts only; it is off by default). */
export async function enableAdminMode(page: Page): Promise<void> {
  // The menu only opens once React owns the page; callers may arrive from a full page load.
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  // Admins see "Modo administrador"; agents and supervisors, "Modo equipe".
  const toggle = page.getByRole("menuitemcheckbox", { name: /^Modo (administrador|equipe)$/ });
  if ((await toggle.getAttribute("aria-checked")) !== "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }
  await page.keyboard.press("Escape");
  // Every team role sees the support inbox; customer accounts are for admins only.
  await expect(page.getByRole("link", { name: "Chamados" })).toBeVisible();
}
