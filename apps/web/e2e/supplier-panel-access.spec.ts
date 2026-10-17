import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { member, suppliers, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn, signUpAsSupplier } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));

test.afterAll(async () => {
  await database.$client.end();
});

/** Stands in for the brand step: links a new supplier to the account's profile. */
async function giveBrand(email: string, name: string): Promise<void> {
  const [profile] = await database
    .select({ organizationId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (profile === undefined) {
    throw new Error(`Conta de teste sem perfil: ${email}`);
  }
  await database.insert(suppliers).values({
    name,
    niche: "Casa e decoração",
    state: "SP",
    city: "Campinas",
    organizationId: profile.organizationId,
  });
}

test("fornecedor recém-cadastrado cai no painel e vê o aviso da marca", async ({ page }) => {
  await signUpAsSupplier(page, "Ateliê Sem Marca");

  await expect(page).toHaveURL(/\/fornecedor\/painel\?perfil=[a-z0-9-]+$/);
  await expect(page.getByText("Falta cadastrar sua marca")).toBeVisible();

  await gotoHydrated(page, "/dashboard");
  await expect(page).toHaveURL(/\/fornecedor\/painel\?perfil=[a-z0-9-]+$/);
});

test("fornecedor com marca abre o próprio painel com os dados carregados", async ({ page }) => {
  const email = await signUpAsSupplier(page, "Ateliê Com Marca");
  await giveBrand(email, "Ateliê Com Marca");

  await gotoHydrated(page, "/fornecedor/painel");
  await expect(page.getByText("Nenhuma pendência")).toBeVisible();
  await expect(page.getByRole("link", { name: "Produtos" }).first()).toBeVisible();
  await expect(page.getByText("Fornecedor", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Produtos" }).first().click();
  await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();
});

test("fornecedor não usa as rotas de revendedor", async ({ page }) => {
  await signUpAsSupplier(page, "Ateliê Sem Acesso");

  const response = await page.request.get("/api/financeiro/exportar");

  expect(response.status()).toBe(403);
});

test("revendedor não abre o painel do fornecedor", async ({ page }) => {
  await signIn(page, DEMO_USER);

  await gotoHydrated(page, "/fornecedor/painel");

  await expect(page).toHaveURL(/\/dashboard/);
});
