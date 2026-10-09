import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets, listListingTargets } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";
let tenantB = "";
let storeA = "";
let productId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  storeA = (await upsertStoreConnection(database, testStoreInput(tenantA, `shop-a-${tenantA}`))).id;
  catalog = await createTestSupplierProduct(database, {
    sku: "ISO-1",
    title: "Produto isolamento",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  productId = catalog.productId;
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("listings are tenant-scoped", () => {
  it("lists only the tenant's publications and reports active ones", async () => {
    await createListingWithTargets(
      database,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio do tenant A",
        description: "Descrição",
        priceCents: 2500,
      },
      [storeA],
    );
    const ofA = await listListingTargets(database, tenantA, {}, { page: 1, pageSize: 10 });
    const ofB = await listListingTargets(database, tenantB, {}, { page: 1, pageSize: 10 });
    expect(ofA.items.map((item) => item.title)).toContain("Anúncio do tenant A");
    expect(ofA.hasActive).toBe(true);
    expect(ofB.items).toEqual([]);
    expect(ofB.hasActive).toBe(false);
  });

  it("requires at least one destination store", async () => {
    await expect(
      createListingWithTargets(
        database,
        tenantA,
        {
          supplierProductId: productId,
          title: "Sem lojas",
          description: "Descrição",
          priceCents: 2500,
        },
        [],
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
