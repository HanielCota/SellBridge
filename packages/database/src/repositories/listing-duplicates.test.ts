import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listings, listingTargets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
const cleanups: (() => Promise<void>)[] = [];

async function productAndStores(storeCount: number) {
  const sku = `D-${randomUUID().slice(0, 8)}`;
  const catalog = await createTestSupplierProduct(database, {
    sku,
    title: `Produto ${sku}`,
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock: 5,
  });
  cleanups.push(catalog.cleanup);
  const storeIds: string[] = [];
  for (let index = 0; index < storeCount; index += 1) {
    const store = await upsertStoreConnection(
      database,
      testStoreInput(tenants.tenantA, `dup-${sku}-${index}`),
    );
    storeIds.push(store.id);
  }
  return { productId: catalog.productId, storeIds, sku };
}

function draft(productId: string) {
  return {
    supplierProductId: productId,
    title: "Anúncio",
    description: "Descrição",
    priceCents: 3990,
  };
}

async function targetsFor(productId: string, storeId: string): Promise<number> {
  const rows = await database
    .select({ id: listingTargets.id })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(
      and(eq(listings.supplierProductId, productId), eq(listingTargets.storeConnectionId, storeId)),
    );
  return rows.length;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
});

afterAll(async () => {
  await tenants.cleanup();
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await database.$client.end();
});

describe("one listing per product and store", () => {
  it("refuses to publish a product again on a store that already has it", async () => {
    const { productId, storeIds, sku } = await productAndStores(1);
    await createListingWithTargets(database, tenants.tenantA, draft(productId), storeIds);
    await expect(
      createListingWithTargets(database, tenants.tenantA, draft(productId), storeIds),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      userMessage: `Este produto já está publicado em Loja dup-${sku}-0. Edite o anúncio existente em Publicações.`,
    });
    expect(await targetsFor(productId, storeIds[0] ?? "")).toBe(1);
  });

  it("still publishes the product on another store", async () => {
    const { productId, storeIds } = await productAndStores(2);
    const [first, second] = storeIds;
    if (!first || !second) {
      throw new Error("lojas");
    }
    await createListingWithTargets(database, tenants.tenantA, draft(productId), [first]);
    await createListingWithTargets(database, tenants.tenantA, draft(productId), [second]);
    expect(await targetsFor(productId, second)).toBe(1);
  });

  it("lets only one of two simultaneous publications through", async () => {
    const { productId, storeIds } = await productAndStores(1);
    const results = await Promise.allSettled([
      createListingWithTargets(database, tenants.tenantA, draft(productId), storeIds),
      createListingWithTargets(database, tenants.tenantA, draft(productId), storeIds),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await targetsFor(productId, storeIds[0] ?? "")).toBe(1);
  });
});
