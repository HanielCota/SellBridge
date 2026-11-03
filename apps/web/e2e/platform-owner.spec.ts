import { type Browser, expect, type Page, test } from "@playwright/test";
import { user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import {
  ADMIN_USER,
  completeOnboarding,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const PASSWORD = "senha-segura-123";

test.afterAll(async () => {
  await database.$client.end();
});

/** A fresh account given a team role straight in the database. */
async function teamMember(browser: Browser, name: string, role: "admin" | "agent") {
  const signUpPage = await browser.newPage();
  const email = await signUp(signUpPage, name);
  await signUpPage.close();
  const [row] = await database
    .update(user)
    .set({ role, emailVerified: true })
    .where(eq(user.email, email))
    .returning({ id: user.id });
  if (!row) throw new Error("conta de teste não criada");
  return { email, id: row.id };
}

async function accountOf(email: string) {
  const [row] = await database
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.email, email));
  if (!row) throw new Error(`conta ${email} ausente`);
  return row;
}

/** Calls a Better Auth admin route from the page, as a script on the site could. */
async function callAdminRoute(page: Page, path: string, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ path: routePath, body: routeBody }) => {
      const response = await fetch(`/api/auth/admin/${routePath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(routeBody),
      });
      return response.status;
    },
    { path, body },
  );
}

test("admin comum não mexe na conta do dono nem da equipe", async ({ browser }) => {
  const owner = await accountOf(ADMIN_USER.email);
  test.setTimeout(120_000);
  const agent = await teamMember(browser, "Atendente Protegida", "agent");
  const admin = await teamMember(browser, "Admin Comum", "admin");
  // The role was set after sign-up: a new sign-in loads it.
  const page = await browser.newPage();
  await signIn(page, { email: admin.email, password: PASSWORD });
  await enableAdminMode(page);

  await gotoHydrated(page, `/admin/clientes/${owner.id}`);
  await expect(page.getByText("Dono da plataforma", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Conta da equipe: só um dono da plataforma altera", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Bloquear conta" })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Papel do cliente" })).toBeDisabled();

  // The plugin's own routes are closed to the browser (item 10.b); the guard behind them is
  // covered by account-protection.test.ts. Harmless calls on the owner (same role), and the
  // destructive ones on a throwaway team account.
  expect(await callAdminRoute(page, "set-role", { userId: owner.id, role: "admin" })).toBe(404);
  expect(
    await callAdminRoute(page, "set-user-password", {
      userId: agent.id,
      newPassword: "outra-senha-123",
    }),
  ).toBe(404);
  expect(await callAdminRoute(page, "ban-user", { userId: agent.id })).toBe(404);
  // Entering an account stays open to the browser: the guard refuses a team account there.
  expect(await callAdminRoute(page, "impersonate-user", { userId: agent.id })).toBe(403);
  expect(await accountOf(agent.email)).toMatchObject({ role: "agent", banned: false });
  expect(await accountOf(ADMIN_USER.email)).toMatchObject({ role: "admin" });
  await page.close();

  // The owner still manages the team.
  const ownerPage = await browser.newPage();
  await signIn(ownerPage, ADMIN_USER);
  await enableAdminMode(ownerPage);
  await gotoHydrated(ownerPage, `/admin/clientes/${admin.id}`);
  await ownerPage.getByRole("combobox", { name: "Papel do cliente" }).click();
  await ownerPage.getByRole("option", { name: "Revendedor" }).click();
  await expect(ownerPage.getByText("Papel atualizado")).toBeVisible();
  expect(await accountOf(admin.email)).toMatchObject({ role: "user" });
});

// Regression (security audit, 31/10/2026): the shop actions skipped the team-account rule, so any
// admin could disconnect a shop of another team member.
test("admin comum não desconecta a loja de alguém da equipe", async ({ browser }) => {
  test.setTimeout(150_000);
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const email = await signUp(memberPage, "Atendente Com Loja");
  await completeOnboarding(memberPage, "BH Beauty Distribuidora");
  await memberPage.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await waitForHydration(memberPage);
  await memberPage.getByLabel("Nome da loja").fill("Loja da Atendente");
  await memberPage.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(
    memberPage.getByText('Loja "Loja da Atendente" conectada').filter({ visible: true }),
  ).toBeVisible({ timeout: 20_000 });
  await memberContext.close();
  const [member] = await database
    .update(user)
    .set({ role: "agent" })
    .where(eq(user.email, email))
    .returning({ id: user.id });
  if (!member) throw new Error("conta de teste não criada");
  const admin = await teamMember(browser, "Admin Sem Dono", "admin");
  const page = await browser.newPage();
  await signIn(page, { email: admin.email, password: PASSWORD });
  await enableAdminMode(page);

  await gotoHydrated(page, `/admin/clientes/${member.id}`);
  await page.getByRole("button", { name: "Desconectar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desconectar" }).click();

  await expect(
    page.getByText("Só um dono da plataforma altera contas da equipe").filter({ visible: true }),
  ).toBeVisible();
  await gotoHydrated(page, `/admin/clientes/${member.id}`);
  await expect(page.getByText("Loja da Atendente")).toBeVisible();
});
