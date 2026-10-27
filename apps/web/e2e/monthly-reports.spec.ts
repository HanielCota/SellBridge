import { expect, type Page, test } from "@playwright/test";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

async function expectReport(page: Page, path: string, title: string) {
  await gotoHydrated(page, path);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText(/^Gerado por /)).toBeVisible();
}

async function downloadCsv(page: Page, label: string) {
  await page.getByRole("button", { name: "Baixar", exact: true }).click();
  const href = await page
    .getByRole("menuitem", { name: new RegExp(`^${label}`) })
    .getAttribute("href");
  if (href === null) throw new Error("Spreadsheet link missing");
  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["cache-control"]).toBe("no-store");
  await page.keyboard.press("Escape");
  return { href, body: await response.text() };
}

test("the reseller monthly report renders, prints and downloads its own orders", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await expectReport(page, "/financeiro/relatorio", "Relatório de vendas");
  await downloadCsv(page, "Planilha dos pedidos");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Baixar", exact: true })).toBeHidden();
  expect((await page.request.get("/api/admin/exportar/clientes")).status()).toBe(403);
});

test("the supplier report and product download keep the supplier profile", async ({ page }) => {
  const email = await accounts.signUp(page, "Monthly Report Supplier");
  await giveTestBrand(database, email, "Monthly Report Supplier");
  await expectReport(page, "/fornecedor/painel/relatorio", "Relatório do fornecedor");
  const profile = new URL(page.url()).searchParams.get("perfil");
  expect(profile).not.toBeNull();
  const file = await downloadCsv(page, "Planilha dos produtos");
  expect(new URL(file.href, page.url()).searchParams.get("perfil")).toBe(profile);
  expect(file.body).not.toContain(DEMO_USER.email);
});

test("the admin monthly report downloads team and ticket spreadsheets after permission checks", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);
  expect((await page.request.get("/api/admin/exportar/equipe")).status()).toBe(403);
  await enableAdminMode(page);
  await expectReport(page, "/admin/relatorio", "Relatório do suporte e da equipe");
  await downloadCsv(page, "Planilha da equipe");
  await downloadCsv(page, "Planilha dos chamados");
});
