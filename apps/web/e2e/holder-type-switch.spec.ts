import { expect, test, type Page, type Request } from "@playwright/test";
import { gotoHydrated, signUp, testCpf } from "./helpers";

// L2-2: switching between CPF and CNPJ clears the other mode's fields, and the save never mixes
// the two.
const CNPJ = { typed: "11222333000181", digits: "11222333000181", formatted: "11.222.333/0001-81" };
const COMPANY_NAME = "Revenda Troca Ltda";

function companyBox(page: Page) {
  return page.getByLabel("Vendo como empresa (CNPJ)");
}

function cnpjField(page: Page) {
  return page.getByLabel("CNPJ", { exact: true });
}

function companyNameField(page: Page) {
  return page.getByLabel("Razão social");
}

async function fillPerson(page: Page) {
  await page.getByLabel("Nome completo").fill("Revendedor Troca Silva");
  await page.getByLabel("CPF").fill(testCpf());
  await page.getByLabel("Telefone com DDD").fill("(11) 98765-4321");
}

async function fillCompany(page: Page) {
  await companyBox(page).check();
  await cnpjField(page).fill(CNPJ.typed);
  await companyNameField(page).fill(COMPANY_NAME);
  await expect(cnpjField(page)).toHaveValue(CNPJ.formatted);
}

/** The holder save: the only server call whose body carries the typed phone. */
function waitForHolderSave(page: Page): Promise<Request> {
  return page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().includes("_serverFn") &&
      (request.postData()?.includes("98765") ?? false),
  );
}

function expectNoCompanyIn(body: string) {
  expect(body).not.toContain(CNPJ.digits);
  expect(body).not.toContain(CNPJ.formatted);
  expect(body).not.toContain(COMPANY_NAME);
}

for (const width of [375, 1440]) {
  test(`company fields come back empty after unticking and ticking again (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await signUp(page, "Revendedor Troca");
    await fillPerson(page);
    await fillCompany(page);

    await companyBox(page).uncheck();
    await expect(cnpjField(page)).toHaveCount(0);
    await companyBox(page).check();
    await expect(cnpjField(page)).toHaveValue("");
    await expect(companyNameField(page)).toHaveValue("");
    await expect(page.getByText("Confira o CNPJ")).toHaveCount(0);
    await expect(page.getByLabel("CPF")).not.toHaveValue("");
  });
}

test("saving as CPF after typing a CNPJ sends no company", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Revendedor Desiste Empresa");
  await fillPerson(page);
  await fillCompany(page);
  await companyBox(page).uncheck();

  const save = waitForHolderSave(page);
  await page.getByRole("button", { name: "Continuar" }).click();
  expectNoCompanyIn((await save).postData() ?? "");
  await expect(page.getByText("Etapa 2 de 2 · Origem dos produtos")).toBeVisible();

  await gotoHydrated(page, "/onboarding?step=details");
  await expect(companyBox(page)).not.toBeChecked();
  await companyBox(page).check();
  await expect(cnpjField(page)).toHaveValue("");
  await expect(companyNameField(page)).toHaveValue("");
});

test("a saved company is removed when the seller switches to CPF", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Revendedor Volta Pessoa");
  await fillPerson(page);
  await fillCompany(page);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Etapa 2 de 2 · Origem dos produtos")).toBeVisible();

  await gotoHydrated(page, "/onboarding?step=details");
  await expect(cnpjField(page)).toHaveValue(CNPJ.formatted);
  await companyBox(page).uncheck();
  const save = waitForHolderSave(page);
  await page.getByRole("button", { name: "Salvar dados", exact: true }).click();
  expectNoCompanyIn((await save).postData() ?? "");
  await expect(page.getByRole("button", { name: "Dados salvos", exact: true })).toBeVisible();

  await gotoHydrated(page, "/onboarding?step=details");
  await expect(companyBox(page)).not.toBeChecked();
  await companyBox(page).check();
  await expect(cnpjField(page)).toHaveValue("");
});

test("switching back to company after a failed save asks for the CNPJ again", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Revendedor Erra Cnpj");
  await fillPerson(page);
  await companyBox(page).check();
  await cnpjField(page).fill("11222333000182");
  await companyNameField(page).fill(COMPANY_NAME);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Confira o CNPJ: os dígitos não batem")).toBeVisible();

  await companyBox(page).uncheck();
  await companyBox(page).check();
  await expect(cnpjField(page)).toHaveValue("");
  await expect(page.getByText("Confira o CNPJ: os dígitos não batem")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Informe a razão social")).toBeVisible();
  await expect(page.getByText("Etapa 1 de 2", { exact: false })).toBeVisible();
});
