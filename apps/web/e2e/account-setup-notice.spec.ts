import { expect, type Page, test } from "@playwright/test";
import { member, supplierPaymentAccounts, tenantProfile, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated, labelContentMismatches, signUp, testCpf } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

function headerNotice(page: Page, action: string) {
  return page.getByRole("banner").getByRole("link", { name: new RegExp(`· ${action}$`) });
}

/** A retrying "count is 0" would pass before React renders the answer: wait, then look once. */
async function expectNoNotice(page: Page, action: string) {
  await page.waitForTimeout(1500);
  expect(await headerNotice(page, action).count()).toBe(0);
}

async function tenantOf(email: string): Promise<string> {
  const [row] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (row === undefined) {
    throw new Error(`Conta de teste sem perfil: ${email}`);
  }
  return row.tenantId;
}

test("a supplier without a receiving account is asked to open one, then for a product", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await accounts.signUp(page, "Ateliê Aviso");
  const supplierId = await giveTestBrand(database, email, "Ateliê Aviso");

  await gotoHydrated(page, "/fornecedor/painel");
  const receiving = headerNotice(page, "Abrir conta para receber");
  await expect(receiving).toHaveAccessibleName(
    "Sua conta de recebimento não está aberta · Abrir conta para receber",
  );
  await receiving.click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/recebimentos/);
  // Recebimentos is where the account is opened: the header does not repeat it there.
  await expectNoNotice(page, "Abrir conta para receber");

  await database.insert(supplierPaymentAccounts).values({
    supplierId,
    provider: "asaas",
    status: "connected",
    reviewStatus: "approved",
    walletId: "e2e-wallet-aviso",
  });
  await gotoHydrated(page, "/fornecedor/painel");

  await expect(headerNotice(page, "Cadastrar produto")).toBeVisible();
  await expectNoNotice(page, "Abrir conta para receber");
});

test("a reseller company without an address is asked for it until it is saved", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revenda Aviso");
  const tenantId = await tenantOf(email);
  await database
    .insert(tenantProfile)
    .values({
      tenantId,
      fullName: "Revenda Aviso Lima",
      cpf: testCpf().replace(/\D/g, ""),
      cnpj: "11222333000181",
      companyName: "Revenda Aviso Ltda",
    })
    .onConflictDoUpdate({
      target: tenantProfile.tenantId,
      set: {
        fullName: "Revenda Aviso Lima",
        cnpj: "11222333000181",
        companyName: "Revenda Aviso Ltda",
      },
    });

  await gotoHydrated(page, "/dashboard");
  await expect(headerNotice(page, "Completar dados da empresa")).toHaveAccessibleName(
    "Falta o endereço da sua empresa · Completar dados da empresa",
  );
  // The phone shows only "Sua empresa": voice control still finds the link by it.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(headerNotice(page, "Completar dados da empresa")).toHaveText(/Sua empresa/);
  expect(await labelContentMismatches(page)).toEqual([]);

  await database
    .update(tenantProfile)
    .set({
      stateRegistration: "ISENTO",
      billingAddress: {
        cep: "01001000",
        street: "Praça da Sé",
        number: "100",
        complement: "",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
        ibgeCode: "3550308",
      },
    })
    .where(eq(tenantProfile.tenantId, tenantId));
  await gotoHydrated(page, "/dashboard");

  await expectNoNotice(page, "Completar dados da empresa");
});
