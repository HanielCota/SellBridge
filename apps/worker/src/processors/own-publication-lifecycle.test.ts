import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import {
  archiveSellerProduct,
  createListingWithTargets,
  ensureSellerCatalog,
} from "@sellbridge/database/repositories";
import { marketplaceError, type MarketplaceConnector } from "@sellbridge/marketplaces";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createPublishListingProcessor } from "./publish-listing.ts";
import { reconcilePublicationStock } from "./publication-stock.ts";

const environment = createWorkerTestEnvironment();
const { database } = environment;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let sourceId = "";
let storeId = "";

function deferred() {
  let done: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    done = resolve;
  });
  return {
    promise,
    resolve: () => {
      done?.();
    },
  };
}

async function rejectionOf(promise: Promise<unknown>) {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
}

function processor(waitAt: "rate" | "publish" = "publish") {
  const entered = deferred();
  const release = deferred();
  const wait = async () => {
    entered.resolve();
    await release.promise;
  };
  const publishProduct = vi.fn<MarketplaceConnector["publishProduct"]>(async (...args) => {
    if (waitAt === "publish") await wait();
    return environment.connectors.mock.publishProduct(...args);
  });
  const updateStockPrice = vi.fn<MarketplaceConnector["updateStockPrice"]>((...args) =>
    environment.connectors.mock.updateStockPrice(...args),
  );
  const dependencies = {
    ...environment,
    safetyUnits: 0,
    acquireRateLimit: async () => {
      if (waitAt === "rate") await wait();
    },
    connectors: {
      ...environment.connectors,
      mock: { ...environment.connectors.mock, publishProduct, updateStockPrice },
    },
  };
  const run = createPublishListingProcessor(dependencies);
  return { entered, release, publishProduct, updateStockPrice, run, dependencies };
}

async function publication() {
  const productId = randomUUID();
  await database.insert(schema.supplierProducts).values({
    id: productId,
    supplierId: sourceId,
    sku: productId,
    title: "Own publication lifecycle product",
    description: "A complete product description for lifecycle validation.",
    stock: 9,
    costCents: 1200,
    suggestedPriceCents: 3000,
    active: true,
    reviewStatus: "approved",
  });
  const listing = await createListingWithTargets(
    database,
    tenants.first,
    {
      supplierProductId: productId,
      title: "Own publication lifecycle product",
      description: "A complete product description for lifecycle validation.",
      priceCents: 3000,
    },
    [storeId],
  );
  const targetId = listing.targetIds[0];
  if (targetId === undefined) throw new Error("Missing lifecycle target");
  return {
    productId,
    targetId,
    job: {
      data: { tenantId: tenants.first, listingTargetId: targetId },
      attemptsMade: 0,
      maxAttempts: 5,
    },
  };
}

async function target(id: string) {
  return database.query.listingTargets.findFirst({ where: eq(schema.listingTargets.id, id) });
}

async function restore(productId: string) {
  await database
    .update(schema.supplierProducts)
    .set({ active: true })
    .where(eq(schema.supplierProducts.id, productId));
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  sourceId = (await ensureSellerCatalog(database, tenants.first)).id;
  storeId = (await createTestStore(environment, tenants.first)).id;
});
afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("owned publication lifecycle", () => {
  it("keeps queued work stopped after archiving and restoring a product", async () => {
    const item = await publication();
    await archiveSellerProduct(database, tenants.first, item.productId);
    await restore(item.productId);
    const worker = processor();
    worker.release.resolve();
    expect(await worker.run(item.job)).toBe("not_pending");
    expect(worker.publishProduct).not.toHaveBeenCalled();
    expect(await target(item.targetId)).toMatchObject({ status: "error", externalId: null });
  });

  it("does not publish an item archived while waiting for the store rate limit", async () => {
    const item = await publication();
    const worker = processor("rate");
    const running = worker.run(item.job);
    await worker.entered.promise;
    await archiveSellerProduct(database, tenants.first, item.productId);
    worker.release.resolve();
    expect(await running).toBe("not_pending");
    expect(worker.publishProduct).not.toHaveBeenCalled();
  });

  it("retains an in-flight remote result paused and zeros it even after product restoration", async () => {
    const item = await publication();
    const worker = processor();
    const running = worker.run(item.job);
    await worker.entered.promise;
    await archiveSellerProduct(database, tenants.first, item.productId);
    await restore(item.productId);
    worker.release.resolve();
    await running;
    const row = await target(item.targetId);
    expect(row).toMatchObject({ status: "paused", pauseRequested: true, syncedStock: 0 });
    expect(row?.externalId).toMatch(/^MOCK-ITEM-/);
    expect(worker.updateStockPrice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ externalId: row?.externalId, stock: 0 }),
    );
  });

  it("retries a failed zero-stock update without creating a second marketplace item", async () => {
    const item = await publication();
    const worker = processor();
    worker.updateStockPrice.mockRejectedValueOnce(
      marketplaceError("Temporary pause failure", { retryable: true }),
    );
    const running = rejectionOf(worker.run(item.job));
    await worker.entered.promise;
    await archiveSellerProduct(database, tenants.first, item.productId);
    worker.release.resolve();
    expect(await running).toMatchObject({ message: "Temporary pause failure" });
    expect(await target(item.targetId)).toMatchObject({ status: "paused", syncedStock: null });
    await worker.run({ ...item.job, attemptsMade: 1 });
    expect(worker.publishProduct).toHaveBeenCalledTimes(1);
    expect(await target(item.targetId)).toMatchObject({
      status: "paused",
      syncedStock: 0,
      syncError: null,
    });
  });

  it("publishes the current shelf count after a rate-limit wait", async () => {
    const item = await publication();
    const worker = processor("rate");
    const running = worker.run(item.job);
    await worker.entered.promise;
    await database
      .update(schema.supplierProducts)
      .set({ stock: 4 })
      .where(eq(schema.supplierProducts.id, item.productId));
    worker.release.resolve();
    expect(await running).toBe("published");
    expect(worker.publishProduct.mock.calls[0]?.[1].stock).toBe(4);
  });

  it("keeps a remote failure stopped instead of leaving an archived item pending forever", async () => {
    const item = await publication();
    const worker = processor();
    worker.publishProduct.mockImplementationOnce(async () => {
      worker.entered.resolve();
      await worker.release.promise;
      throw marketplaceError("Temporary creation failure", { retryable: true });
    });
    const running = rejectionOf(worker.run(item.job));
    await worker.entered.promise;
    await archiveSellerProduct(database, tenants.first, item.productId);
    worker.release.resolve();
    expect(await running).toMatchObject({ message: "Temporary creation failure" });
    expect(await target(item.targetId)).toMatchObject({ status: "error", pauseRequested: true });
    expect(await worker.run({ ...item.job, attemptsMade: 1 })).toBe("not_pending");
    expect(worker.publishProduct).toHaveBeenCalledTimes(1);
  });

  it("rechecks stock and pause intent after the inventory update's own rate-limit wait", async () => {
    const item = await publication();
    const initial = processor();
    initial.release.resolve();
    await initial.run(item.job);
    await database
      .update(schema.supplierProducts)
      .set({ stock: 6 })
      .where(eq(schema.supplierProducts.id, item.productId));
    const worker = processor("rate");
    const running = reconcilePublicationStock(worker.dependencies, {
      tenantId: tenants.first,
      targetId: item.targetId,
    });
    await worker.entered.promise;
    await archiveSellerProduct(database, tenants.first, item.productId);
    worker.release.resolve();
    await running;
    expect(worker.updateStockPrice.mock.calls[0]?.[1].stock).toBe(0);
    expect(await target(item.targetId)).toMatchObject({ status: "paused", syncedStock: 0 });
  });

  it("compensates immediately when an archive wins during an inventory update", async () => {
    const item = await publication();
    const worker = processor();
    worker.release.resolve();
    await worker.run(item.job);
    await database
      .update(schema.supplierProducts)
      .set({ stock: 6 })
      .where(eq(schema.supplierProducts.id, item.productId));
    worker.updateStockPrice.mockImplementationOnce(async (...args) => {
      await archiveSellerProduct(database, tenants.first, item.productId);
      await environment.connectors.mock.updateStockPrice(...args);
    });
    await reconcilePublicationStock(worker.dependencies, {
      tenantId: tenants.first,
      targetId: item.targetId,
    });
    expect(worker.updateStockPrice.mock.calls.map((call) => call[1].stock)).toEqual([6, 0]);
    expect(await target(item.targetId)).toMatchObject({ status: "paused", syncedStock: 0 });
  });

  // MVP (coordinator decision, 2026-10-22): own products take no new publications, but a listing
  // published before the rule keeps its stock and price in sync.
  it("keeps syncing the stock of an own-product listing published before the rule", async () => {
    const item = await publication();
    const worker = processor();
    worker.release.resolve();
    expect(await worker.run(item.job)).toBe("published");
    await database
      .update(schema.supplierProducts)
      .set({ stock: 5 })
      .where(eq(schema.supplierProducts.id, item.productId));
    await reconcilePublicationStock(worker.dependencies, {
      tenantId: tenants.first,
      targetId: item.targetId,
    });
    expect(worker.updateStockPrice.mock.calls.at(-1)?.[1].stock).toBe(5);
    expect(await target(item.targetId)).toMatchObject({ status: "published", syncedStock: 5 });
  });
});
