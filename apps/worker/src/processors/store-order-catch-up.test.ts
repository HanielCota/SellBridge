import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { recordWebhookEvent } from "@sellbridge/database/repositories";
import type { MarketplaceOrder, StoreCredentials } from "@sellbridge/marketplaces";
import { encodeMockOrderResource } from "@sellbridge/marketplaces/testing";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPublishedTestTarget,
  createTestProduct,
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createWebhookEventProcessor } from "./webhook-event.ts";

const environment = createWorkerTestEnvironment();
const { database } = environment;
const listOrders =
  vi.fn<(credentials: StoreCredentials, since: Date) => Promise<MarketplaceOrder[]>>();
const mockConnector = environment.connectors.mock;
const fetchFromMockMarketplace = async (credentials: StoreCredentials, resource: string) =>
  mockConnector.fetchOrder(credentials, resource);
const fetchOrder =
  vi.fn<(credentials: StoreCredentials, resource: string) => Promise<MarketplaceOrder>>();
const requestStockSync = vi.fn<() => Promise<void>>();
const requestAutoForward = vi.fn<(orderId: string) => Promise<void>>();
const processWebhook = createWebhookEventProcessor({
  ...environment,
  connectors: {
    ...environment.connectors,
    mock: { ...environment.connectors.mock, listOrders, fetchOrder },
  },
  requestStockSync,
  requestAutoForward,
});

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let storeId = "";
let shopId = "";
const eventIds: string[] = [];

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  catalog = await createTestProduct(database, {
    sku: "CU-1",
    title: "Produto reconexão",
    stock: 5,
  });
  const store = await createTestStore(environment, tenants.first);
  storeId = store.id;
  shopId = store.externalShopId;
  await createPublishedTestTarget(database, {
    tenantId: tenants.first,
    productId: catalog.productId,
    storeId,
    title: "Anúncio reconexão",
    externalId: "MOCK-ITEM-CU",
  });
});

afterAll(async () => {
  await database.delete(schema.webhookEvents).where(inArray(schema.webhookEvents.id, eventIds));
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

/** The test's clock; webhook events still get the database's own receive time. */
const NOW = new Date("2026-10-24T12:00:00.000Z");
const ONE_MINUTE_IN_MS = 60_000;

beforeEach(() => {
  // Only Date is faked, so the database and Redis clients keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  listOrders.mockReset();
  fetchOrder.mockReset();
  fetchOrder.mockImplementation(fetchFromMockMarketplace);
  requestStockSync.mockReset();
  requestStockSync.mockResolvedValue(undefined);
  requestAutoForward.mockReset();
  requestAutoForward.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

function sale(externalOrderId: string): MarketplaceOrder {
  return {
    externalOrderId,
    status: "paid",
    totalCents: 4990,
    marketplaceFeeCents: 700,
    buyerName: "Comprador",
    orderedAt: NOW,
    items: [
      {
        externalListingId: "MOCK-ITEM-CU",
        title: "Anúncio reconexão",
        quantity: 1,
        unitPriceCents: 4990,
      },
    ],
  };
}

function catchUpJob(since: string) {
  return { data: { storeConnectionId: storeId, since }, attemptsMade: 0, maxAttempts: 5 };
}

async function ordersOf(externalOrderIds: string[]) {
  const rows = await database
    .select({ externalOrderId: schema.orders.externalOrderId, tenantId: schema.orders.tenantId })
    .from(schema.orders)
    .where(eq(schema.orders.storeConnectionId, storeId));
  return rows.filter((row) => externalOrderIds.includes(row.externalOrderId));
}

// Regression (security audit, 26/10/2026): notifications about a store without access are closed
// on arrival now, so the reconnection has to bring the sales in from the marketplace itself.
describe("store order catch-up after a reconnection", () => {
  it("reads the sales since the given time and stores them for the store's organization", async () => {
    const ids = [`CU-${randomUUID()}`, `CU-${randomUUID()}`];
    listOrders.mockResolvedValue(ids.map(sale));
    const since = "2026-10-20T00:00:00.000Z";

    expect(await processWebhook(catchUpJob(since))).toBe("orders_caught_up");

    expect(listOrders).toHaveBeenCalledWith(expect.anything(), new Date(since));
    const stored = await ordersOf(ids);
    expect(stored).toHaveLength(2);
    expect(stored.every((row) => row.tenantId === tenants.first)).toBe(true);
    expect(requestAutoForward).toHaveBeenCalledTimes(2);
  });

  it("only updates sales already stored when the catch-up runs again", async () => {
    const ids = [`CU-${randomUUID()}`];
    listOrders.mockResolvedValue(ids.map(sale));

    await processWebhook(catchUpJob("2026-10-21T00:00:00.000Z"));
    await processWebhook(catchUpJob("2026-10-21T00:00:00.000Z"));

    expect(await ordersOf(ids)).toHaveLength(1);
  });

  it("reads nothing when the store lost its access again before the job ran", async () => {
    await database
      .update(schema.storeConnections)
      .set({ status: "expired" })
      .where(eq(schema.storeConnections.id, storeId));
    try {
      expect(await processWebhook(catchUpJob("2026-10-22T00:00:00.000Z"))).toBe("unknown_store");
      expect(listOrders).not.toHaveBeenCalled();
    } finally {
      await database
        .update(schema.storeConnections)
        .set({ status: "connected" })
        .where(eq(schema.storeConnections.id, storeId));
    }
  });

  it("checks the sales notified while the store had no access, once", async () => {
    const externalOrderId = `CU-HELD-${randomUUID()}`;
    const held = await holdSaleEvent(externalOrderId);
    listOrders.mockResolvedValue([]);

    await processWebhook(catchUpJob(minutesBefore(held.receivedAt, 1)));

    expect(await ordersOf([externalOrderId])).toHaveLength(1);
    expect(await noteOf(held.id)).toBeNull();

    fetchOrder.mockClear();

    await processWebhook(catchUpJob(minutesBefore(held.receivedAt, 2)));

    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it("keeps checking the other held sales when one cannot be read", async () => {
    const failingOrderId = `CU-HELD-FAIL-${randomUUID()}`;
    const savedOrderId = `CU-HELD-OK-${randomUUID()}`;
    const failing = await holdSaleEvent(failingOrderId);
    const saved = await holdSaleEvent(savedOrderId);
    listOrders.mockResolvedValue([]);
    fetchOrder.mockImplementation(async (credentials, resource) => {
      if (resource === failing.resource) {
        throw new Error("marketplace unavailable");
      }
      return fetchFromMockMarketplace(credentials, resource);
    });

    await processWebhook(catchUpJob(minutesBefore(failing.receivedAt, 1)));

    expect(await ordersOf([failingOrderId])).toHaveLength(0);
    expect(await noteOf(failing.id)).toBe("Falha ao conferir o evento na reconexão");
    expect(await ordersOf([savedOrderId])).toHaveLength(1);
    expect(await noteOf(saved.id)).toBeNull();
  });
});

function minutesBefore(date: Date, minutes: number): string {
  return new Date(date.getTime() - minutes * ONE_MINUTE_IN_MS).toISOString();
}

async function setStoreStatus(status: "connected" | "expired") {
  await database
    .update(schema.storeConnections)
    .set({ status })
    .where(eq(schema.storeConnections.id, storeId));
}

/**
 * A sale notified while the store had no access: the event is closed with the held note and the
 * store is connected again, ready for the catch-up. Returns the database's receive time.
 */
async function holdSaleEvent(externalOrderId: string) {
  const resource = encodeMockOrderResource({
    ...sale(externalOrderId),
    orderedAt: NOW.toISOString(),
  });
  const recorded = await recordWebhookEvent(database, {
    marketplace: "mock",
    externalEventId: randomUUID(),
    topic: "orders",
    rawPayload: { shopId, resource },
    signatureValid: true,
  });
  if (recorded.status !== "created") {
    throw new Error(`Webhook event not created for order ${externalOrderId}`);
  }
  eventIds.push(recorded.id);
  await setStoreStatus("expired");
  const outcome = await processWebhook({
    data: { webhookEventId: recorded.id },
    attemptsMade: 0,
    maxAttempts: 5,
  });
  await setStoreStatus("connected");
  expect(outcome).toBe("awaiting_reconnection");
  const event = await database.query.webhookEvents.findFirst({
    where: eq(schema.webhookEvents.id, recorded.id),
    columns: { receivedAt: true },
  });
  if (event === undefined) {
    throw new Error(`Webhook event ${recorded.id} not found`);
  }
  return { id: recorded.id, resource, receivedAt: event.receivedAt };
}

async function noteOf(webhookEventId: string) {
  const event = await database.query.webhookEvents.findFirst({
    where: eq(schema.webhookEvents.id, webhookEventId),
    columns: { error: true },
  });
  return event?.error;
}
