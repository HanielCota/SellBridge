import { randomUUID } from "node:crypto";
import type { ProductGridDraft } from "@sellbridge/shared/product-grid";
import type {
  CatalogListSearch,
  ModelDraftValues,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenants,
  publishTestProduct,
  type TestSeller,
  testStoreInput,
} from "../testing/fixtures.ts";
import { saveAdminSupplierProduct } from "./admin-suppliers.ts";
import { saveProductModelDraft } from "./product-model-drafts.ts";
import { upsertStoreConnection } from "./stores.ts";
import { listSupplierPanelProducts } from "./supplier-panel-catalog.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let reseller: TestSeller;
const supplierIds: string[] = [];

const LIST: Omit<CatalogListSearch, "supplierId"> = {
  status: "all",
  query: undefined,
  sort: "updatedAt",
  direction: "desc",
  fiscal: "all",
  page: 1,
  pageSize: 25,
};

const values: ModelDraftValues = {
  title: "Tênis Lista",
  description: "Tênis de couro.",
  categoryId: null,
  imageUrls: [],
  mercadoLivreAttributes: {},
  mercadoLivreCategoryId: null,
  mercadoLivreCategoryName: null,
  warrantyType: null,
  warrantyDays: null,
  videoUrl: null,
  madeToOrderDays: null,
  carrierOnly: false,
  fiscal: {
    ncm: "64039990",
    origin: 0,
    unit: "PAR",
    cest: null,
    netWeightGrams: null,
    cfopInState: null,
    cfopOutOfState: null,
    icmsCode: null,
    pisCofinsCst: null,
  },
};

function combination(color: string, size: string, sku: string) {
  return {
    color,
    size,
    sku,
    gtin: null,
    costCents: 5000,
    suggestedPriceCents: 9990,
    stock: 4,
    netWeightGrams: null,
  };
}

function grid(prefix: string): ProductGridDraft {
  return {
    colors: [
      { name: "Preto", imageUrls: [] },
      { name: "Branco", imageUrls: [] },
    ],
    sizes: [{ name: "38" }, { name: "39" }],
    combinations: [
      combination("Preto", "38", `${prefix}-P-38`),
      combination("Preto", "39", `${prefix}-P-39`),
      combination("Branco", "38", `${prefix}-B-38`),
    ],
  };
}

async function supplierWithGrid() {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Lista ${randomUUID()}`, niche: "Calçados", state: "SP", city: "Franca" })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("supplier not created");
  }
  supplierIds.push(supplier.id);
  const prefix = randomUUID().slice(0, 8);
  const model = await saveProductModelDraft(database, {
    supplierId: supplier.id,
    modelId: randomUUID(),
    values,
    grid: grid(prefix),
  });
  return { supplierId: supplier.id, combinationIds: model.combinations.map((entry) => entry.id) };
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  const [tenantId] = tenants.ids;
  if (tenantId === undefined) {
    throw new Error("tenant not created");
  }
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, `shop-${tenantId}`));
  reseller = { tenantId, storeId: store.id };
});

afterAll(async () => {
  // Listings hold their products: the tenant (and its listings) goes first.
  await tenants.cleanup();
  await database.delete(suppliers).where(inArray(suppliers.id, supplierIds));
  await database.$client.end();
});

describe("supplier panel list of grids", () => {
  it("counts a grid once in all, even with combinations in different statuses", async () => {
    const { supplierId, combinationIds } = await supplierWithGrid();
    await database
      .update(supplierProducts)
      .set({ reviewStatus: "approved" })
      .where(eq(supplierProducts.id, combinationIds[0] ?? ""));

    const list = await listSupplierPanelProducts(database, { ...LIST, supplierId });

    expect(list.counts).toMatchObject({ all: 1, approved: 1, draft: 1 });
    expect(list.total).toBe(1);
  });

  it("offers deleting a grid only while none of its combinations was published", async () => {
    const { supplierId, combinationIds } = await supplierWithGrid();
    const before = await listSupplierPanelProducts(database, { ...LIST, supplierId });
    const shown = before.items[0]?.id;
    const published = combinationIds.find((id) => id !== shown) ?? "";
    await publishTestProduct(database, published, [reseller]);

    const after = await listSupplierPanelProducts(database, { ...LIST, supplierId });

    expect(before.items[0]?.deletable).toBe(true);
    expect(after.items[0]?.id).toBe(shown);
    expect(after.items[0]?.deletable).toBe(false);
  });

  it("sorts a grid by the stock of all its combinations, as its row shows", async () => {
    const { supplierId } = await supplierWithGrid();
    await saveAdminSupplierProduct(database, {
      supplierId,
      sku: `AVULSO-${randomUUID().slice(0, 8)}`,
      title: "Bolsa avulsa",
      description: "Bolsa",
      costCents: 1500,
      suggestedPriceCents: 3990,
      stock: 6,
      categoryId: null,
      imageUrls: [],
      mercadoLivreAttributes: {},
    });

    const list = await listSupplierPanelProducts(database, {
      ...LIST,
      supplierId,
      sort: "stock",
      direction: "asc",
    });

    expect(list.items.map((item) => item.grid?.stock ?? item.stock)).toEqual([6, 12]);
  });
});
