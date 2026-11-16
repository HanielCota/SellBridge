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

/**
 * How long store A's first call waits for store B to start one. A correct run never gets near it:
 * B starts as soon as its own preparation is done. Only a run that syncs stores one after the
 * other reaches it, and then B's call starts with A's already over, which the test catches.
 */
const OVERLAP_WAIT_MILLISECONDS = 10_000;
const TEST_TIMEOUT_MILLISECONDS = 30_000;
const RUN = randomUUID().slice(0, 8);

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;

/** One call as it started: what else was running at that moment. */
interface CallStart {
  externalId: string;
  store: string;
  /** Calls of the same store running when this one started, itself included. */
  sameStoreRunning: number;
  /** Other stores with a call running when this one started. */
  otherStoresRunning: string[];
}
const starts: CallStart[] = [];
const running = new Map<string, number>();

let markStoresOverlap: () => void = () => {};
/** Settles once a call of A and one of B are running at the same time. */
const storesOverlap = new Promise<void>((resolve) => {
  markStoresOverlap = resolve;
});

function externalId(store: string, listing: number): string {
  return `PAR-${RUN}-${store}-${listing}`;
}

function storeOf(id: string): string {
  const store = id.split("-").at(-2);
  if (store === undefined) {
    throw new Error(`external id without a store: ${id}`);
  }
  return store;
}

function runningCount(store: string): number {
  return running.get(store) ?? 0;
}

function recordStart(id: string): void {
  const store = storeOf(id);
  running.set(store, runningCount(store) + 1);
  starts.push({
    externalId: id,
    store,
    sameStoreRunning: runningCount(store),
    otherStoresRunning: [...running].flatMap(([other, count]) =>
      other !== store && count > 0 ? [other] : [],
    ),
  });
  if (runningCount("A") > 0 && runningCount("B") > 0) {
    markStoresOverlap();
  }
}

/** A's and B's calls hold on until both stores are calling, so overlap never hangs on timing. */
async function waitForTheOtherStore(store: string): Promise<void> {
  if (store !== "A" && store !== "B") {
    return;
  }
  await Promise.race([
    storesOverlap,
    new Promise((resolve) => setTimeout(resolve, OVERLAP_WAIT_MILLISECONDS)),
  ]);
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
      const store = storeOf(update.externalId);
      recordStart(update.externalId);
      try {
        await waitForTheOtherStore(store);
        if (store === "C") {
          throw marketplaceAuthError();
        }
      } finally {
        running.set(store, runningCount(store) - 1);
      }
    },
  },
};

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
  it(
    "syncs different stores at once, one listing at a time per store",
    async () => {
      const sync = createStockPriceSyncProcessor({
        database,
        connectors: recordingConnectors,
        cipher,
        acquireRateLimit: async () => {},
        safetyUnits: 0,
        showcaseUnits: 0,
      });
      await sync();

      const storeStarts = (store: string) => starts.filter((entry) => entry.store === store);
      // Same store: no call starts while another of that store is still running.
      expect(storeStarts("A").map((entry) => entry.sameStoreRunning)).toEqual([1, 1]);
      expect(storeStarts("B").map((entry) => entry.sameStoreRunning)).toEqual([1, 1]);
      // Different stores: one of A's or B's calls started while the other store was calling.
      const overlapping = starts.filter(
        (entry) =>
          (entry.store === "A" && entry.otherStoresRunning.includes("B")) ||
          (entry.store === "B" && entry.otherStoresRunning.includes("A")),
      );
      expect(overlapping.length).toBeGreaterThan(0);

      // Store C was refused on its first listing: its second one is not called in this run.
      expect(storeStarts("C")).toHaveLength(1);
    },
    TEST_TIMEOUT_MILLISECONDS,
  );
});
