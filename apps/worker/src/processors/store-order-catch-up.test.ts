import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { recordWebhookEvent } from "@sellbridge/database/repositories";
import {
  encodeMockOrderResource,
  type MarketplaceOrder,
  type StoreCredentials,
} from "@sellbridge/marketplaces";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const fetchOrder = vi.fn<
  (credentials: StoreCredentials, resource: string) => Promise<MarketplaceOrder>
>(async (credentials, resource) => mockConnector.fetchOrder(credentials, resource));
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

beforeEach(() => {
  listOrders.mockReset();
  fetchOrder.mockClear();
  requestStockSync.mockReset();
  requestStockSync.mockResolvedValue(undefined);
  requestAutoForward.mockReset();
  requestAutoForward.mockResolvedValue(undefined);
});

function sale(externalOrderId: string): MarketplaceOrder {
  return {
    externalOrderId,
    status: "paid",
    totalCents: 4990,
    marketplaceFeeCents: 700,
    buyerName: "Comprador",
    orderedAt: new Date(),
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
    const resource = encodeMockOrderResource({
      ...sale(externalOrderId),
      orderedAt: new Date().toISOString(),
    });
    const recorded = await recordWebhookEvent(database, {
      marketplace: "mock",
      externalEventId: randomUUID(),
      topic: "orders",
      rawPayload: { shopId, resource },
      signatureValid: true,
    });
    if (recorded.status !== "created") throw new Error("evento não criado");
    eventIds.push(recorded.id);
    await database
      .update(schema.storeConnections)
      .set({ status: "expired" })
      .where(eq(schema.storeConnections.id, storeId));
    expect(
      await processWebhook({
        data: { webhookEventId: recorded.id },
        attemptsMade: 0,
        maxAttempts: 5,
      }),
    ).toBe("awaiting_reconnection");
    await database
      .update(schema.storeConnections)
      .set({ status: "connected" })
      .where(eq(schema.storeConnections.id, storeId));
    listOrders.mockResolvedValue([]);

    await processWebhook(catchUpJob(new Date(Date.now() - 60_000).toISOString()));
    expect(await ordersOf([externalOrderId])).toHaveLength(1);
    const event = await database.query.webhookEvents.findFirst({
      where: eq(schema.webhookEvents.id, recorded.id),
    });
    expect(event?.error).toBeNull();

    fetchOrder.mockClear();
    await processWebhook(catchUpJob(new Date(Date.now() - 120_000).toISOString()));
    expect(fetchOrder).not.toHaveBeenCalled();
  });
});
