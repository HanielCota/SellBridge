import { expect, type Page, test } from "@playwright/test";
import { productModels, supplierProducts } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

// Colour and size grid (slice 2b): the test site runs with PRODUCT_GRID_ENABLED=true.
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
