import { expect, test, type Page } from "@playwright/test";
import { member, supplierApprovals, suppliers, user } from "@sellbridge/database/schema";
import { isValidCnpj } from "@sellbridge/shared/account-documents";
import { TEST_SUPPLIER_FISCAL } from "@sellbridge/database/testing/shipment-invoice";
import { eq } from "drizzle-orm";
import { CNPJ_FIXTURE_PREFIX } from "./cnpj.fixture";
import { e2eDatabase } from "./database";
import { ADMIN_USER, enableAdminMode, gotoHydrated, pickBrandNiche, signIn } from "./helpers";
import { supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const stamp = Date.now();

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

/** A CNPJ with valid check digits, different for each test, so answers never collide. */
function uniqueCnpj(seed: number): string {
  const base = `${String(stamp + seed).slice(-8)}0001`;
  for (let check = 0; check < 100; check += 1) {
    const candidate = `${base}${String(check).padStart(2, "0")}`;
    if (isValidCnpj(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Nenhum dígito verificador serve para ${base}`);
}

async function answerCnpj(
  page: Page,
  answer: { cnpj: string; situation: "active" | "closed"; legalName: string },
) {
  const response = await page.request.post(`${CNPJ_FIXTURE_PREFIX}/test/answer`, { data: answer });
  expect(response.ok()).toBe(true);
}

async function supplierIdOf(email: string): Promise<string> {
  const [row] = await database
    .select({ id: suppliers.id })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(suppliers, eq(suppliers.organizationId, member.organizationId))
    .where(eq(user.email, email));
  if (row === undefined) {
    throw new Error(`Marca não encontrada para ${email}`);
  }
  return row.id;
}

/** Signs a supplier up and registers its brand through the panel, still without a CNPJ. */
async function registerBrand(page: Page, name: string): Promise<string> {
  const email = await accounts.signUp(page, name);
  await page.getByLabel("Nome da marca").fill(name);
  await pickBrandNiche(page, "Casa e decoração");
  await page.getByLabel("Cidade de onde você envia").fill("Cunha");
  await page.getByRole("button", { name: "Cadastrar marca" }).click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);
  return email;
}

/** Stands in for typing "Dados fiscais da empresa", then saves the brand, which runs the check. */
async function saveCompanyData(page: Page, email: string, cnpj: string) {
  await database
    .update(suppliers)
    .set({ fiscalProfile: { ...TEST_SUPPLIER_FISCAL, cnpj } })
    .where(eq(suppliers.id, await supplierIdOf(email)));
  await gotoHydrated(page, "/fornecedor/painel/marca");
  await page.getByLabel("Cidade de onde você envia").fill("Taubaté");
  await page
    .getByRole("region", { name: "Alterações não salvas" })
    .getByRole("button", { name: "Salvar" })
    .click();
  await expect(page.getByText("Dados da marca salvos")).toBeVisible();
}

test("fornecedor novo fica em análise e é aprovado sozinho com o CNPJ ativo", async ({ page }) => {
  const name = `Olaria Aprovada ${stamp}`;
  const cnpj = uniqueCnpj(1);
  const email = await registerBrand(page, name);

  const banner = page.getByText("Sua marca está em análise");
  await expect(banner).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Falta informar o CNPJ e a razão social em Dados fiscais da empresa",
    }),
  ).toBeVisible();

  await answerCnpj(page, { cnpj, situation: "active", legalName: TEST_SUPPLIER_FISCAL.legalName });
  await saveCompanyData(page, email, cnpj);

  await expect(banner).toHaveCount(0);
  const [stored] = await database
    .select({ approvalStatus: suppliers.approvalStatus })
    .from(suppliers)
    .where(eq(suppliers.id, await supplierIdOf(email)));
  expect(stored?.approvalStatus).toBe("approved");
});

test("CNPJ baixado vai para a fila da equipe, que recusa com o motivo", async ({
  page,
  browser,
}) => {
  const name = `Olaria Baixada ${stamp}`;
  const cnpj = uniqueCnpj(2);
  const email = await registerBrand(page, name);
  await answerCnpj(page, { cnpj, situation: "closed", legalName: TEST_SUPPLIER_FISCAL.legalName });
  await saveCompanyData(page, email, cnpj);
  await expect(
    page.getByText(/CNPJ inativo na Receita\. A equipe SellBridge vai conferir/),
  ).toBeVisible();

  const team = await browser.newContext();
  const admin = await team.newPage();
  await signIn(admin, ADMIN_USER);
  await enableAdminMode(admin);
  await gotoHydrated(admin, "/admin/fornecedores");
  await admin.getByRole("link", { name: /esperam? sua análise/ }).click();
  await expect(admin).toHaveURL(/\/admin\/fornecedores\/aprovacao/);
  const item = admin.getByRole("listitem").filter({ hasText: name });
  await expect(item.getByText("CNPJ não está ativo na Receita")).toBeVisible();
  await expect(item.getByText("(BAIXADA)", { exact: false })).toBeVisible();

  await item.getByRole("button", { name: "Recusar" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByRole("button", { name: "Recusar cadastro" }).click();
  await expect(dialog.getByText(/pelo menos 10 letras/)).toBeVisible();
  await dialog
    .getByLabel("Motivo para o fornecedor")
    .fill("O CNPJ está baixado na Receita. Cadastre o CNPJ ativo da empresa.");
  await dialog.getByRole("button", { name: "Recusar cadastro" }).click();
  await expect(admin.getByText(`Cadastro de ${name} recusado`)).toBeVisible();
  await expect(item).toHaveCount(0);
  await team.close();

  await gotoHydrated(page, "/fornecedor/painel");
  await expect(page.getByText("O cadastro da sua marca foi recusado")).toBeVisible();
  await expect(
    page.getByText("O CNPJ está baixado na Receita. Cadastre o CNPJ ativo da empresa."),
  ).toBeVisible();
});

test("aprovar mesmo assim um fornecedor recusado sozinho pergunta antes e mostra a consequência", async ({
  page,
  browser,
}) => {
  const name = `Olaria MEI ${stamp}`;
  const email = await registerBrand(page, name);
  const supplierId = await supplierIdOf(email);
  const reason = "A empresa é MEI. Fale com o suporte se ela já saiu do MEI.";
  await database
    .update(suppliers)
    .set({ approvalStatus: "refused" })
    .where(eq(suppliers.id, supplierId));
  const decided = {
    stage: null,
    decidedBy: "automatic" as const,
    decidedAt: new Date(),
    refusalReason: reason,
  };
  await database
    .insert(supplierApprovals)
    .values({ supplierId, ...decided })
    .onConflictDoUpdate({ target: supplierApprovals.supplierId, set: decided });

  const team = await browser.newContext();
  const admin = await team.newPage();
  await signIn(admin, ADMIN_USER);
  await enableAdminMode(admin);
  await gotoHydrated(admin, `/admin/fornecedores/${supplierId}`);
  await admin.getByRole("button", { name: "Aprovar mesmo assim" }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog.getByText(/passam a aparecer para os revendedores/)).toBeVisible();
  await dialog.getByRole("button", { name: "Voltar" }).click();
  await expect(dialog).toHaveCount(0);
  const [stillRefused] = await database
    .select({ approvalStatus: suppliers.approvalStatus })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  expect(stillRefused?.approvalStatus).toBe("refused");

  await admin.getByRole("button", { name: "Aprovar mesmo assim" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Aprovar fornecedor" }).click();
  await expect(admin.getByText(`${name} aprovado`)).toBeVisible();
  await team.close();
  const [stored] = await database
    .select({ approvalStatus: suppliers.approvalStatus })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  expect(stored?.approvalStatus).toBe("approved");
});
