import { expect, test } from "@playwright/test";
import { member, organization, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { gotoHydrated, uniqueEmail } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

async function profileKindOf(email: string): Promise<string | undefined> {
  const [row] = await database
    .select({ kind: organization.kind })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(user.email, email));
  return row?.kind;
}

test("abre o cadastro de fornecedor já com o cartão de fornecedor marcado", async ({ page }) => {
  await gotoHydrated(page, "/cadastro/fornecedor");

  await expect(page.getByRole("radio", { name: /Quero fornecer/ })).toBeChecked();
  await expect(page.getByText(/venda por revendedores de todo o Brasil/)).toBeVisible();
});

test("cadastro comum começa como vendedor", async ({ page }) => {
  await gotoHydrated(page, "/cadastro");

  await expect(page.getByRole("radio", { name: /Quero vender/ })).toBeChecked();
});

test("cadastra como fornecedor e cria o perfil de fornecedor", async ({ page }) => {
  const email = uniqueEmail("fornecedor");
  await gotoHydrated(page, "/cadastro");

  await page.getByText("Quero fornecer").click();
  await expect(page.getByRole("radio", { name: /Quero fornecer/ })).toBeChecked();
  await page.getByLabel("Nome").fill("Ateliê Barro Teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-segura-123");
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).not.toHaveURL(/\/cadastro/);
  expect(await profileKindOf(email)).toBe("supplier");
});
