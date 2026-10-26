import { expect, type Page, test } from "@playwright/test";
import { tickets, storeConnections } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import {
  DEMO_USER,
  signIn,
  completeOnboarding,
  gotoHydrated,
  signUp,
  waitForHydration,
} from "./helpers";
import { accountId, addExtraProfile, firstProfile, profileOf } from "./profile-fixtures";
import { e2eDatabase } from "./database";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

interface TwoProfiles {
  first: string;
  second: string;
  secondId: string;
}

let profiles: TwoProfiles;
let tabA: Page;
let tabB: Page;

/**
 * Opens a late-order ticket through the guided form and returns the subject the server stores:
 * the situation, then the description.
 */
async function openTicketInTab(page: Page, description: string): Promise<string> {
  // From a page of the tab, so the tab's profile travels with the link (no full page load).
  await page
    .getByRole("link", { name: /^(Abrir|Novo) chamado$/ })
    .first()
    .click();
  await page.getByRole("button", { name: /^Pedido ou entrega/ }).click();
  await page.getByRole("button", { name: /^O pedido atrasou/ }).click();
  await page.getByLabel("O que aconteceu com a entrega?").fill(description);
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(page.getByRole("heading", { name: "O pedido atrasou", exact: true })).toBeVisible();
  return `O pedido atrasou: ${description}`;
}

async function ticketTenant(subject: string): Promise<string | undefined> {
  const [ticket] = await database
    .select({ tenantId: tickets.tenantId })
    .from(tickets)
    .where(eq(tickets.subject, subject));
  return ticket?.tenantId;
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  tabA = await context.newPage();
  const userId = await accountId(database, await signUp(tabA, "Perfis Por Aba"));
  const first = await firstProfile(database, userId);
  const second = await addExtraProfile(database, userId);
  profiles = { first, second: second.slug, secondId: second.id };
  await gotoHydrated(tabA, `/suporte?perfil=${first}`);
  tabB = await context.newPage();
  await gotoHydrated(tabB, `/suporte?perfil=${profiles.second}`);
});

test("keeps each tab on its own profile", async () => {
  const subject = await openTicketInTab(tabB, `Chamado da aba B ${Date.now()}`);
  await expect.poll(() => ticketTenant(subject)).toBe(profiles.secondId);
  expect(profileOf(tabB)).toBe(profiles.second);

  await gotoHydrated(tabA, `/suporte?perfil=${profiles.first}`);
  await expect(tabA.getByRole("link", { name: subject })).toHaveCount(0);
});

test("keeps the profile after reload and in a copied link", async () => {
  await gotoHydrated(tabA, "/suporte");
  const first = profileOf(tabA);
  await tabA.reload();
  await waitForHydration(tabA);
  expect(profileOf(tabA)).toBe(first);

  const copied = await tabA.context().newPage();
  await gotoHydrated(copied, tabB.url());
  expect(profileOf(copied)).toBe(profiles.second);
  await copied.close();
});

test("shows the other-profile screen for a profile outside the account", async () => {
  await gotoHydrated(tabA, "/pedidos?perfil=loja-de-outra-pessoa");
  await expect(tabA.getByRole("heading", { name: "Este link é de outro perfil" })).toBeVisible();
  await tabA.getByRole("link", { name: "Ir para o meu perfil" }).click();
  await expect(tabA).toHaveURL(/perfil=/);
  expect([profiles.first, profiles.second]).toContain(profileOf(tabA));
});

test("clears the previous profile's data when switching", async () => {
  await gotoHydrated(tabA, `/suporte?perfil=${profiles.first}`);
  const subject = await openTicketInTab(tabA, `Chamado da aba A ${Date.now()}`);
  await tabA.getByRole("link", { name: "Suporte" }).first().click();
  await expect(tabA.getByRole("link", { name: subject })).toBeVisible();

  await gotoHydrated(tabA, `/suporte?perfil=${profiles.second}`);
  await expect(tabA.getByRole("link", { name: subject })).toHaveCount(0);
});

test("keeps a second profile throughout store consent and the callback", async () => {
  await gotoHydrated(tabB, `/onboarding?perfil=${profiles.second}`);
  await completeOnboarding(tabB, "BH Beauty Distribuidora");
  const shopName = `Profile store ${Date.now()}`;
  await tabB.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await expect(tabB.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(tabB);
  await tabB.getByLabel("Nome da loja").fill(shopName);
  await tabB.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(tabB).toHaveURL(/\/lojas/);
  expect(profileOf(tabB)).toBe(profiles.second);
  const [store] = await database
    .select({ tenantId: storeConnections.tenantId })
    .from(storeConnections)
    .where(eq(storeConnections.shopName, shopName));
  expect(store?.tenantId).toBe(profiles.secondId);
});

test("the corner bubble opens the guided form in the profile of the current tab", async () => {
  await gotoHydrated(tabB, `/lojas?perfil=${profiles.second}`);
  // The bubble leads to the same guided form as the Suporte button, never a free-text chat.
  await tabB.getByRole("link", { name: "Falar com o suporte", exact: true }).click();
  await expect(tabB).toHaveURL(/\/suporte\/novo/);
  await tabB.getByRole("button", { name: /^Pedido ou entrega/ }).click();
  await tabB.getByRole("button", { name: /^O pedido atrasou/ }).click();
  const description = `Bubble profile ${Date.now()} parado na transportadora.`;
  await tabB.getByLabel("O que aconteceu com a entrega?").fill(description);
  await tabB.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(tabB.getByRole("heading", { name: "O pedido atrasou", exact: true })).toBeVisible();
  expect(await ticketTenant(`O pedido atrasou: ${description}`)).toBe(profiles.secondId);
  expect(profileOf(tabB)).toBe(profiles.second);
});

test("forgets the signed-out account's profile before another account signs in", async () => {
  await gotoHydrated(tabA, `/suporte?perfil=${profiles.first}`);
  await tabA.getByRole("button", { name: "Menu do usuário" }).click();
  await tabA.getByRole("menuitem", { name: "Sair", exact: true }).click();
  await expect(tabA).toHaveURL(/\/login/);
  await signIn(tabA, DEMO_USER);
  await expect(tabA).not.toHaveURL(/\/outro-perfil/);
  expect(profileOf(tabA)).not.toBe(profiles.first);
});
