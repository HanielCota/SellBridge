import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierCoverage, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import {
  getCatalogProductForRegion,
  getSupplierForRegion,
  listCatalogProducts,
  listSuppliersForRegion,
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

describe("supplier visibility by region", () => {
  it("lists state-wide suppliers but hides city-only suppliers for other cities", async () => {
    const result = await listSuppliersForRegion(
      database,
      { state: TEST_STATE, city: "Interior" },
      {},
    );
    const names = result.map((supplier) => supplier.name);
    expect(names).toContain("Teste Estado Inteiro");
    expect(names).not.toContain("Teste Só Capital");
    expect(names).not.toContain("Teste Outro Estado");
    expect(names).not.toContain("Teste Inativo");
  });

  it("includes city-only suppliers for the covered city (case-insensitive)", async () => {
    const result = await listSuppliersForRegion(
      database,
      { state: TEST_STATE, city: "capital" },
      {},
    );
    expect(result.map((supplier) => supplier.name)).toEqual(
      expect.arrayContaining(["Teste Estado Inteiro", "Teste Só Capital"]),
    );
  });

  it("counts active products per supplier", async () => {
    const result = await listSuppliersForRegion(
      database,
      { state: TEST_STATE, city: "Interior" },
      {},
    );
    expect(result.find((supplier) => supplier.id === ids.stateWide)?.productCount).toBe(3);
  });

  it("reports a supplier outside the region as not found", async () => {
    await expect(
      getSupplierForRegion(database, { state: TEST_STATE, city: "Interior" }, ids.otherState),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reports a product whose supplier does not serve the region as not found", async () => {
    await expect(
      getCatalogProductForRegion(
        database,
        { state: TEST_STATE, city: "Interior" },
        hiddenProductId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const visible = await getCatalogProductForRegion(
      database,
      { state: TEST_STATE, city: "Interior" },
      visibleProductId,
    );
    expect(visible.sku).toBe("T-1");
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
