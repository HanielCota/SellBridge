import { expect, test } from "@playwright/test";
import { supplierProducts } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const stamp = Date.now();
const title = `Tênis cadastrado errado ${stamp}`;

test.afterAll(async () => {
  await accounts.removeAll();
});

async function newApprovedProduct(supplierId: string, sku: string, productTitle: string) {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku,
      title: productTitle,
      description: "Produto de teste para tirar da venda",
      costCents: 2500,
      suggestedPriceCents: 4990,
      stock: 10,
      imageUrls: [],
      reviewStatus: "approved",
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) {
    throw new Error(`produto de teste ${sku} não criado`);
  }
  return product.id;
}

async function productActive(productId: string): Promise<boolean | undefined> {
  const [row] = await database
    .select({ active: supplierProducts.active })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId));
  return row?.active;
}

/*
 * Regression: the supplier panel had no way to take a wrongly registered product off sale. Only
 * the team or a spreadsheet re-import with "ativo" set to "não" could.
 */
test("o fornecedor tira da venda um produto cadastrado errado e depois o reativa", async ({
  page,
}) => {
  const email = await accounts.signUp(page, `Fornecedor fora de venda ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Marca fora de venda ${stamp}`);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `OFF-${stamp}`,
      title,
      description: "Produto de teste para tirar da venda",
      costCents: 2500,
      suggestedPriceCents: 4990,
      stock: 10,
      imageUrls: [],
      reviewStatus: "approved",
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) {
    throw new Error("produto de teste não criado");
  }

  await gotoHydrated(page, "/fornecedor/painel/produtos");
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("button", { name: "Desativar" }).click();
  const dialog = page.getByRole("dialog", { name: "Desativar este produto?" });
  await expect(dialog).toContainText("sai do catálogo dos revendedores");
  await dialog.getByRole("button", { name: "Desativar" }).click();

  await expect(row.getByText("Desativado", { exact: true })).toBeVisible();
  await expect.poll(async () => await productActive(product.id)).toBe(false);
  await row.getByRole("button", { name: "Reativar" }).click();
  await expect(row.getByRole("button", { name: "Desativar" })).toBeVisible();
  await expect(row.getByText("Desativado", { exact: true })).toHaveCount(0);
  await expect.poll(async () => await productActive(product.id)).toBe(true);
});

/*
 * Regression: a product registered by mistake that nobody ever published or sold could not be
 * removed from the supplier's list.
 */
test("o fornecedor exclui um produto que ninguém publicou nem vendeu", async ({ page }) => {
  const email = await accounts.signUp(page, `Fornecedor exclusão ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Marca exclusão ${stamp}`);
  const doomed = `Produto excluído ${stamp}`;
  const productId = await newApprovedProduct(supplierId, `DEL-${stamp}`, doomed);

  await gotoHydrated(page, "/fornecedor/painel/produtos");
  const row = page.getByRole("row").filter({ hasText: doomed });
  await row.getByRole("button", { name: "Excluir" }).click();
  const dialog = page.getByRole("dialog", { name: "Excluir este produto?" });
  await expect(dialog).toContainText("Não dá para desfazer");
  await dialog.getByRole("button", { name: "Excluir" }).click();

  await expect(page.getByText(doomed)).toHaveCount(0);
  await expect.poll(async () => await productActive(productId)).toBeUndefined();
});
