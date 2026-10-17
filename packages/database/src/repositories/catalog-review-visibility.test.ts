import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testStoreInput } from "../testing/fixtures.ts";
import { findTargetsNeedingSync, markTargetSynced } from "./listing-sync.ts";
import {
  createListingWithTargets,
  getTargetForPublishing,
  markTargetPublished,
} from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  getSellableCatalogProduct,
  getSellableProducts,
  listActiveSuppliers,
  listCatalogProducts,
  listSellableCatalog,
  listSupplierCategories,
  listSupplierDirectory,
} from "./suppliers.ts";

/**
 * Supplier panel (migration 0039): a product a supplier is still drafting, or one the platform
 * rejected or has not reviewed yet, must never reach a reseller, be listed or be published.
 */
const database = createTestDatabase();
const marker = `Revisão ${randomUUID().slice(0, 8)}`;
let supplierId = "";
let categoryId = "";
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantId = "";
const productIds = { approved: "", draft: "", inReview: "", rejected: "" };
const PAGE = { page: 1, pageSize: 50 };

async function insertProduct(sku: string, reviewStatus: "approved" | "draft" | "in_review") {
  const [row] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku,
      title: `${marker} ${sku}`,
      costCents: 1000,
      suggestedPriceCents: 1990,
      stock: 10,
      reviewStatus,
    })
    .returning({ id: supplierProducts.id });
  return row?.id ?? "";
}

beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: marker, niche: "Teste", state: "SP", city: "São Paulo" })
    .returning({ id: suppliers.id });
  supplierId = supplier?.id ?? "";
  productIds.approved = await insertProduct("REV-OK", "approved");
  productIds.draft = await insertProduct("REV-DRAFT", "draft");
  const [category] = await database
    .insert(categories)
    .values({ name: marker, slug: `revisao-${randomUUID()}` })
    .returning({ id: categories.id });
  categoryId = category?.id ?? "";
  await database
    .update(supplierProducts)
    .set({ categoryId })
    .where(eq(supplierProducts.id, productIds.draft));
  productIds.inReview = await insertProduct("REV-WAIT", "in_review");
  productIds.rejected = await insertProduct("REV-NO", "in_review");
  await database
    .update(supplierProducts)
    .set({
      reviewStatus: "rejected",
      rejectionReasons: [{ field: "title", rule: "title_format", message: "Título inválido" }],
    })
    .where(eq(supplierProducts.id, productIds.rejected));
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.ids[0] ?? "";
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(suppliers).where(inArray(suppliers.id, [supplierId]));
  await database.delete(categories).where(eq(categories.id, categoryId));
});

const hiddenIds = () => [productIds.draft, productIds.inReview, productIds.rejected];

describe("reseller catalog and supplier review", () => {
  it("hides products that are not approved from the reseller catalog", async () => {
    const sellable = await listSellableCatalog(
      database,
      tenantId,
      { search: marker, sort: "title" },
      PAGE,
    );
    expect(sellable.items.map((product) => product.id)).toEqual([productIds.approved]);
    const ofSupplier = await listCatalogProducts(database, supplierId, { sort: "title" }, PAGE);
    expect(ofSupplier.items.map((product) => product.id)).toEqual([productIds.approved]);
    const picked = await getSellableProducts(database, tenantId, [
      productIds.approved,
      ...hiddenIds(),
    ]);
    expect(picked.map((product) => product.id)).toEqual([productIds.approved]);
  });

  it("refuses to open an unapproved product to create a listing", async () => {
    for (const productId of hiddenIds()) {
      await expect(getSellableCatalogProduct(database, productId)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
    await expect(getSellableCatalogProduct(database, productIds.approved)).resolves.toMatchObject({
      id: productIds.approved,
    });
  });

  it("counts only approved products on the supplier pages", async () => {
    const active = await listActiveSuppliers(database, { search: marker });
    expect(active.find((supplier) => supplier.id === supplierId)?.productCount).toBe(1);
    const directory = await listSupplierDirectory(database, { search: `${marker} REV-DRAFT` });
    expect(directory.map((supplier) => supplier.id)).not.toContain(supplierId);
    expect(await listSupplierCategories(database, supplierId)).toEqual([]);
  });

  it("never publishes nor syncs stock for a product that went back to review", async () => {
    const store = await upsertStoreConnection(
      database,
      testStoreInput(tenantId, `review-${randomUUID()}`),
    );
    const listing = await createListingWithTargets(
      database,
      tenantId,
      {
        supplierProductId: productIds.approved,
        title: "Anúncio",
        description: "",
        priceCents: 1990,
      },
      [store.id],
    );
    const targetId = listing.targetIds[0] ?? "";
    await markTargetPublished(database, targetId, {
      externalId: `REV-${randomUUID()}`,
      externalUrl: "https://example.com/rev",
    });
    await markTargetSynced(database, targetId, { stock: 10, priceCents: 1990 });
    await database
      .update(supplierProducts)
      .set({ reviewStatus: "in_review" })
      .where(eq(supplierProducts.id, productIds.approved));
    const publishing = await getTargetForPublishing(database, tenantId, targetId);
    expect(publishing.availability.productActive).toBe(false);
    const sync = await findTargetsNeedingSync(database, 10_000);
    expect(sync.find((target) => target.targetId === targetId)).toMatchObject({ stock: 0 });
  });
});
