import { expect, type Page, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { tickets, storeConnections } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { completeOnboarding, gotoHydrated, signUp, waitForHydration } from "./helpers";
import { accountId, addExtraProfile, firstProfile, profileOf } from "./profile-fixtures";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));

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

async function openTicketInTab(page: Page, subject: string) {
  // From a page of the tab, so the tab's profile travels with the link (no full page load).
  await page.getByRole("link", { name: "Abrir chamado" }).first().click();
  await page.getByText("Pedido ou entrega").click();
  await page.getByLabel("Assunto").fill(subject);
  await page.getByLabel("Descrição").fill("Chamado aberto pelo teste de perfis por aba.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
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
  const subject = `Chamado da aba B ${Date.now()}`;
  await openTicketInTab(tabB, subject);
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
  const subject = `Chamado da aba A ${Date.now()}`;
  await gotoHydrated(tabA, `/suporte?perfil=${profiles.first}`);
  await openTicketInTab(tabA, subject);
  await tabA.getByRole("link", { name: "Suporte" }).first().click();
  await expect(tabA.getByRole("link", { name: subject })).toBeVisible();

  await gotoHydrated(tabA, `/suporte?perfil=${profiles.second}`);
  await expect(tabA.getByRole("link", { name: subject })).toHaveCount(0);
});

test("keeps a second profile throughout store consent and the callback", async () => {
  await gotoHydrated(tabB, `/onboarding?perfil=${profiles.second}`);
  await completeOnboarding(tabB, "BH Beauty Distribuidora");
  const shopName = `Profile store ${Date.now()}`;
  await tabB.getByRole("link", { name: "Conectar Loja simulada" }).click();
  await expect(tabB.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(tabB);
  expect(profileOf(tabB)).toBe(profiles.second);
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
