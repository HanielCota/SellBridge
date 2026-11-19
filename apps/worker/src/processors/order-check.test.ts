import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import {
  type MarketplaceOrder,
  type MarketplaceOrderBatch,
  marketplaceAuthError,
  marketplaceError,
  type StoreCredentials,
} from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import type { OrderCheckJob } from "@sellbridge/shared/queues";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPublishedTestTarget,
  createTestProduct,
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import {
  checkStoreOrders,
  createOrderCheckDispatcher,
  ORDER_CHECK_WINDOW_IN_MS,
  STORE_SPACING_IN_MS,
} from "./order-check.ts";
import { saveMarketplaceOrder } from "./order-intake.ts";

const environment = createWorkerTestEnvironment();
const { database } = environment;
const RESOURCE_PREFIX = "check-order:";
/** The sales the fake marketplace knows, by number: what `fetchOrder` reads back. */
const marketplaceSales = new Map<string, MarketplaceOrder>();
const listOrders =
  vi.fn<(credentials: StoreCredentials, since: Date) => Promise<MarketplaceOrderBatch>>();
const fetchOrder =
  vi.fn<(credentials: StoreCredentials, resource: string) => Promise<MarketplaceOrder>>();
const requestStockSync = vi.fn<() => Promise<void>>();
const requestAutoForward = vi.fn<(orderId: string) => Promise<void>>();
const connectors = {
  ...environment.connectors,
  mock: {
    ...environment.connectors.mock,
    listOrders,
    fetchOrder,
    orderResource: (externalOrderId: string) => `${RESOURCE_PREFIX}${externalOrderId}`,
  },
};
const dependencies = {
  ...environment,
  connectors,
  acquireRateLimit: async () => {},
  requestStockSync,
  requestAutoForward,
};

const NOW = new Date("2026-11-19T12:00:00.000Z");
const ONE_MINUTE_IN_MS = 60_000;
const FROM = "2026-11-17T12:00:00.000Z";

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let store: Awaited<ReturnType<typeof createTestStore>>;
let otherStore: Awaited<ReturnType<typeof createTestStore>>;

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  catalog = await createTestProduct(database, {
    sku: "OC-1",
    title: "Produto conferência",
    stock: 50,
  });
  store = await createTestStore(environment, tenants.first);
  otherStore = await createTestStore(environment, tenants.first);
  await createPublishedTestTarget(database, {
    tenantId: tenants.first,
    productId: catalog.productId,
    storeId: store.id,
    title: "Anúncio conferência",
    externalId: "MOCK-ITEM-OC",
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

beforeEach(() => {
  // Only Date is faked, so the database client keeps its real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  marketplaceSales.clear();
  listOrders.mockReset();
  fetchOrder.mockReset();
  fetchOrder.mockImplementation(async (_credentials, resource) => {
    const known = marketplaceSales.get(resource.slice(RESOURCE_PREFIX.length));
    if (known === undefined) {
      throw marketplaceError("Pedido não encontrado", { retryable: false });
    }
    return known;
  });
  requestStockSync.mockReset();
  requestStockSync.mockResolvedValue(undefined);
  requestAutoForward.mockReset();
  requestAutoForward.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function sale(overrides: Partial<MarketplaceOrder> = {}): MarketplaceOrder {
  return {
    externalOrderId: `OC-${randomUUID()}`,
    status: "paid",
    totalCents: 4990,
    marketplaceFeeCents: 700,
    buyerName: "Comprador",
    orderedAt: new Date(NOW.getTime() - 30 * ONE_MINUTE_IN_MS),
    items: [
      {
        externalListingId: "MOCK-ITEM-OC",
        title: "Anúncio conferência",
        quantity: 1,
        unitPriceCents: 4990,
      },
    ],
    ...overrides,
  };
}

/** The marketplace lists these sales, and reads each one back by number. */
function marketplaceHas(...sales: MarketplaceOrder[]): void {
  for (const listed of sales) {
    marketplaceSales.set(listed.externalOrderId, listed);
  }
  listOrders.mockResolvedValue({ orders: sales, resumeFrom: null });
}

function job(storeConnectionId = store.id): OrderCheckJob {
  return { storeConnectionId, from: FROM };
}

async function storedOrders(externalOrderId: string) {
  return database
    .select({ id: schema.orders.id, status: schema.orders.status })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.storeConnectionId, store.id),
        eq(schema.orders.externalOrderId, externalOrderId),
      ),
    );
}

/** What the notification path saves for the sale (`webhook-event.ts` calls the same function). */
async function noticeSaves(order: MarketplaceOrder): Promise<"created" | "updated"> {
  return saveMarketplaceOrder(dependencies, store, order, { webhookEventId: randomUUID() });
}

/** The fields of each log line the spy saw for `event`: what the Problemas page records. */
function problemsReported(
  spy: { mock: { calls: readonly (readonly unknown[])[] } },
  event: string,
): unknown[] {
  return spy.mock.calls.filter((call) => call[0] === event).map((call) => call[1]);
}

describe("periodic order check of one store", () => {
  it("brings in a sale whose notice never came and reports it on Problemas", async () => {
    const warn = vi.spyOn(logger, "warn");
    const lost = sale();
    marketplaceHas(lost);

    expect(await checkStoreOrders(dependencies, job())).toBe("checked");

    expect(listOrders).toHaveBeenCalledWith(expect.anything(), new Date(FROM));
    expect(await storedOrders(lost.externalOrderId)).toEqual([
      { id: expect.any(String), status: "paid" },
    ]);
    expect(requestAutoForward).toHaveBeenCalledTimes(1);
    expect(problemsReported(warn, "order.found_by_check")).toEqual([
      expect.objectContaining({
        storeConnectionId: store.id,
        externalOrderId: lost.externalOrderId,
        problemKey: `order-check:${store.id}`,
      }),
    ]);
  });

  it("leaves a sale already stored alone, without reading it again or reporting it", async () => {
    const warn = vi.spyOn(logger, "warn");
    const known = sale();
    await noticeSaves(known);
    marketplaceHas(known);

    await checkStoreOrders(dependencies, job());

    expect(fetchOrder).not.toHaveBeenCalled();
    expect(problemsReported(warn, "order.found_by_check")).toEqual([]);
  });

  it("keeps one order when the notice arrives after the check brought the sale in", async () => {
    const late = sale();
    marketplaceHas(late);

    await checkStoreOrders(dependencies, job());
    const noticeResult = await noticeSaves(late);

    expect(noticeResult).toBe("updated");
    expect(await storedOrders(late.externalOrderId)).toHaveLength(1);
  });

  it("reports nothing when the notice lands while the check is reading the sale", async () => {
    const warn = vi.spyOn(logger, "warn");
    const racing = sale();
    marketplaceHas(racing);
    fetchOrder.mockImplementationOnce(async () => {
      await noticeSaves(racing);
      return racing;
    });

    await checkStoreOrders(dependencies, job());

    expect(await storedOrders(racing.externalOrderId)).toHaveLength(1);
    expect(problemsReported(warn, "order.found_by_check")).toEqual([]);
  });

  it("marks as paid a sale still waiting for payment here that the marketplace shows paid", async () => {
    const warn = vi.spyOn(logger, "warn");
    const waiting = sale({ status: "pending" });
    await noticeSaves(waiting);
    const paid = { ...waiting, status: "paid" as const };
    marketplaceHas(paid);

    await checkStoreOrders(dependencies, job());

    expect(await storedOrders(waiting.externalOrderId)).toEqual([
      { id: expect.any(String), status: "paid" },
    ]);
    expect(requestAutoForward).toHaveBeenCalledTimes(1);
    expect(problemsReported(warn, "order.found_by_check")).toEqual([
      expect.objectContaining({ externalOrderId: waiting.externalOrderId }),
    ]);
  });

  it("leaves a sale made a moment ago to its notice and the next run", async () => {
    const fresh = sale({ orderedAt: new Date(NOW.getTime() - ONE_MINUTE_IN_MS) });
    marketplaceHas(fresh);

    await checkStoreOrders(dependencies, job());

    expect(fetchOrder).not.toHaveBeenCalled();
    expect(await storedOrders(fresh.externalOrderId)).toEqual([]);
  });

  it("reports a sale the marketplace refuses for good and still brings in the others", async () => {
    const error = vi.spyOn(logger, "error");
    const refused = sale();
    const lost = sale();
    marketplaceHas(refused, lost);
    marketplaceSales.delete(refused.externalOrderId);

    expect(await checkStoreOrders(dependencies, job())).toBe("checked");

    expect(await storedOrders(lost.externalOrderId)).toHaveLength(1);
    expect(problemsReported(error, "order.check_sale_refused")).toEqual([
      expect.objectContaining({ externalOrderId: refused.externalOrderId }),
    ]);
  });

  it("fails the job on a failure worth retrying, so the queue tries again later", async () => {
    listOrders.mockRejectedValue(marketplaceError("Muitas requisições", { retryable: true }));

    await expect(checkStoreOrders(dependencies, job())).rejects.toMatchObject({
      message: "Muitas requisições",
    });
  });

  it("expires a store whose token is refused, reports it, and the next store is still checked", async () => {
    const error = vi.spyOn(logger, "error");
    const refusedStore = await createTestStore(environment, tenants.first);
    listOrders.mockRejectedValueOnce(marketplaceAuthError());

    const refusedOutcome = await checkStoreOrders(dependencies, job(refusedStore.id));
    marketplaceHas();
    const nextOutcome = await checkStoreOrders(dependencies, job(otherStore.id));

    expect(refusedOutcome).toBe("access_lost");
    expect(nextOutcome).toBe("checked");
    const [row] = await database
      .select({ status: schema.storeConnections.status })
      .from(schema.storeConnections)
      .where(eq(schema.storeConnections.id, refusedStore.id));
    expect(row?.status).toBe("expired");
    expect(problemsReported(error, "store.order_check_without_access")).toEqual([
      expect.objectContaining({ storeConnectionId: refusedStore.id }),
    ]);
  });

  it("skips a store that lost its access after the run queued it", async () => {
    const gone = await createTestStore(environment, tenants.first, "disconnected");

    expect(await checkStoreOrders(dependencies, job(gone.id))).toBe("store_unavailable");
    expect(listOrders).not.toHaveBeenCalled();
  });
});

describe("periodic order check run", () => {
  it("spreads the connected stores, reads two days back and reports the ones without access", async () => {
    const error = vi.spyOn(logger, "error");
    const newStore = await createTestStore(environment, tenants.first);
    const connectedAt = new Date(NOW.getTime() - 60 * ONE_MINUTE_IN_MS);
    await database
      .update(schema.storeConnections)
      .set({ connectedAt })
      .where(eq(schema.storeConnections.id, newStore.id));
    const expiredStore = await createTestStore(environment, tenants.first);
    await database
      .update(schema.storeConnections)
      .set({ status: "expired" })
      .where(eq(schema.storeConnections.id, expiredStore.id));
    const enqueue = vi.fn<(job: OrderCheckJob, delayInMs: number) => Promise<void>>();
    enqueue.mockResolvedValue(undefined);

    await createOrderCheckDispatcher({ database, connectors, marketplaces: ["mock"], enqueue })();

    const delays = enqueue.mock.calls.map(([, delayInMs]) => delayInMs);
    expect(delays).toEqual(delays.map((_delay, index) => index * STORE_SPACING_IN_MS));
    const jobs = new Map(enqueue.mock.calls.map(([queued]) => [queued.storeConnectionId, queued]));
    expect(jobs.get(newStore.id)?.from).toBe(connectedAt.toISOString());
    expect(jobs.has(expiredStore.id)).toBe(false);
    expect(problemsReported(error, "store.order_check_without_access")).toContainEqual(
      expect.objectContaining({ storeConnectionId: expiredStore.id }),
    );
  });

  it("starts the read two days back for a store connected long ago", async () => {
    const oldStore = await createTestStore(environment, tenants.first);
    await database
      .update(schema.storeConnections)
      .set({ connectedAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(schema.storeConnections.id, oldStore.id));
    const enqueue = vi.fn<(job: OrderCheckJob, delayInMs: number) => Promise<void>>();
    enqueue.mockResolvedValue(undefined);

    await createOrderCheckDispatcher({ database, connectors, marketplaces: ["mock"], enqueue })();

    const queued = enqueue.mock.calls.find(
      ([checked]) => checked.storeConnectionId === oldStore.id,
    );
    expect(queued?.[0].from).toBe(new Date(NOW.getTime() - ORDER_CHECK_WINDOW_IN_MS).toISOString());
  });

  it("skips a marketplace whose connector cannot read an order by number", async () => {
    const enqueue = vi.fn<(job: OrderCheckJob, delayInMs: number) => Promise<void>>();

    await createOrderCheckDispatcher({
      database,
      connectors: environment.connectors,
      marketplaces: ["mock"],
      enqueue,
    })();

    expect(enqueue).not.toHaveBeenCalled();
  });
});
