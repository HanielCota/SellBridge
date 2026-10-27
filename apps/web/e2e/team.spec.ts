import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
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
