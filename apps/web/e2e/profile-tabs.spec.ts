import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { member, organization, tickets, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { gotoHydrated, signUp, waitForHydration } from "./helpers";

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

function profileOf(page: Page): string {
  const slug = new URL(page.url()).searchParams.get("perfil");
  if (slug === null) {
    throw new Error(`a página ${page.url()} não tem ?perfil=`);
  }
  return slug;
}

async function accountId(email: string): Promise<string> {
  const [account] = await database.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (account === undefined) {
    throw new Error(`conta ${email} não encontrada`);
  }
  return account.id;
}

/** The profile created at sign-up. */
async function firstProfile(userId: string): Promise<string> {
  const [profile] = await database
    .select({ slug: organization.slug })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
  if (profile === undefined) {
    throw new Error(`a conta ${userId} não tem perfil`);
  }
  return profile.slug;
}

/** Users cannot create organizations themselves yet, so the second profile comes from the test. */
async function addSecondProfile(userId: string): Promise<{ slug: string; id: string }> {
  const id = randomUUID();
  const slug = `segundo-perfil-${id.slice(0, 8)}`;
  await database
    .insert(organization)
    .values({ id, name: "Segundo perfil", slug, createdAt: new Date() });
  await database.insert(member).values({
    id: randomUUID(),
    organizationId: id,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  return { slug, id };
}

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
  const userId = await accountId(await signUp(tabA, "Perfis Por Aba"));
  const first = await firstProfile(userId);
  const second = await addSecondProfile(userId);
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
