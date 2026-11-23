import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  createListingWithTargets,
  groupProducts,
  markTargetPublished,
  upsertStoreConnection,
} from "@sellbridge/database/repositories";
import {
  listings,
  member,
  productModels,
  storeConnections,
  supplierProducts,
  user,
} from "@sellbridge/database/schema";
import { eq, inArray } from "drizzle-orm";
import { testStoreInput } from "../../../packages/database/src/testing/fixtures";
import { e2eDatabase } from "./database";
import { DEMO_USER, gotoHydrated } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

// Grouping existing products into a grid (slice 4): the test site runs with
// PRODUCT_GRID_ENABLED=true. Listings point at the products, so ids must never change.
const database = e2eDatabase();
const accounts = supplierAccounts(database);
const stamp = randomUUID().slice(0, 8);
const name = `Tênis Junta ${stamp}`;
const fiscal = { ncm: "64039990", origin: 0, unit: "PAR" as const };
const listingIds: string[] = [];
const storeIds: string[] = [];

test.afterAll(async () => {
  if (listingIds.length > 0) {
    await database.delete(listings).where(inArray(listings.id, listingIds));
  }
  if (storeIds.length > 0) {
    await database.delete(storeConnections).where(inArray(storeConnections.id, storeIds));
  }
  await accounts.removeAll();
  await database.$client.end();
});

async function demoTenant(): Promise<string> {
  const [account] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, DEMO_USER.email))
    .limit(1);
  if (account === undefined) {
    throw new Error(`Conta de teste sem perfil: ${DEMO_USER.email}`);
  }
  return account.tenantId;
}

async function seedShoes(supplierId: string) {
  return await database
    .insert(supplierProducts)
    .values(
      [
        { variant: "Preto 38", sku: "PRE-38", stock: 5, reservedStock: 1 },
        { variant: "Preto 39", sku: "PRE-39", stock: 4, reservedStock: 0 },
        { variant: "Branco 38", sku: "BRA-38", stock: 3, reservedStock: 0 },
      ].map((entry) => ({
        supplierId,
        sku: `JUN${stamp}-${entry.sku}`,
        title: `${name} - ${entry.variant}`,
        description: `Tênis de couro na cor ${entry.variant}, confortável para o dia todo.`,
        costCents: 5000,
        suggestedPriceCents: 9990,
        stock: entry.stock,
        reservedStock: entry.reservedStock,
        fiscal,
        fiscalRequired: true,
        reviewStatus: "approved" as const,
      })),
    )
    .returning();
}

/** A reseller's listing already on the air for one size, as before grids existed. */
async function oldListing(supplierId: string, productId: string): Promise<string> {
  const tenantId = await demoTenant();
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenantId, `junta-${stamp}`),
    supplierId,
  });
  storeIds.push(store.id);
  const created = await createListingWithTargets(
    database,
    tenantId,
    {
      supplierProductId: productId,
      title: "Tênis do revendedor",
      description: "Texto do revendedor",
      priceCents: 14990,
    },
    [store.id],
  );
  listingIds.push(created.listingId);
  const [targetId] = created.targetIds;
  if (targetId === undefined) {
    throw new Error("listing target not created");
  }
  await markTargetPublished(database, targetId, {
    externalId: `MLB-${stamp}`,
    externalUrl: null,
  });
  return created.listingId;
}

async function rows(ids: readonly string[]) {
  return await database
    .select({
      id: supplierProducts.id,
      modelId: supplierProducts.modelId,
      title: supplierProducts.title,
      stock: supplierProducts.stock,
      reservedStock: supplierProducts.reservedStock,
      reviewStatus: supplierProducts.reviewStatus,
    })
    .from(supplierProducts)
    .where(inArray(supplierProducts.id, [...ids]))
    .orderBy(supplierProducts.sku);
}

async function groupFromSuggestions(page: Page) {
  await gotoHydrated(page, "/fornecedor/painel/produtos");
  await page.getByRole("button", { name: "Juntar cores e tamanhos" }).click();
  await expect(page.getByRole("heading", { name: "Sugestões de grade" })).toBeVisible();
  await expect(page.getByText("1 anúncio no ar")).toBeVisible();
  await expect(
    page.getByText("O anúncio que os revendedores já têm no ar continua igual e vendendo.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Juntar 3 produtos" }).click();
  await expect(page.getByText(`3 produtos juntados em ${name}`)).toBeVisible();
}

test("o fornecedor junta três tamanhos que já vendia, desfaz e depois separa de novo", async ({
  page,
}) => {
  const email = await accounts.signUp(page, `Fornecedor junta ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Calçados junta ${stamp}`);
  const shoes = await seedShoes(supplierId);
  const ids = shoes.map((shoe) => shoe.id);
  const before = await rows(ids);
  const listingId = await oldListing(supplierId, shoes[0]?.id ?? "");

  await groupFromSuggestions(page);
  await expect.poll(async () => (await rows(ids)).every((row) => row.modelId !== null)).toBe(true);
  const grouped = await rows(ids);
  expect(grouped.map(({ modelId: _model, title: _title, ...kept }) => kept)).toEqual(
    before.map(({ modelId: _model, title: _title, ...kept }) => kept),
  );
  expect(new Set(grouped.map((row) => row.modelId)).size).toBe(1);
  const [listing] = await database
    .select({ title: listings.title, productId: listings.supplierProductId })
    .from(listings)
    .where(eq(listings.id, listingId));
  expect(listing).toEqual({ title: "Tênis do revendedor", productId: shoes[0]?.id });

  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect.poll(async () => await rows(ids)).toEqual(before);

  await groupFromSuggestions(page);
  const modelId = (await rows(ids))[0]?.modelId ?? "";
  await gotoHydrated(page, `/fornecedor/painel/produtos?grade=${modelId}`);
  await page.getByRole("button", { name: "Separar de novo" }).click();
  await page.getByRole("button", { name: "Separar 3 produtos" }).click();
  await expect(page.getByText("3 produtos separados de novo")).toBeVisible();
  await expect.poll(async () => await rows(ids)).toEqual(before);
});

test("um produto com a mesma cor e tamanho de outro fica marcado e o botão espera", async ({
  page,
}) => {
  const email = await accounts.signUp(page, `Fornecedor repete ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Calçados repete ${stamp}`);
  await seedShoes(supplierId);

  await gotoHydrated(page, "/fornecedor/painel/produtos?sugestoes=grade");
  // The first card row is Branco 38; typed as Preto 39 it repeats the Preto 39 product.
  await page.getByLabel("Cor", { exact: true }).first().fill("Preto");
  await page.getByLabel("Tamanho", { exact: true }).first().fill("39");

  await expect(
    page.getByText(`Preto 39 já é o código JUN${stamp}-BRA-38: corrija a cor ou o tamanho`),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Juntar 3 produtos" })).toBeDisabled();
});

test("abrir uma grade juntada não salva nada nem tira produto de venda", async ({ page }) => {
  const email = await accounts.signUp(page, `Fornecedor abre ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Calçados abre ${stamp}`);
  const shoes = await seedShoes(supplierId);
  const ids = shoes.map((shoe) => shoe.id);
  const result = await groupProducts(database, {
    supplierId,
    groupedBy: "e2e",
    modelTitle: name,
    mainProductId: shoes[0]?.id ?? "",
    products: shoes.map((shoe) => {
      const [color = null, size = null] = shoe.title.split(" - ")[1]?.split(" ") ?? [];
      return { productId: shoe.id, color, size };
    }),
  });
  if (!result.grouped) {
    throw new Error("grouping refused");
  }
  const modelVersion = async () =>
    (
      await database
        .select({ updatedAt: productModels.updatedAt })
        .from(productModels)
        .where(eq(productModels.id, result.modelId))
    )[0]?.updatedAt.getTime();
  const before = { model: await modelVersion(), rows: await rows(ids) };

  await gotoHydrated(page, `/fornecedor/painel/produtos?grade=${result.modelId}`);
  await page
    .getByRole("button", { name: /Dados do produto/ })
    .first()
    .click();
  // Mercado Livre answered with its guess, whether the form offers it or fills it in.
  await expect(page.getByText(/Categoria (sugerida )?no Mercado Livre:/)).toBeVisible();
  // Longer than the autosave pause: a save started by opening would have landed by now.
  await page.waitForTimeout(3000);

  expect({ model: await modelVersion(), rows: await rows(ids) }).toEqual(before);
  await expect(page.getByRole("button", { name: "Usar esta categoria" })).toBeVisible();
});
