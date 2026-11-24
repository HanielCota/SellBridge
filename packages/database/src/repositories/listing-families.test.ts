import { randomUUID } from "node:crypto";
import type { ProductGrid, ProductModelShared } from "@sellbridge/shared/product-grid";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingFamilies, listings, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testStoreInput } from "../testing/fixtures.ts";
import { createListingFamilyWithListings, getSellableProductModel } from "./listing-families.ts";
import { createListingWithTargets, getTargetForPublishing } from "./listings.ts";
import { groupProducts, separateGroupedModel } from "./product-groupings.ts";
import { createProductModel } from "./product-models.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let supplierId = "";
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantId = "";
let storeIds: string[] = [];

const values: ProductModelShared = {
  title: "Tênis Casual",
  description: "Tênis casual de couro legítimo, confortável para o dia a dia.",
  categoryId: null,
  imageUrls: ["https://cdn.example.com/capa.jpg"],
  mercadoLivreAttributes: { BRAND: "Pegada", MODEL: "Casual" },
  mercadoLivreCategoryId: "MLB23332",
  mercadoLivreCategoryName: "Tênis",
  warrantyType: null,
  warrantyDays: null,
  videoUrl: null,
  madeToOrderDays: null,
  carrierOnly: false,
  fiscal: { ncm: "64039990", origin: 0, unit: "PAR", netWeightGrams: 800 },
};

function shoeGrid(prefix: string): ProductGrid {
  const combination = (color: string, size: string) => ({
    color,
    size,
    sku: `${prefix}-${color.slice(0, 1)}-${size}`,
    gtin: null,
    costCents: 5000,
    suggestedPriceCents: 9990,
    stock: 4,
    netWeightGrams: null,
  });
  return {
    colors: [
      { name: "Preto", imageUrls: ["https://cdn.example.com/preto.jpg"] },
      { name: "Branco", imageUrls: [] },
    ],
    sizes: ["38", "39"],
    combinations: [
      combination("Branco", "39"),
      combination("Preto", "39"),
      combination("Preto", "38"),
      combination("Branco", "38"),
    ],
  };
}

async function grid() {
  return createProductModel(database, {
    supplierId,
    values,
    grid: shoeGrid(randomUUID().slice(0, 8)),
    reviewStatus: "approved",
  });
}

function drafts(productIds: readonly string[]) {
  return productIds.map((supplierProductId) => ({
    supplierProductId,
    title: "Tênis Casual",
    description: values.description,
    priceCents: 14990,
  }));
}

beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Família ${randomUUID()}`, niche: "Calçados", state: "SP", city: "Franca" })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("supplier not created");
  }
  supplierId = supplier.id;
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.ids[0] ?? "";
  storeIds = [];
  for (const name of ["Loja A", "Loja B"]) {
    const store = await upsertStoreConnection(database, {
      ...testStoreInput(tenantId, randomUUID()),
      shopName: name,
      supplierId,
    });
    storeIds.push(store.id);
  }
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

describe("getSellableProductModel", () => {
  it("lists the combinations in the supplier's colour and size order", async () => {
    const { modelId } = await grid();

    const model = await getSellableProductModel(database, tenantId, modelId);

    expect(model.title).toBe("Tênis Casual");
    expect(model.combinations.map(({ color, size }) => `${color} ${size}`)).toEqual([
      "Preto 38",
      "Preto 39",
      "Branco 38",
      "Branco 39",
    ]);
  });

  it("leaves out a combination that is not on sale", async () => {
    const { modelId, combinationIds } = await grid();
    await database
      .update(supplierProducts)
      .set({ active: false })
      .where(eq(supplierProducts.id, combinationIds[0] ?? ""));

    const model = await getSellableProductModel(database, tenantId, modelId);

    expect(model.combinations.map(({ id }) => id)).not.toContain(combinationIds[0]);
    expect(model.combinations).toHaveLength(3);
  });
});

describe("createListingFamilyWithListings", () => {
  it("creates one listing per combination and store, all in one family", async () => {
    const { modelId, combinationIds } = await grid();

    const created = await createListingFamilyWithListings(
      database,
      tenantId,
      { modelId, familyName: "Tênis Casual", listings: drafts(combinationIds), billing: null },
      storeIds,
    );

    expect(created.listed).toHaveLength(4);
    expect(created.targetIds).toHaveLength(8);
    expect(created.skipped).toEqual([]);
    const rows = await database
      .select({ familyId: listings.familyId })
      .from(listings)
      .where(inArray(listings.supplierProductId, [...combinationIds]));
    expect(new Set(rows.map((row) => row.familyId))).toEqual(new Set([created.familyId]));
    const target = await getTargetForPublishing(database, tenantId, created.targetIds[0] ?? "");
    expect(target.familyName).toBe("Tênis Casual");
  });

  it("adds sizes published later to the same family, under the family's first name", async () => {
    const { modelId, combinationIds } = await grid();
    const first = await createListingFamilyWithListings(
      database,
      tenantId,
      {
        modelId,
        familyName: "Tênis Casual Couro",
        listings: drafts(combinationIds.slice(0, 2)),
        billing: null,
      },
      storeIds,
    );

    const later = await createListingFamilyWithListings(
      database,
      tenantId,
      {
        modelId,
        familyName: "Outro nome",
        listings: drafts(combinationIds.slice(2)),
        billing: null,
      },
      storeIds,
    );

    expect(later.familyId).toBe(first.familyId);
    const target = await getTargetForPublishing(database, tenantId, later.targetIds[0] ?? "");
    expect(target.familyName).toBe("Tênis Casual Couro");
  });

  it("leaves a size out of the store where it already has a listing of its own", async () => {
    const { modelId, combinationIds } = await grid();
    const [standalone = "", ...others] = combinationIds;
    await createListingWithTargets(
      database,
      tenantId,
      {
        supplierProductId: standalone,
        title: "Tênis avulso",
        description: values.description,
        priceCents: 14990,
      },
      [storeIds[0] ?? ""],
    );

    const created = await createListingFamilyWithListings(
      database,
      tenantId,
      { modelId, familyName: "Tênis Casual", listings: drafts(combinationIds), billing: null },
      storeIds,
    );

    expect(created.skipped).toEqual([{ supplierProductId: standalone, storeNames: ["Loja A"] }]);
    expect(created.listed.find((item) => item.supplierProductId === standalone)).toMatchObject({
      storeConnectionIds: [storeIds[1]],
    });
    expect(created.targetIds).toHaveLength(others.length * 2 + 1);
  });

  it("refuses a product that is not a combination of the grid", async () => {
    const { modelId } = await grid();
    const other = await grid();

    const attempt = createListingFamilyWithListings(
      database,
      tenantId,
      {
        modelId,
        familyName: "Tênis Casual",
        listings: drafts(other.combinationIds),
        billing: null,
      },
      storeIds,
    );

    await expect(attempt).rejects.toMatchObject({ code: "VALIDATION" });
    const families = await database
      .select()
      .from(listingFamilies)
      .where(eq(listingFamilies.modelId, modelId));
    expect(families).toEqual([]);
  });
});

describe("separating a grid sold as a family", () => {
  it("refuses to separate a grouped grid a reseller publishes as one listing", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = [];
    for (const size of ["38", "39"]) {
      const [row] = await database
        .insert(supplierProducts)
        .values({
          supplierId,
          sku: `${prefix}-P-${size}`,
          title: `Tênis ${prefix} - Preto ${size}`,
          description: values.description,
          costCents: 5000,
          suggestedPriceCents: 9990,
          stock: 6,
          imageUrls: ["https://cdn.example.com/preto.jpg"],
          mercadoLivreAttributes: { BRAND: "Pegada" },
          fiscal: { ncm: "64039990", origin: 0, unit: "PAR", netWeightGrams: 700 },
          fiscalRequired: true,
          reviewStatus: "approved",
        })
        .returning();
      if (row === undefined) {
        throw new Error("product not created");
      }
      rows.push(row);
    }
    const grouping = await groupProducts(database, {
      supplierId,
      groupedBy: "user-test",
      modelTitle: `Tênis ${prefix}`,
      mainProductId: rows[0]?.id ?? "",
      products: rows.map((row) => ({ productId: row.id, color: "Preto", size: row.sku.slice(-2) })),
    });
    if (!grouping.grouped) {
      throw new Error(`grouping refused: ${JSON.stringify(grouping.problems)}`);
    }
    await createListingFamilyWithListings(
      database,
      tenantId,
      {
        modelId: grouping.modelId,
        familyName: `Tênis ${prefix}`,
        listings: drafts(rows.map((row) => row.id)),
        billing: null,
      },
      storeIds,
    );

    const attempt = separateGroupedModel(database, {
      supplierId,
      modelId: grouping.modelId,
      separatedBy: "user-test",
    });

    await expect(attempt).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
