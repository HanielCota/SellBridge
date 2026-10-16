import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  publishTestProduct,
  type TestSeller,
  testStoreInput,
} from "../testing/fixtures.ts";
import { findTargetsNeedingSync, markTargetSynced } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
const cleanups: (() => Promise<void>)[] = [];

let sellerOne: TestSeller;
let sellerTwo: TestSeller;
let sellerThree: TestSeller;

/** A seller with one connected store. */
async function seller(tenantId: string) {
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, `shop-${tenantId}`));
  return { tenantId, storeId: store.id };
}

/** A product with 5 units (its test supplier is in state "ZZ"), published by every seller given. */
async function publishedBy(sellers: readonly TestSeller[]) {
  const sku = `AV-${randomUUID().slice(0, 8)}`;
  const catalog = await createTestSupplierProduct(database, {
    sku,
    title: `Produto ${sku}`,
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock: 5,
  });
  cleanups.push(catalog.cleanup);
  const targets = await publishTestProduct(database, catalog.productId, sellers);
  return { ...catalog, sku, targets };
}

/** Stock the sync job would send to each target of the product (undefined = not queued). */
async function stockQueued(product: { targets: Map<string, string> }) {
  const queue = await findTargetsNeedingSync(database, 100_000);
  const byTarget = new Map(queue.map((target) => [target.targetId, target.stock]));
  return Object.fromEntries(
    [...product.targets].map(([tenantId, targetId]) => [tenantId, byTarget.get(targetId)]),
  );
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 3);
  const [first, second, third] = tenants.ids;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error("tenants não criados");
  }
  sellerOne = await seller(first);
  sellerTwo = await seller(second);
  sellerThree = await seller(third);
});

afterAll(async () => {
  // Listings hold their products: the tenants (and their listings) go first.
  await tenants.cleanup();
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await database.$client.end();
});

describe("sync of products the reseller can no longer sell", () => {
  it("offers the stock to every reseller, wherever the supplier is", async () => {
    const product = await publishedBy([sellerOne, sellerTwo, sellerThree]);

    expect(await stockQueued(product)).toEqual({
      [sellerOne.tenantId]: 5,
      [sellerTwo.tenantId]: 5,
      [sellerThree.tenantId]: 5,
    });
  });

  it("sends zero for an inactive product", async () => {
    const product = await publishedBy([sellerOne]);
    await database
      .update(supplierProducts)
      .set({ active: false })
      .where(eq(supplierProducts.id, product.productId));

    expect(await stockQueued(product)).toEqual({ [sellerOne.tenantId]: 0 });
  });

  it("sends zero for every product of an inactive supplier", async () => {
    const product = await publishedBy([sellerOne, sellerTwo]);
    await database
      .update(suppliers)
      .set({ active: false })
      .where(eq(suppliers.id, product.supplierId));

    expect(await stockQueued(product)).toEqual({
      [sellerOne.tenantId]: 0,
      [sellerTwo.tenantId]: 0,
    });
  });

  it("leaves the queue once the zero reached the marketplace", async () => {
    const product = await publishedBy([sellerTwo]);
    const targetId = product.targets.get(sellerTwo.tenantId);
    if (targetId === undefined) {
      throw new Error("destino não criado");
    }
    await database
      .update(supplierProducts)
      .set({ active: false })
      .where(eq(supplierProducts.id, product.productId));
    await markTargetSynced(database, targetId, { stock: 0, priceCents: 3990 });

    expect(await stockQueued(product)).toEqual({ [sellerTwo.tenantId]: undefined });
  });
});
