import { expect, test } from "@playwright/test";
import { categories, supplierProducts } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const stamp = Date.now();
const title = `Luminária de mesa publicada ${stamp}`;

test.afterAll(async () => {
  await accounts.removeAll();
});

/*
 * Since 2026-11-04 there is no team review: a complete product the supplier publishes reaches
 * the resellers at once. Before, it waited "Em análise" and its supplier stayed hidden.
 */
test("o fornecedor publica um produto completo e o revendedor já o vê", async ({
  page,
  browser,
}) => {
  const email = await accounts.signUp(page, `Fornecedor publica ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Marca publica ${stamp}`);
  const [category] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, "casa"));
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `PUB-${stamp}`,
      title,
      description: "Luminária de mesa com cúpula de tecido e base de madeira, para teste.",
      costCents: 4500,
      suggestedPriceCents: 8990,
      stock: 12,
      categoryId: category?.id ?? null,
      imageUrls: ["https://imagens.sellbridge.test/luminaria.jpg"],
      reviewStatus: "draft",
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) {
    throw new Error("produto de teste não criado");
  }

  await gotoHydrated(page, `/fornecedor/painel/produtos?product=${product.id}`);
  await page.getByRole("button", { name: /Revisão/ }).click();
  await page.getByRole("button", { name: "Publicar", exact: true }).click();

  await expect(page.getByText("Produto publicado: já aparece para os revendedores")).toBeVisible();
  const reseller = await browser.newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/fornecedores/${supplierId}`);
  await expect(reseller.getByRole("heading", { name: title })).toBeVisible();
  await reseller.close();
});
