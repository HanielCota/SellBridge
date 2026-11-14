import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { supplierProducts, suppliers } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { gotoHydrated } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const run = crypto.randomUUID().slice(0, 8).toUpperCase();
const OWN_SKUS = [`E2E-EXP-A-${run}`, `E2E-EXP-B-${run}`];
const FOREIGN_SKU = `E2E-EXP-ALHEIO-${run}`;
let foreignSupplierId = "";

test.afterAll(async () => {
  await accounts.removeAll();
  if (foreignSupplierId !== "") {
    await database.delete(suppliers).where(eq(suppliers.id, foreignSupplierId));
  }
  await database.$client.end();
});

/** Another brand with a product of its own: the export must never carry it. */
async function seedForeignProduct() {
  const [foreign] = await database
    .insert(suppliers)
    .values({ name: `Marca alheia ${run}`, niche: "Moda", state: "SP", city: "Campinas" })
    .returning({ id: suppliers.id });
  foreignSupplierId = foreign?.id ?? "";
  await database.insert(supplierProducts).values({
    supplierId: foreignSupplierId,
    sku: FOREIGN_SKU,
    title: "Produto de outra marca",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
}

test("o fornecedor baixa os próprios produtos pelo menu e reenvia a planilha sem erros", async ({
  page,
}) => {
  const name = `Ateliê Exporta ${run}`;
  const email = await accounts.signUp(page, name);
  const supplierId = await giveTestBrand(database, email, name);
  await database.insert(supplierProducts).values([
    {
      supplierId,
      sku: OWN_SKUS[0] ?? "",
      title: "Saia plissada midi - Rosa",
      costCents: 123_456,
      suggestedPriceCents: 249_990,
      stock: 12,
      fiscal: { ncm: "62045200", origin: 0, unit: "UN" },
    },
    {
      supplierId,
      sku: OWN_SKUS[1] ?? "",
      title: "Blusa básica",
      costCents: 990,
      suggestedPriceCents: 1990,
      stock: 3,
    },
  ]);
  await seedForeignProduct();

  await gotoHydrated(page, "/fornecedor/painel/produtos");
  await page.getByRole("button", { name: "Editar em planilha" }).click();
  const exportItem = page.getByRole("menuitem", { name: /Baixar produtos/ });
  await expect(exportItem).toContainText("Todos os seus 2 produtos");
  await expect(page.getByRole("menuitem", { name: /Importar planilha/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Baixar planilha modelo/ })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await exportItem.click();
  const download = await downloading;

  expect(download.suggestedFilename()).toMatch(
    /^produtos-atelie-exporta-[a-z0-9]+-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  await expect(page.getByText(`Planilha baixada: ${download.suggestedFilename()}`)).toBeVisible();
  const file = await download.path();
  const csv = await readFile(file, "utf8");
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  expect(lines[0]).toMatch(/^sku;titulo;descricao;custo;estoque;/);
  expect(lines.filter((line) => line.startsWith("E2E-EXP-"))).toEqual([
    `${OWN_SKUS[0]};Saia plissada midi - Rosa;;1234,56;12;;;sim;2499,90;;;;;;;;62045200;0;UN;;;;;;`,
    `${OWN_SKUS[1]};Blusa básica;;9,90;3;;;sim;19,90;;;;;;;;;;;;;;;;`,
  ]);
  expect(csv).not.toContain(FOREIGN_SKU);

  await gotoHydrated(page, "/fornecedor/painel/importar");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

  await expect(page.getByRole("heading", { name: /2 válidas, 0 com erro/ })).toBeVisible();
  await expect(page.getByText("Sem erros", { exact: true })).toBeVisible();
});
