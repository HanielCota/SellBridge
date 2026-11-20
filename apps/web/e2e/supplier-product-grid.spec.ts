import { expect, type Page, test } from "@playwright/test";
import {
  member,
  productModels,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { buildXlsx } from "../../../packages/shared/src/domain/supplier-panel-import.fixtures";
import { e2eDatabase } from "./database";
import { gotoHydrated } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

// Colour and size grid (slices 2b, 3a and 3b): the test site runs with PRODUCT_GRID_ENABLED=true.
const database = e2eDatabase();
const accounts = supplierAccounts(database);
const stamp = Date.now();

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

async function gridRows(supplierId: string) {
  return await database
    .select({ sku: supplierProducts.sku, title: supplierProducts.title })
    .from(supplierProducts)
    .innerJoin(productModels, eq(productModels.id, supplierProducts.modelId))
    .where(eq(productModels.supplierId, supplierId));
}

async function supplierOf(email: string): Promise<string> {
  const [row] = await database
    .select({ id: suppliers.id })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(suppliers, eq(suppliers.organizationId, member.organizationId))
    .where(eq(user.email, email));
  if (row === undefined) {
    throw new Error(`no brand for ${email}`);
  }
  return row.id;
}

async function openStep(page: Page, label: RegExp) {
  await page
    .getByRole("navigation", { name: "Etapas do cadastro" })
    .getByRole("button", { name: label })
    .click();
}

test("o fornecedor cadastra um tênis em duas cores e três tamanhos e vê uma linha só", async ({
  page,
}) => {
  const email = await accounts.signUp(page, `Fornecedor grade ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Calçados grade ${stamp}`);

  await gotoHydrated(page, "/fornecedor/painel/produtos?product=novo");
  await page.getByText("Sim, tem cores ou tamanhos").click();
  await expect(
    page.getByRole("heading", { name: "Novo produto com cores e tamanhos" }),
  ).toBeVisible();
  await openStep(page, /Dados do produto/);
  await page.getByLabel("Título").fill(`Tênis Grade ${stamp}`);
  await expect(page.getByText(/Salvo às/)).toBeVisible();
  await openStep(page, /Cores e tamanhos/);
  await page.getByRole("button", { name: "Preto", exact: true }).click();
  await page.getByRole("button", { name: "Branco", exact: true }).click();
  await page.getByLabel("Novo tamanho").fill("40, 38, 39");
  await page.getByLabel("Novo tamanho").press("Enter");
  await page.getByLabel("Código base").fill(`TEN${stamp}`);
  await page.getByLabel("Estoque (un.)").first().fill("3");
  await page.getByRole("button", { name: "Preencher as 6 combinações" }).click();
  await page.getByLabel("Branco 40").uncheck();
  await expect(page.getByText(/Salvo às/)).toBeVisible();

  // The last autosave may still be on its way: wait for the database, not for the screen.
  await expect
    .poll(async () => (await gridRows(supplierId)).map((row) => row.sku).toSorted(), {
      timeout: 15_000,
    })
    .toEqual(
      [
        `TEN${stamp}-BRANCO-38`,
        `TEN${stamp}-BRANCO-39`,
        `TEN${stamp}-PRETO-38`,
        `TEN${stamp}-PRETO-39`,
        `TEN${stamp}-PRETO-40`,
      ].toSorted(),
    );
  expect((await gridRows(supplierId)).map((row) => row.title)).toContain(
    `Tênis Grade ${stamp} - Preto 38`,
  );

  await page.getByRole("button", { name: "Produtos" }).first().click();
  const row = page.getByText(`Tênis Grade ${stamp}`).filter({ visible: true });
  await expect(row).toHaveCount(1);
  await expect(
    page.getByText("2 cores · 3 tamanhos", { exact: false }).filter({ visible: true }),
  ).toHaveCount(1);
});

test("o fornecedor importa uma planilha com cores e tamanhos e vê o produto numa linha só", async ({
  page,
}) => {
  const email = await accounts.signUp(page, `Fornecedor planilha ${stamp}`);
  await giveTestBrand(database, email, `Calçados planilha ${stamp}`);
  const code = `PLAN${stamp}`;
  const csv = [
    "sku;titulo;custo;estoque;ncm;origem;unidade;codigo_modelo;cor;tamanho",
    `${code}-P-38;Tênis Planilha ${stamp};59,90;4;64039990;0;PAR;${code};Preto;38`,
    `${code}-P-39;Tênis Planilha ${stamp};59,90;2;;;;${code};Preto;39`,
    `${code}-B-38;Tênis Planilha ${stamp};59,90;1;;;;${code};Branco;38`,
  ].join("\n");

  await gotoHydrated(page, "/fornecedor/painel/importar");
  await page.locator('input[type="file"]').setInputFiles({
    name: "grade.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  await expect(page.getByText("1 produto com cores e tamanhos", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /^Importar/ }).click();
  await expect
    .poll(async () => (await gridRows(await supplierOf(email))).length, { timeout: 15_000 })
    .toBe(3);
});

test("o fornecedor importa o catálogo do EnvioVelox e cada tênis em vários tamanhos vira uma grade", async ({
  page,
}) => {
  const email = await accounts.signUp(page, `Fornecedor envio ${stamp}`);
  await giveTestBrand(database, email, `Calçados envio ${stamp}`);
  const name = `Tênis Envio ${stamp}`;
  const file = buildXlsx([
    ["SKU", "Nome produto", "Preço de venda", "Estoque", "Cor", "Tamanho"],
    [`ENV${stamp}-P-38`, name, 59.9, 4, "Preto", "38"],
    [`ENV${stamp}-P-39`, name, 59.9, 2, "Preto", "39"],
    [`ENV${stamp}-B-38`, name, 59.9, 1, "Branco", "38"],
    [`ENV${stamp}-BOLSA`, `Bolsa Envio ${stamp}`, 39.9, 5, "Bege", "Único"],
  ]);

  await gotoHydrated(page, "/fornecedor/painel/importar");
  await page.locator('input[type="file"]').setInputFiles({
    name: "catalogo-envio.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(file),
  });

  await expect(page.getByText("1 produto com cores e tamanhos", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /^Importar/ }).click();
  const supplierId = await supplierOf(email);
  await expect
    .poll(async () => (await gridRows(supplierId)).map((row) => row.sku).toSorted(), {
      timeout: 15_000,
    })
    .toEqual([`ENV${stamp}-B-38`, `ENV${stamp}-P-38`, `ENV${stamp}-P-39`]);
  const [bag] = await database
    .select({ title: supplierProducts.title, modelId: supplierProducts.modelId })
    .from(supplierProducts)
    .where(eq(supplierProducts.sku, `ENV${stamp}-BOLSA`));
  expect(bag).toEqual({ title: `Bolsa Envio ${stamp} - Bege`, modelId: null });
});
