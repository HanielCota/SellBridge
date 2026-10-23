import { expect, type Page, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { member, user } from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import {
  enableAdminMode,
  gotoHydrated,
  SIGN_UP_PASSWORD,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";
import { accountId, addExtraProfile, firstProfile, profileOf } from "./profile-fixtures";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const FOREIGN_PROFILE = "loja-de-outra-pessoa";
const EXPORT_URL = "/api/financeiro/exportar?period=30d";

let page: Page;
let userId: string;
let ownProfile: string;

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  userId = await accountId(database, await signUp(page, "Perfis Casos Limite"));
  ownProfile = await firstProfile(database, userId);
});

test.afterAll(async () => {
  await database.$client.end();
});

test("lets the back button leave a page that gained its profile", async () => {
  await gotoHydrated(page, `/suporte?perfil=${ownProfile}`);
  await gotoHydrated(page, "/pedidos");
  expect(profileOf(page)).toBe(ownProfile);

  await page.goBack();
  await waitForHydration(page);
  expect(new URL(page.url()).pathname).toBe("/suporte");
  expect(profileOf(page)).toBe(ownProfile);
});

test("asks to log in before showing the other-profile screen", async ({ browser }) => {
  const anonymous = await (await browser.newContext()).newPage();
  await anonymous.goto("/outro-perfil");
  await expect(anonymous).toHaveURL(/\/login/);
  await anonymous.close();
});

test("moves the tab out of a profile the account lost access to", async () => {
  const extra = await addExtraProfile(database, userId);
  await gotoHydrated(page, `/suporte?perfil=${extra.slug}`);
  expect(profileOf(page)).toBe(extra.slug);

  await database
    .delete(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, extra.id)));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Este link é de outro perfil" })).toBeVisible();
  expect(page.url()).not.toContain(extra.slug);
});

test("serves a download only for a profile of the account", async () => {
  await gotoHydrated(page, `/financeiro?perfil=${ownProfile}`);
  const own = await page.request.get(`${EXPORT_URL}&perfil=${ownProfile}`);
  expect(own.status()).toBe(200);

  const foreign = await page.request.get(EXPORT_URL, {
    headers: { "x-sellbridge-profile": FOREIGN_PROFILE },
  });
  expect(foreign.status()).toBe(403);
  expect(await foreign.text()).toContain("outro perfil");
});

test("never serves another profile when the header names one outside the account", async () => {
  const foreign = await page.request.get(`${EXPORT_URL}&perfil=${ownProfile}`, {
    headers: { "x-sellbridge-profile": FOREIGN_PROFILE },
  });
  expect(foreign.status()).toBe(403);
});

test("opens a team link that carries a colleague's profile", async ({ browser }) => {
  const context = await browser.newContext();
  const agentPage = await context.newPage();
  const email = await signUp(agentPage, "Atendente Link Colega");
  await database.update(user).set({ role: "agent" }).where(eq(user.email, email));
  await context.clearCookies();
  await signIn(agentPage, { email, password: SIGN_UP_PASSWORD });
  await enableAdminMode(agentPage);

  // A colleague's link: the profile in it belongs to another account.
  await gotoHydrated(agentPage, `/admin/chamados?perfil=${ownProfile}`);
  await expect(agentPage.getByRole("heading", { name: "Chamados" })).toBeVisible();
  expect(new URL(agentPage.url()).pathname).toBe("/admin/chamados");
  expect(agentPage.url()).not.toContain(ownProfile);
  await context.close();
});
