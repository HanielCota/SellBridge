import { expect, test, type Page } from "@playwright/test";
import { member, tenantProfile, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import {
  fillBillingAddress,
  fillBillingAddressFromCep,
  gotoHydrated,
  signUp,
  testCpf,
} from "./helpers";

// NF-e model B: a reseller selling as a company keeps the data its own NF-e carries.
const STATE_REGISTRATION_LABEL = "Inscrição estadual";
const EXEMPT_LABEL = "Minha empresa não tem inscrição estadual (isenta)";

async function fillPersonAndCompany(page: Page) {
  await page.getByLabel("Nome completo").fill("Revendedora Fiscal Lima");
  await page.getByLabel("CPF").fill(testCpf());
  await page.getByLabel("Telefone com DDD").fill("(11) 98765-4321");
  await page.getByLabel("Vendo como empresa (CNPJ)").check();
  await page.getByLabel("CNPJ", { exact: true }).fill("11222333000181");
  await page.getByLabel("Razão social").fill("Revendedora Fiscal Ltda");
}

async function savedFiscalData(email: string) {
  const [row] = await e2eDatabase()
    .select({
      stateRegistration: tenantProfile.stateRegistration,
      taxRegime: tenantProfile.taxRegime,
      billingAddress: tenantProfile.billingAddress,
    })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(tenantProfile, eq(tenantProfile.tenantId, member.organizationId))
    .where(eq(user.email, email));
  return row;
}

test("a company saves its state registration, regime and the city's code", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revendedora Fiscal");
  await fillPersonAndCompany(page);
  await fillBillingAddressFromCep(page);

  await page.getByLabel(STATE_REGISTRATION_LABEL, { exact: true }).fill("110.042.490.114");
  await page.getByRole("radio", { name: /Lucro Presumido/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
  expect(await savedFiscalData(email)).toMatchObject({
    stateRegistration: "110042490114",
    taxRegime: "presumido",
    billingAddress: { ibgeCode: "3550308", state: "SP" },
  });
  await gotoHydrated(page, "/onboarding?step=details");
  await expect(page.getByLabel(STATE_REGISTRATION_LABEL, { exact: true })).toHaveValue(
    "110042490114",
  );
  await expect(page.getByRole("radio", { name: /Lucro Presumido/ })).toBeChecked();
});

test("a company without a state registration ticks the box and is saved as ISENTO", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revendedora Isenta");
  await fillPersonAndCompany(page);
  await fillBillingAddressFromCep(page);

  await page.getByLabel(EXEMPT_LABEL).check();

  await expect(page.getByLabel(STATE_REGISTRATION_LABEL, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Simples Nacional/ })).toBeChecked();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
  expect(await savedFiscalData(email)).toMatchObject({
    stateRegistration: "ISENTO",
    taxRegime: "simples",
  });
});

test("a company is asked for the state registration before saving", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Revendedora Sem Inscricao");
  await fillPersonAndCompany(page);
  await fillBillingAddressFromCep(page);

  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(
    page.getByText(
      "Informe a inscrição estadual só com números. Se a empresa não tem, marque a opção abaixo.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Etapa 1 de 2", { exact: false })).toBeVisible();
});

test("a company must pick its city from the list", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Revendedora Cidade Livre");
  await fillPersonAndCompany(page);
  await fillBillingAddress(page);
  await page.getByLabel(EXEMPT_LABEL).check();

  await page.getByLabel("Cidade").fill("Cidade Que Nao Existe");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(
    page.getByText("Escolha a cidade na lista: a nota fiscal precisa do código dela"),
  ).toBeVisible();
  await expect(page.getByText("Etapa 1 de 2", { exact: false })).toBeVisible();
});
