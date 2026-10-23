import { expect, test } from "@playwright/test";
import { member, organization, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { gotoHydrated, signUp } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
/** The password `signUp` creates accounts with. */
const PASSWORD = "senha-segura-123";

test.afterAll(async () => {
  await database.$client.end();
});

test("downloads a copy of the account's own data from the profile", async ({ page }) => {
  const email = await signUp(page, "Revendedora Exporta");
  await gotoHydrated(page, "/perfil");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar arquivo" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^sellbridge-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
  const response = await page.request.get("/api/conta/exportar");
  const exported: unknown = await response.json();
  expect(exported).toMatchObject({ format: "sellbridge-account-export/1", user: { email } });
});

test("deletes the account and its workspace after the password", async ({ page }) => {
  const email = await signUp(page, "Revendedora Exclui");
  const [owner] = await database
    .select({ userId: user.id, tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (owner === undefined) {
    throw new Error("Conta nova sem organização no banco de teste");
  }

  await gotoHydrated(page, "/perfil");
  await page.getByRole("button", { name: "Excluir conta" }).click();
  const dialog = page.getByRole("dialog", { name: "Excluir sua conta?" });
  await expect(dialog.getByText("Sua assinatura é cancelada na hora.")).toBeVisible();
  await dialog.screenshot({ path: test.info().outputPath("delete-account-dialog.png") });
  await dialog.getByLabel("Sua senha").fill("senha-errada-000");
  await dialog.getByRole("button", { name: "Excluir conta" }).click();
  await expect(dialog.getByText("Senha incorreta")).toBeVisible();

  await dialog.getByLabel("Sua senha").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Excluir conta" }).click();
  // Signed out: the home page sends the visitor on to the login.
  await expect(page).toHaveURL(/\/(login)?$/);
  expect(await database.select().from(user).where(eq(user.id, owner.userId))).toEqual([]);
  expect(
    await database.select().from(organization).where(eq(organization.id, owner.tenantId)),
  ).toEqual([]);
});
