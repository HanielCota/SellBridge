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
let failingTargetId = "";
let describedTargetId = "";
let refusedTargetId = "";

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
  failingTargetId = await createPublishedTestTarget(database, {
    tenantId,
    productId: catalog.productId,
    storeId: store.id,
    title: "Anúncio apagado no marketplace",
    externalId: "MOCK-ITEM-GONE",
  });
  describedTargetId = await createPublishedTestTarget(database, {
    tenantId,
    productId: catalog.productId,
    storeId: store.id,
    title: "Anúncio sem descrição",
    externalId: "MOCK-ITEM-DESC",
  });
  // The marketplace refused its description when it was published.
  await database
    .update(schema.listingTargets)
    .set({ descriptionError: "A descrição não chegou", descriptionFailedAt: new Date() })
    .where(eq(schema.listingTargets.id, describedTargetId));
  // Its text is what the marketplace refuses: resending it as is can never succeed.
  refusedTargetId = await createPublishedTestTarget(database, {
    tenantId,
    productId: catalog.productId,
    storeId: store.id,
    title: "Anúncio com descrição recusada",
    externalId: "MOCK-ITEM-REFUSED",
  });
  const [refused] = await database
    .update(schema.listingTargets)
    .set({ descriptionError: "A descrição foi recusada", descriptionFailedAt: new Date() })
    .where(eq(schema.listingTargets.id, refusedTargetId))
    .returning({ listingId: schema.listingTargets.listingId });
  await database
    .update(schema.listings)
    .set({ description: "Texto [descricao recusada]" })
    .where(eq(schema.listings.id, refused?.listingId ?? ""));
});

/** Mock connectors whose stock update fails for the listing deleted on the marketplace. */
const connectorsWithDeletedItem = {
  ...connectors,
  mock: {
    ...connectors.mock,
    updateStockPrice: async (
      ...parameters: Parameters<typeof connectors.mock.updateStockPrice>
    ): Promise<void> => {
      const [credentials, update] = parameters;
      if (update.externalId === "MOCK-ITEM-GONE") {
        throw new Error("Anúncio não encontrado");
      }
      await connectors.mock.updateStockPrice(credentials, update);
    },
  },
};

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

const sync = createStockPriceSyncProcessor({
  database,
  connectors: connectorsWithDeletedItem,
  cipher,
  acquireRateLimit: async () => {},
  safetyUnits: 0,
});

describe("stock-price-sync processor", () => {
  // Runs first, while both targets still need a sync. Regression: the budget was checked only
  // between batches of 200, so one batch in an outage held the queue for hours.
  it("stops at the run budget even in the middle of a batch", async () => {
    const outOfTime = createStockPriceSyncProcessor({
      database,
      connectors: connectorsWithDeletedItem,
      cipher,
      acquireRateLimit: async () => {},
      safetyUnits: 0,
      runBudgetMilliseconds: 0,
    });
    expect(await outOfTime()).toEqual({ synced: 0, failed: 0 });
    const row = await database.query.listingTargets.findFirst({
      where: eq(schema.listingTargets.id, targetId),
    });
    expect(row?.syncAttemptedAt ?? null).toBeNull();
  });

  it("pushes changed stock and price and marks the target as synced", async () => {
    const summary = await sync();
    expect(summary.synced).toBeGreaterThanOrEqual(1);
    const row = await database.query.listingTargets.findFirst({
      where: eq(schema.listingTargets.id, targetId),
    });
    expect(row).toMatchObject({ syncedStock: 5, syncedPriceCents: 4990 });
    expect(row?.syncedAt).not.toBeNull();
  });

  it("resends a description the marketplace refused and clears the warning", async () => {
    await sync();
    const row = await database.query.listingTargets.findFirst({
      where: eq(schema.listingTargets.id, describedTargetId),
    });
    expect(row).toMatchObject({
      descriptionError: null,
      descriptionFailedAt: null,
      descriptionAttempts: 0,
    });
  });

  it("stops resending on its own when the marketplace refuses the text itself", async () => {
    // Earlier runs of this file already tried it; one run must be enough to reach the limit.
    await database
      .update(schema.listingTargets)
      .set({ descriptionAttempts: 0 })
      .where(eq(schema.listingTargets.id, refusedTargetId));
    await sync();
    const row = await database.query.listingTargets.findFirst({
      where: eq(schema.listingTargets.id, refusedTargetId),
    });
    // Not retryable: the automatic limit is reached at once; only the reseller's resend is left.
    expect(row).toMatchObject({ descriptionAttempts: 3 });
    expect(row?.descriptionError).toMatch(/recusada/);
  });

  it("records the failed attempt so the target goes to the back of the queue", async () => {
    const summary = await sync();
    expect(summary.failed).toBeGreaterThanOrEqual(1);
    const row = await database.query.listingTargets.findFirst({
      where: eq(schema.listingTargets.id, failingTargetId),
    });
    expect(row).toMatchObject({
      syncedStock: null,
      syncedAt: null,
      syncError: "Falha ao sincronizar estoque e preço",
    });
    expect(row?.syncAttemptedAt).not.toBeNull();
  });
});
