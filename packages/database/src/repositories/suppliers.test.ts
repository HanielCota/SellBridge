import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listings, supplierCoverage, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import {
  getDirectorySupplier,
  getSellableCatalogProduct,
  listActiveSuppliers,
  listCatalogProducts,
  listSellableCatalog,
  listSupplierDirectory,
} from "./suppliers.ts";

const database = createTestDatabase();
const TEST_STATE = "ZZ";
const ids: { stateWide: string; cityOnly: string; otherState: string; inactive: string } = {
  stateWide: "",
  cityOnly: "",
  otherState: "",
  inactive: "",
};
let visibleProductId = "";
let hiddenProductId = "";

async function insertSupplier(
  name: string,
  coverage: { state: string; city: string | null },
  active = true,
) {
  const [row] = await database
    .insert(suppliers)
    .values({ name, niche: "Teste", state: coverage.state, city: "Origem", active })
    .returning({ id: suppliers.id });
  if (!row) {
    throw new Error("falha ao criar fornecedor de teste");
  }
  await database.insert(supplierCoverage).values({ supplierId: row.id, ...coverage });
  return row.id;
}

beforeAll(async () => {
  ids.stateWide = await insertSupplier("Teste Estado Inteiro", { state: TEST_STATE, city: null });
  ids.cityOnly = await insertSupplier("Teste Só Capital", { state: TEST_STATE, city: "Capital" });
  ids.otherState = await insertSupplier("Teste Outro Estado", { state: "YY", city: null });
  ids.inactive = await insertSupplier("Teste Inativo", { state: TEST_STATE, city: null }, false);

  const products = await database
    .insert(supplierProducts)
    .values([
      {
        supplierId: ids.stateWide,
        sku: "T-1",
        title: "Camiseta azul",
        costCents: 2000,
        suggestedPriceCents: 4990,
        stock: 10,
      },
      {
        supplierId: ids.stateWide,
        sku: "T-2",
        title: "Camiseta preta",
        costCents: 2500,
        suggestedPriceCents: 5490,
        stock: 0,
      },
      {
        supplierId: ids.stateWide,
        sku: "T-3",
        title: "Boné 100%_off",
        costCents: 900,
        suggestedPriceCents: 2990,
        stock: 5,
      },
      {
        supplierId: ids.otherState,
        sku: "T-4",
        title: "Produto oculto",
        costCents: 1000,
        suggestedPriceCents: 1990,
        stock: 5,
      },
    ])
    .returning({ id: supplierProducts.id, sku: supplierProducts.sku });
  visibleProductId = products.find((product) => product.sku === "T-1")?.id ?? "";
  hiddenProductId = products.find((product) => product.sku === "T-4")?.id ?? "";
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, Object.values(ids)));
  await database.$client.end();
});

describe("suppliers from anywhere in Brazil", () => {
  it("lists every active supplier, whatever state it is in", async () => {
    const result = await listActiveSuppliers(database, {});
    const names = result.map((supplier) => supplier.name);
    expect(names).toEqual(
      expect.arrayContaining(["Teste Estado Inteiro", "Teste Só Capital", "Teste Outro Estado"]),
    );
    expect(names).not.toContain("Teste Inativo");
  });

  it("counts active products per supplier", async () => {
    const result = await listActiveSuppliers(database, {});
    expect(result.find((supplier) => supplier.id === ids.stateWide)?.productCount).toBe(3);
  });

  it("opens a product of a supplier in any state, and only known products", async () => {
    const fromOtherState = await getSellableCatalogProduct(database, hiddenProductId);
    expect(fromOtherState.sku).toBe("T-4");
    const visible = await getSellableCatalogProduct(database, visibleProductId);
    expect(visible.sku).toBe("T-1");
    await expect(
      getSellableCatalogProduct(database, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

async function directoryNames(filters: Parameters<typeof listSupplierDirectory>[1]) {
  const result = await listSupplierDirectory(database, filters);
  return result.map((supplier) => supplier.name);
}

describe("supplier directory", () => {
  it("lists active suppliers of every state", async () => {
    const result = await listSupplierDirectory(database, {});
    const found = new Set(result.map((supplier) => supplier.id));
    expect(found.has(ids.stateWide)).toBe(true);
    expect(found.has(ids.cityOnly)).toBe(true);
    expect(found.has(ids.otherState)).toBe(true);
    expect(found.has(ids.inactive)).toBe(false);
  });

  it("finds a supplier by a product it sells, ignoring accents", async () => {
    const hidden = await directoryNames({ search: "PRODUTO OCULTO" });
    expect(hidden).toContain("Teste Outro Estado");
    expect(hidden).not.toContain("Teste Estado Inteiro");
    const caps = await directoryNames({ search: "bone" });
    expect(caps).toContain("Teste Estado Inteiro");
    expect(caps).not.toContain("Teste Outro Estado");
  });

  it("finds a supplier by its niche", async () => {
    const names = await directoryNames({ search: "teste" });
    expect(names).toEqual(
      expect.arrayContaining(["Teste Estado Inteiro", "Teste Só Capital", "Teste Outro Estado"]),
    );
  });

  it("opens any active supplier, never an inactive one", async () => {
    const supplier = await getDirectorySupplier(database, ids.otherState);
    expect(supplier.name).toBe("Teste Outro Estado");
    await expect(getDirectorySupplier(database, ids.inactive)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("catalog filters", () => {
  const pagination = { page: 1, pageSize: 20 };

  it("filters by stock and sorts by cost", async () => {
    const result = await listCatalogProducts(
      database,
      ids.stateWide,
      { inStockOnly: true, sort: "cost_desc" },
      pagination,
    );
    expect(result.items.map((item) => item.sku)).toEqual(["T-1", "T-3"]);
    expect(result.total).toBe(2);
  });

  it("filters by cost range", async () => {
    const result = await listCatalogProducts(
      database,
      ids.stateWide,
      { minCostCents: 2000, maxCostCents: 2200, sort: "title" },
      pagination,
    );
    expect(result.items.map((item) => item.sku)).toEqual(["T-1"]);
  });

  it("treats LIKE wildcards in the search as literal text", async () => {
    const result = await listCatalogProducts(
      database,
      ids.stateWide,
      { search: "%_", sort: "title" },
      pagination,
    );
    expect(result.items.map((item) => item.sku)).toEqual(["T-3"]);
  });

  it("ignores accents and case and matches every word of the search", async () => {
    const accentless = await listCatalogProducts(
      database,
      ids.stateWide,
      { search: "BONE", sort: "title" },
      pagination,
    );
    expect(accentless.items.map((item) => item.sku)).toEqual(["T-3"]);
    const twoWords = await listCatalogProducts(
      database,
      ids.stateWide,
      { search: "camiseta  azul", sort: "title" },
      pagination,
    );
    expect(twoWords.items.map((item) => item.sku)).toEqual(["T-1"]);
  });

  it("sorts by the margin left by the suggested price", async () => {
    const result = await listCatalogProducts(
      database,
      ids.stateWide,
      { sort: "margin_desc" },
      pagination,
    );
    expect(result.items.map((item) => item.sku)).toEqual(["T-3", "T-1", "T-2"]);
  });

  it("never repeats or skips products across pages when the sort key ties", async () => {
    // Inserted in one statement, every product shares the same creation time.
    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await listCatalogProducts(
        database,
        ids.stateWide,
        { sort: "newest" },
        { page, pageSize: 1 },
      );
      seen.push(...result.items.map((item) => item.sku));
    }
    expect(seen.toSorted()).toEqual(["T-1", "T-2", "T-3"]);
  });

  it("paginates and reports total pages", async () => {
    const result = await listCatalogProducts(
      database,
      ids.stateWide,
      { sort: "title" },
      { page: 2, pageSize: 2 },
    );
    expect(result.items).toHaveLength(1);
    expect(result.totalPages).toBe(2);
  });

  it("returns an empty page for a supplier without products", async () => {
    const result = await listCatalogProducts(database, ids.cityOnly, { sort: "title" }, pagination);
    expect(result).toMatchObject({ items: [], total: 0, totalPages: 1 });
  });
});

describe("sellable catalog", () => {
  it("leaves out the tenant's published products when asked", async () => {
    const tenants = await createTestTenants(database, 1);
    const [tenantId] = tenants.ids;
    if (!tenantId) {
      throw new Error("tenant não criado");
    }
    try {
      await database.insert(listings).values({
        tenantId,
        supplierProductId: visibleProductId,
        title: "Anúncio",
        description: "Descrição",
        priceCents: 4990,
      });
      const pagination = { page: 1, pageSize: 20 };
      const ofSupplier = { supplierId: ids.stateWide, sort: "title" as const };
      const all = await listSellableCatalog(database, tenantId, ofSupplier, pagination);
      expect(all.items.find((item) => item.sku === "T-1")?.published).toBe(true);
      const unpublished = await listSellableCatalog(
        database,
        tenantId,
        { ...ofSupplier, unpublishedOnly: true },
        pagination,
      );
      expect(unpublished.items.map((item) => item.sku)).toEqual(["T-3", "T-2"]);
    } finally {
      await tenants.cleanup();
    }
  });
});
