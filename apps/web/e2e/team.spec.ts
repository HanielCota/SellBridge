import { AxeBuilder } from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { member, user, verification } from "@sellbridge/database/schema";
import { and, desc, eq, like } from "drizzle-orm";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn, signUp, uniqueEmail } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

test("o dono convida uma pessoa para a equipe já com o cargo", async ({ page }) => {
  const email = uniqueEmail("convite");
  // Each run invites someone new: names repeat across runs on the same database.
  const name = `Paula ${email.slice(8, 21)}`;
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/equipe");
  await expect(page.getByRole("heading", { level: 1, name: "Equipe" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.map((item) => item.id)).toEqual([]);

  await page.getByRole("button", { name: "Convidar pessoa" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Convidar para a equipe" });
  // Audit the settled dialog: axe can freeze its opening fade partway through a snapshot.
  await dialog.evaluate(async (element) => {
    await Promise.allSettled(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  expect(
    (await new AxeBuilder({ page }).include("[role=dialog]").analyze()).violations.map(
      (item) => item.id,
    ),
  ).toEqual([]);
  await dialog.getByLabel("Nome").fill(name);
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByRole("button", { name: "Supervisor" }).click();
  await dialog.getByRole("button", { name: "Enviar convite" }).click();

  await expect(page.getByText("Convite enviado. A pessoa cria a senha pelo e-mail.")).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("Supervisor");
  await expect(row).toContainText("Convite enviado");
  await expect(row.getByRole("button", { name: `Reenviar convite para ${name}` })).toBeVisible();

  const [invited] = await database
    .select({ role: user.role, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, email));
  expect(invited).toEqual({ role: "supervisor", emailVerified: true });
});

/** The token of the newest set-password link Better Auth stored for this account. */
async function latestInviteToken(userId: string): Promise<string> {
  const prefix = "reset-password:";
  const [row] = await database
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, `${prefix}%`)))
    .orderBy(desc(verification.createdAt))
    .limit(1);
  if (row === undefined) {
    throw new Error(`No invite link stored for user ${userId}`);
  }
  return row.identifier.slice(prefix.length);
}

/** The owner invites an attendant; the attendant creates the password and signs in. */
async function inviteAndSignInAttendant(browser: Browser): Promise<{ page: Page; userId: string }> {
  const email = uniqueEmail("atendente");
  const name = `Ana ${email.slice(10, 23)}`;
  const password = "senha-da-atendente-123";
  const owner = await browser.newPage();
  await signIn(owner, ADMIN_USER);
  await enableAdminMode(owner);
  await gotoHydrated(owner, "/admin/equipe");
  await owner.getByRole("button", { name: "Convidar pessoa" }).first().click();
  const dialog = owner.getByRole("dialog", { name: "Convidar para a equipe" });
  await dialog.getByLabel("Nome").fill(name);
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByRole("button", { name: "Atendente" }).click();
  await dialog.getByRole("button", { name: "Enviar convite" }).click();
  await expect(
    owner.getByText("Convite enviado. A pessoa cria a senha pelo e-mail."),
  ).toBeVisible();
  await owner.close();

  const [invited] = await database
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, email));
  if (invited === undefined) {
    throw new Error(`Invited account ${email} was not created`);
  }
  expect(invited.role).toBe("agent");
  const page = await browser.newPage();
  await gotoHydrated(page, `/redefinir-senha?token=${await latestInviteToken(invited.id)}`);
  await page.getByLabel("Nova senha").fill(password);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, { email, password });
  return { page, userId: invited.id };
}

// Regression: the invite also created a reseller organization for the new team member.
test("a atendente convidada cria a senha e entra na fila, sem empresa de revendedor", async ({
  browser,
}) => {
  const { page, userId } = await inviteAndSignInAttendant(browser);

  await expect(page).toHaveURL(/\/admin\/chamados/);
  await expect(page.getByRole("heading", { name: "Chamados" })).toBeVisible();
  await expect(page.getByText("Falta pouco para sua primeira venda")).toHaveCount(0);
  const memberships = await database
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  expect(memberships).toEqual([]);
  await page.close();
});

// Regression: with no store, the reseller's links stayed in the menu and their pages failed.
test("a atendente sem empresa vê só as telas da equipe e o próprio perfil", async ({ browser }) => {
  const { page } = await inviteAndSignInAttendant(browser);
  await expect(page).toHaveURL(/\/admin\/chamados/);

  const sideMenu = page.getByRole("complementary", { name: "Menu lateral" });
  for (const resellerPage of ["Visão geral", "Pedidos", "Lojas", "Assinatura", "Suporte"]) {
    await expect(sideMenu.getByRole("link", { name: resellerPage, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: /^Avisos/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Menu do usuário/ }).click();
  await expect(page.getByRole("menuitem", { name: "Meu perfil" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Meu cadastro" })).toHaveCount(0);
  await expect(
    page.getByRole("menuitemcheckbox", { name: /^Modo (administrador|equipe)$/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await gotoHydrated(page, "/perfil");
  await expect(page.getByRole("heading", { name: "Senha" })).toBeVisible();
  await expect(page.getByText("Não foi possível carregar suas preferências.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Notificações" })).toHaveCount(0);
  const download = await page.request.get("/api/conta/exportar");
  expect(download.status()).toBe(200);
  await page.close();
});

test("um admin que não é dono vê a equipe, mas não convida", async ({ browser }) => {
  const page = await browser.newPage();
  const email = await signUp(page, "Admin Comum Equipe");
  await database
    .update(user)
    .set({ role: "admin", emailVerified: true })
    .where(eq(user.email, email));
  // A new sign-in reads the role just given in the database.
  await page.context().clearCookies();
  await signIn(page, { email, password: "senha-segura-123" });
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/equipe");
  await expect(page.getByRole("button", { name: "Convidar pessoa" }).first()).toBeDisabled();
  await page.close();
});

// Regression (review of ca7ddbb): the invite gave the role to whoever already held the address.
// The unconfirmed-address refusal is covered in shared/domain/team-invite.test.ts.
test("recusa convidar o e-mail de uma conta que já existe fora da equipe", async ({ browser }) => {
  const squatter = await browser.newPage();
  const email = await signUp(squatter, "Quem Chegou Antes");
  await squatter.close();

  const page = await browser.newPage();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/equipe");
  await page.getByRole("button", { name: "Convidar pessoa" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Convidar para a equipe" });
  await dialog.getByLabel("Nome").fill("Pessoa Certa");
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByRole("button", { name: "Administrador" }).click();
  await dialog.getByRole("button", { name: "Enviar convite" }).click();

  await expect(dialog.getByRole("alert")).toContainText("conta de cliente");
  const [account] = await database
    .select({ role: user.role })
    .from(user)
    .where(eq(user.email, email));
  expect(account?.role).toBe("user");
  await page.close();
});

// Regression: the footer's -24 px margins overshot the dialog's 20 px padding, so the invite
// dialog scrolled by 4 px and its content shifted under the pointer.
test("o convite para a equipe cabe sem barra de rolagem", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/equipe");
  await page.getByRole("button", { name: "Convidar pessoa" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Convidar para a equipe" });
  await expect(dialog).toBeVisible();
  const overflow = await dialog.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(overflow).toBe(0);
});
