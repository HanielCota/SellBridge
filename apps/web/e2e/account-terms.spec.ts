import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { termsAcceptances, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { fillBillingAddress, gotoHydrated, pickSupplier, testCpf, uniqueEmail } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));

async function acceptedVersions(email: string): Promise<string[]> {
  const rows = await database
    .select({ version: termsAcceptances.version })
    .from(termsAcceptances)
    .innerJoin(user, eq(user.id, termsAcceptances.userId))
    .where(eq(user.email, email));
  return rows.map((row) => row.version);
}

// Item 26.a (L2, L4): the account is complete and the terms are accepted with version and date,
// also when the account did not come through /cadastro (Google, new terms version).
test("o cadastro pede o aceite dos termos e o grava; sem aceite, o app pede antes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("termos");
  await gotoHydrated(page, "/cadastro");
  await page.getByLabel("Nome").fill("Revendedora Termos");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-segura-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(
    page.getByText("Marque que você aceita os termos para criar a conta."),
  ).toBeVisible();
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect.poll(async () => acceptedVersions(email)).toHaveLength(1);

  // As an account from Google or before a new version of the terms: nothing accepted yet.
  await database
    .delete(termsAcceptances)
    .where(
      eq(
        termsAcceptances.userId,
        database.select({ id: user.id }).from(user).where(eq(user.email, email)),
      ),
    );
  await gotoHydrated(page, "/dashboard");
  await expect(page).toHaveURL(/\/aceitar-termos/);
  // A1 for the new page (the accessibility spec signs in as the demo, who already accepted).
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Marque que você aceita os termos para continuar.")).toBeVisible();
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect.poll(async () => acceptedVersions(email)).toHaveLength(1);
});

test("os dados da conta guardam telefone e, para empresa, CNPJ e razão social", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoHydrated(page, "/cadastro");
  await page.getByLabel("Nome").fill("Revendedora Empresa");
  await page.getByLabel("E-mail").fill(uniqueEmail("empresa"));
  await page.getByLabel("Senha", { exact: true }).fill("senha-segura-123");
  await page.getByLabel(/Li e aceito os termos de uso/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByLabel("Nome completo").fill("Revendedora Empresa Lima");
  await page.getByLabel("CPF").fill(testCpf());
  await page.getByLabel("Telefone com DDD").fill("11987654321");
  await expect(page.getByLabel("Telefone com DDD")).toHaveValue("(11) 98765-4321");
  await fillBillingAddress(page);
  await page.getByLabel("Vendo como empresa (CNPJ)").check();
  await page.getByLabel("CNPJ", { exact: true }).fill("11222333000182");
  await page.getByLabel("Razão social").fill("Revendedora Empresa Ltda");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Confira o CNPJ: os dígitos não batem")).toBeVisible();
  await page.getByLabel("CNPJ", { exact: true }).fill("11222333000181");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
  await pickSupplier(page, "BH Beauty Distribuidora");
  await page.getByRole("button", { name: "Salvar fornecedor" }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);

  await gotoHydrated(page, "/onboarding");
  await expect(page.getByLabel("Telefone com DDD")).toHaveValue("(11) 98765-4321");
  await expect(page.getByLabel("CNPJ", { exact: true })).toHaveValue("11.222.333/0001-81");
  await expect(page.getByLabel("Razão social")).toHaveValue("Revendedora Empresa Ltda");
});
