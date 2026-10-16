import { randomUUID } from "node:crypto";
import { marketplaceAuthError } from "@sellbridge/marketplaces";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublishedTestTarget,
  createTestProduct,
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createStockPriceSyncProcessor } from "./stock-price-sync.ts";

/*
 * Item 32.e: different stores sync at the same time, each store's listings one after the other
 * (its rate limit paces them), and a store whose credentials were refused stops being called.
 */
const environment = createWorkerTestEnvironment();
const { database, connectors, cipher } = environment;

/** Long enough for two stores' calls to overlap only if they run in parallel. */
const CALL_MILLISECONDS = 60;
const RUN = randomUUID().slice(0, 8);

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;

interface Call {
  externalId: string;
  startedAt: number;
  endedAt: number;
}
const calls: Call[] = [];

function externalId(store: string, listing: number): string {
  return `PAR-${RUN}-${store}-${listing}`;
}

/** Records this file's calls (other files' targets may share the queue) and refuses store C. */
const recordingConnectors = {
  ...connectors,
  mock: {
    ...connectors.mock,
    updateStockPrice: async (
      ...parameters: Parameters<typeof connectors.mock.updateStockPrice>
    ): Promise<void> => {
      const [, update] = parameters;
      if (!update.externalId.startsWith(`PAR-${RUN}-`)) {
        return;
      }
      const startedAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, CALL_MILLISECONDS));
      calls.push({ externalId: update.externalId, startedAt, endedAt: Date.now() });
      if (update.externalId.includes("-C-")) {
        throw marketplaceAuthError();
      }
    },
  },
};

function call(id: string): Call {
  const found = calls.find((entry) => entry.externalId === id);
  if (found === undefined) {
    throw new Error(`chamada ${id} não aconteceu`);
  }
  return found;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 3);
  catalog = await createTestProduct(database, { sku: `PAR-${RUN}`, title: "Produto", stock: 4 });
  const stores = ["A", "B", "C"];
  for (const [index, name] of stores.entries()) {
    const tenantId = tenants.ids[index];
    if (tenantId === undefined) {
      throw new Error("tenant de teste não criado");
    }
    const store = await createTestStore(environment, tenantId);
    for (const listing of [1, 2]) {
      await createPublishedTestTarget(database, {
        tenantId,
        productId: catalog.productId,
        storeId: store.id,
        title: `Anúncio ${name}${listing}`,
        externalId: externalId(name, listing),
      });
    }
  }
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("stock-price-sync per store", () => {
  it("syncs different stores at once, one listing at a time per store", async () => {
    const sync = createStockPriceSyncProcessor({
      database,
      connectors: recordingConnectors,
      cipher,
      acquireRateLimit: async () => {},
      safetyUnits: 0,
    });
    await sync();

    const [a1, a2, b1, b2] = [
      call(externalId("A", 1)),
      call(externalId("A", 2)),
      call(externalId("B", 1)),
      call(externalId("B", 2)),
    ];
    // Same store: the second call starts after the first one ended, in either order.
    const [firstA, secondA] = [a1, a2].toSorted((left, right) => left.startedAt - right.startedAt);
    const [firstB, secondB] = [b1, b2].toSorted((left, right) => left.startedAt - right.startedAt);
    expect(secondA?.startedAt).toBeGreaterThanOrEqual(firstA?.endedAt ?? Infinity);
    expect(secondB?.startedAt).toBeGreaterThanOrEqual(firstB?.endedAt ?? Infinity);
    // Different stores: B's first call starts before A's first one ends.
    expect(firstB?.startedAt).toBeLessThan(firstA?.endedAt ?? 0);

    // Store C was refused on its first listing: its second one is not called in this run.
    const storeC = calls.filter((entry) => entry.externalId.includes("-C-"));
    expect(storeC).toHaveLength(1);
  });
});
