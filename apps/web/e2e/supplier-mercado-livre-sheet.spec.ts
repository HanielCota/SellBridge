import { expect, type Page, test } from "@playwright/test";
import { member, supplierProducts, suppliers, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated, pickBrandNiche, signUpAsSupplier } from "./helpers";
import { giveTestBrand } from "./supplier-accounts";

/*
 * The product form asks what Mercado Livre shows on the listing: its category for the title and
 * the category's own fields. The test site answers from a recorded handbag category (Bolsas,
 * Mochilas), never from the real Mercado Livre.
 */
const database = e2eDatabase();
const emails: string[] = [];
const SAVE_TIMEOUT = 15_000;

async function storedProduct(sku: string) {
  const [row] = await database
    .select({
      categoryId: supplierProducts.mercadoLivreCategoryId,
      categoryName: supplierProducts.mercadoLivreCategoryName,
      attributes: supplierProducts.mercadoLivreAttributes,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.sku, sku));
  return row ?? null;
}

async function openNewProduct(page: Page, sku: string) {
  await gotoHydrated(page, "/fornecedor/painel/produtos?product=novo");
  await page.getByRole("button", { name: /2\..*Dados obrigatórios/ }).click();
  await page.getByLabel("Código", { exact: true }).fill(sku);
  await page.getByLabel("Título", { exact: true }).fill("Bolsinha infantil preta com zíper");
}

test.afterAll(async () => {
  for (const email of emails) {
    const [account] = await database
      .select({ organizationId: member.organizationId })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(eq(user.email, email));
    if (account !== undefined) {
      await database.delete(suppliers).where(eq(suppliers.organizationId, account.organizationId));
    }
    await database.delete(user).where(eq(user.email, email));
  }
  await database.$client.end();
});

async function storedTerms(sku: string) {
  const [row] = await database
    .select({
      warrantyType: supplierProducts.warrantyType,
      warrantyDays: supplierProducts.warrantyDays,
      videoUrl: supplierProducts.videoUrl,
      madeToOrderDays: supplierProducts.madeToOrderDays,
      carrierOnly: supplierProducts.carrierOnly,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.sku, sku));
  return row ?? null;
}

test("the product form saves warranty, video, made-to-order time and carrier-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = await signUpAsSupplier(page, "Ateliê Garantia");
  emails.push(email);
  await page.getByLabel("Nome da marca").fill("Ateliê Garantia");
  await pickBrandNiche(page, "Casa e decoração");
  await page.getByLabel("Cidade de onde você envia").fill("Cunha");
  await page.getByRole("button", { name: /^(Cadastrar marca|Salvar)$/ }).click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);
  const sku = `GARANTIA-${Date.now()}`;
  await openNewProduct(page, sku);

  await page.getByRole("combobox", { name: "Garantia" }).click();
  await page.getByRole("option", { name: "Garantia do vendedor" }).click();
  await expect(page.getByText("Informe quantos dias de garantia, como 90.")).toBeVisible();
  await page.getByLabel("Tempo de garantia (dias)").fill("90");
  await page.getByLabel("Vídeo do produto no YouTube (opcional)").fill("https://vimeo.com/123");
  await expect(page.locator("#panel-product-videoUrl-error")).toContainText(
    "Cole o link de um vídeo do YouTube",
  );
  await page
    .getByLabel("Vídeo do produto no YouTube (opcional)")
    .fill("https://youtu.be/abc123DEF45");
  await page.getByRole("switch", { name: "Produto sob encomenda" }).click();
  await page.getByLabel(/Dias para ficar pronto/).fill("5");
  await page.getByRole("switch", { name: "Somente transportadora" }).click();

  await expect
    .poll(async () => await storedTerms(sku), { timeout: SAVE_TIMEOUT })
    .toEqual({
      warrantyType: "seller",
      warrantyDays: 90,
      videoUrl: "https://youtu.be/abc123DEF45",
      madeToOrderDays: 5,
      carrierOnly: true,
    });
});

test("the product form asks the Mercado Livre category and its own fields", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = await signUpAsSupplier(page, "Ateliê Bolsas");
  emails.push(email);
  await page.getByLabel("Nome da marca").fill("Ateliê Bolsas");
  await pickBrandNiche(page, "Casa e decoração");
  await page.getByLabel("Cidade de onde você envia").fill("Cunha");
  await page.getByRole("button", { name: /^(Cadastrar marca|Salvar)$/ }).click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);
  const sku = `BOLSA-${Date.now()}`;

  await openNewProduct(page, sku);

  await expect(page.getByText("Categoria no Mercado Livre:")).toBeVisible({
    timeout: SAVE_TIMEOUT,
  });
  await expect(page.getByText("Bolsas", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Modelo (obrigatório)")).toBeVisible();
  // A missing brand goes as the generic one, so the brand is asked but never required.
  await expect(page.getByRole("textbox", { name: "Marca", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Gênero" }).click();
  await page.getByRole("option", { name: "Meninas" }).click();
  await page.getByRole("combobox", { name: "É vegano" }).click();
  await page.getByRole("option", { name: "Não" }).click();
  await expect
    .poll(async () => await storedProduct(sku), { timeout: SAVE_TIMEOUT })
    .toMatchObject({
      categoryId: "MLB7022",
      categoryName: "Bolsas",
      attributes: { GENDER: "Meninas", IS_VEGAN: "Não" },
    });

  await page.getByRole("button", { name: "Trocar categoria" }).click();
  await page.getByRole("button", { name: "Buscar categorias" }).click();
  await page.getByRole("button", { name: "Mochilas" }).click();

  await expect(page.getByText("Mochilas", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await storedProduct(sku))?.categoryId, { timeout: SAVE_TIMEOUT })
    .toBe("MLB1430");
});

// Regression: the note under the brand and the "no barcode" box under the barcode stretched the
// grid row, so the input beside each of them sat lower than its neighbor on a computer screen.
test("keeps side by side sheet inputs on the same line on a computer screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const email = await signUpAsSupplier(page, "Ateliê Bolsas Alinhadas");
  emails.push(email);
  await page.getByLabel("Nome da marca").fill("Ateliê Bolsas Alinhadas");
  await pickBrandNiche(page, "Casa e decoração");
  await page.getByLabel("Cidade de onde você envia").fill("Cunha");
  await page.getByRole("button", { name: /^(Cadastrar marca|Salvar)$/ }).click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);

  await openNewProduct(page, `BOLSA-ALINHADA-${Date.now()}`);
  await expect(page.getByLabel("Modelo (obrigatório)")).toBeVisible({ timeout: SAVE_TIMEOUT });

  const topOf = async (name: string) =>
    (await page.getByRole("textbox", { name, exact: true }).boundingBox())?.y;
  expect(await topOf("Marca")).toBe(await topOf("Modelo (obrigatório)"));
  expect(await topOf("Código de barras (GTIN)")).toBe(await topOf("Peso da embalagem (g)"));
});

// Regression: a saved product without a Mercado Livre category got the first guess filled in on
// opening, which the autosave then wrote, changing an approved product nobody had edited.
test("opening an approved product without a Mercado Livre category changes nothing", async ({
  page,
}) => {
  const email = await signUpAsSupplier(page, "Ateliê Só Abriu");
  emails.push(email);
  const supplierId = await giveTestBrand(database, email, `Ateliê Só Abriu ${Date.now()}`);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `SO-ABRIU-${Date.now()}`,
      title: "Bolsinha infantil preta com zíper",
      description: "Bolsinha de teste, aprovada antes de a ficha do Mercado Livre existir.",
      costCents: 2500,
      suggestedPriceCents: 4990,
      stock: 10,
      imageUrls: [],
      reviewStatus: "approved",
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) {
    throw new Error("test product not created");
  }
  const storedRow = async () =>
    (await database.select().from(supplierProducts).where(eq(supplierProducts.id, product.id)))[0];
  const before = await storedRow();

  await gotoHydrated(page, `/fornecedor/painel/produtos?product=${product.id}`);
  await page.getByRole("button", { name: /2..*Dados obrigatórios/ }).click();
  // Mercado Livre answered with its guess, whether the form offers it or fills it in.
  await expect(page.getByText(/Categoria (sugerida )?no Mercado Livre:/)).toBeVisible({
    timeout: SAVE_TIMEOUT,
  });
  // Longer than the autosave pause: a save started by opening would have landed by now.
  await page.waitForTimeout(3000);

  expect(await storedRow()).toEqual(before);
  expect(before?.reviewStatus).toBe("approved");

  await page.getByRole("button", { name: "Usar esta categoria" }).click();
  await expect
    .poll(async () => (await storedRow())?.mercadoLivreCategoryId, { timeout: SAVE_TIMEOUT })
    .toBe("MLB7022");
});
