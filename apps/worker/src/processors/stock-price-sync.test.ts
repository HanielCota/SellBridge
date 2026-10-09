import { schema } from "@sellbridge/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublishedTestTarget,
  createTestProduct,
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createStockPriceSyncProcessor } from "./stock-price-sync.ts";

const environment = createWorkerTestEnvironment();
const { database, connectors, cipher } = environment;

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let tenantId = "";
let targetId = "";

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.first;
  catalog = await createTestProduct(database, { sku: "WH-1", title: "Produto webhook", stock: 5 });
  const store = await createTestStore(environment, tenantId);
  targetId = await createPublishedTestTarget(database, {
    tenantId,
    productId: catalog.productId,
    storeId: store.id,
    title: "Anúncio webhook",
    externalId: "MOCK-ITEM-WH",
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("stock-price-sync processor", () => {
  it("pushes changed stock and price and marks the target as synced", async () => {
    const sync = createStockPriceSyncProcessor({
      database,
      connectors,
      cipher,
      acquireRateLimit: async () => {},
    });
    const summary = await sync();
    expect(summary.synced).toBeGreaterThanOrEqual(1);
    const row = await database.query.listingTargets.findFirst({
      where: eq(schema.listingTargets.id, targetId),
    });
    expect(row).toMatchObject({ syncedStock: 5, syncedPriceCents: 4990 });
    expect(row?.syncedAt).not.toBeNull();
  });
});
