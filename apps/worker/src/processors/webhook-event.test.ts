import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { recordWebhookEvent } from "@sellbridge/database/repositories";
import { encodeMockOrderResource } from "@sellbridge/marketplaces";
import { UnrecoverableError } from "bullmq";
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
const requestStockSync = vi.fn<() => Promise<void>>();
const requestAutoForward = vi.fn<(orderId: string) => Promise<void>>();
const processWebhook = createWebhookEventProcessor({
  ...environment,
  requestStockSync,
  requestAutoForward,
});

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let tenantId = "";
let shopId = "";
let targetId = "";

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.first;
  catalog = await createTestProduct(database, { sku: "WH-1", title: "Produto webhook", stock: 5 });
  const store = await createTestStore(environment, tenantId);
  shopId = store.externalShopId;
  targetId = await createPublishedTestTarget(database, {
    tenantId,
    productId: catalog.productId,
    storeId: store.id,
    title: "Anúncio webhook",
    externalId: "MOCK-ITEM-WH",
  });
});

afterAll(async () => {
  await database.delete(schema.webhookEvents).where(inArray(schema.webhookEvents.id, eventIds));
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});
const eventIds: string[] = [];

async function recordEvent(payload: Record<string, unknown>, topic = "orders"): Promise<string> {
  const result = await recordWebhookEvent(database, {
    marketplace: "mock",
    externalEventId: randomUUID(),
    topic,
    rawPayload: payload,
    signatureValid: true,
  });
  if (result.status !== "created") {
    throw new Error("evento não criado");
  }
  eventIds.push(result.id);
  return result.id;
}

function job(webhookEventId: string) {
  return { data: { webhookEventId }, attemptsMade: 0, maxAttempts: 5 };
}

beforeEach(() => {
  requestStockSync.mockReset();
  requestStockSync.mockResolvedValue(undefined);
  requestAutoForward.mockReset();
  requestAutoForward.mockResolvedValue(undefined);
});

const orderResource = (
  externalListingId = "MOCK-ITEM-WH",
  status: "paid" | "pending" = "paid",
  externalOrderId = `SIM-${randomUUID()}`,
) =>
  encodeMockOrderResource({
    externalOrderId,
    status,
    totalCents: 4990,
    marketplaceFeeCents: 700,
    buyerName: "Comprador",
    orderedAt: new Date().toISOString(),
    items: [
      {
        externalListingId,
        title: "Anúncio webhook",
        quantity: 1,
        unitPriceCents: 4990,
      },
    ],
  });

async function setStoreStatus(status: "connected" | "expired") {
  await database
    .update(schema.storeConnections)
    .set({ status })
    .where(eq(schema.storeConnections.externalShopId, shopId));
}

describe("webhook-event processor", () => {
  it("fetches the order, stores it with our cost and is idempotent", async () => {
    const eventId = await recordEvent({ shopId, resource: orderResource() });
    expect(await processWebhook(job(eventId))).toBe("order_created");
    expect(await processWebhook(job(eventId))).toBe("already_processed");

    const rows = await database
      .select({ cost: schema.orderItems.unitCostCents, target: schema.orderItems.listingTargetId })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.tenantId, tenantId));
    expect(rows).toEqual([{ cost: 2000, target: targetId }]);
  });
});

async function storeStamp(eventId: string) {
  const [row] = await database
    .select({
      lastWebhookAt: schema.storeConnections.lastWebhookAt,
      receivedAt: schema.webhookEvents.receivedAt,
    })
    .from(schema.storeConnections)
    .innerJoin(schema.webhookEvents, eq(schema.webhookEvents.id, eventId))
    .where(eq(schema.storeConnections.externalShopId, shopId));
  return row;
}

/** The store as if no event had come yet, so the next one stamps it (stamps step a minute). */
async function clearStoreStamp() {
  await database
    .update(schema.storeConnections)
    .set({ lastWebhookAt: null })
    .where(eq(schema.storeConnections.externalShopId, shopId));
}

describe("store health stamp", () => {
  it("stamps the store with the time of the marketplace's event", async () => {
    await clearStoreStamp();
    const eventId = await recordEvent({ shopId, resource: orderResource() });
    await processWebhook(job(eventId));
    const row = await storeStamp(eventId);
    expect(row?.lastWebhookAt).toEqual(row?.receivedAt);
  });

  it("stamps a store waiting on a reconnection too: the marketplace still talks about it", async () => {
    await clearStoreStamp();
    await setStoreStatus("expired");
    try {
      const eventId = await recordEvent({ shopId, resource: orderResource() });
      expect(await processWebhook(job(eventId))).toBe("awaiting_reconnection");
      const row = await storeStamp(eventId);
      expect(row?.lastWebhookAt).toEqual(row?.receivedAt);
    } finally {
      await setStoreStatus("connected");
    }
  });
});

describe("webhook-event processor: stock and held sales", () => {
  it("asks to forward a paid order on its own, not one still waiting for payment", async () => {
    const externalOrderId = `SIM-${randomUUID()}`;
    const paid = await recordEvent({
      shopId,
      resource: orderResource("MOCK-ITEM-WH", "paid", externalOrderId),
    });
    expect(await processWebhook(job(paid))).toBe("order_created");
    const [paidOrder] = await database
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(eq(schema.orders.externalOrderId, externalOrderId));
    expect(requestAutoForward).toHaveBeenCalledWith(paidOrder?.id);

    requestAutoForward.mockClear();
    const pending = await recordEvent({
      shopId,
      resource: orderResource("MOCK-ITEM-WH", "pending"),
    });
    expect(await processWebhook(job(pending))).toBe("order_created");
    expect(requestAutoForward).not.toHaveBeenCalled();
  });

  it("keeps the order when asking to forward it fails", async () => {
    requestAutoForward.mockRejectedValue(new Error("Redis fora do ar"));
    const eventId = await recordEvent({ shopId, resource: orderResource() });
    expect(await processWebhook(job(eventId))).toBe("order_created");
  });

  it("asks for a stock sync right away when the order moved supplier stock", async () => {
    const eventId = await recordEvent({ shopId, resource: orderResource() });
    expect(await processWebhook(job(eventId))).toBe("order_created");
    expect(requestStockSync).toHaveBeenCalledTimes(1);
  });

  it("does not ask for a sync when the order touched no stock of ours", async () => {
    const eventId = await recordEvent({ shopId, resource: orderResource("NOT-OURS") });
    expect(await processWebhook(job(eventId))).toBe("order_created");
    expect(requestStockSync).not.toHaveBeenCalled();
  });

  it("keeps the order when the sync request fails: the scheduled sync catches up", async () => {
    requestStockSync.mockRejectedValue(new Error("Redis indisponível"));
    const eventId = await recordEvent({ shopId, resource: orderResource() });
    expect(await processWebhook(job(eventId))).toBe("order_created");
  });

  it("holds a sale while the store has lost its access, and takes it once reconnected", async () => {
    await setStoreStatus("expired");
    try {
      const eventId = await recordEvent({ shopId, resource: orderResource() });
      expect(await processWebhook(job(eventId))).toBe("awaiting_reconnection");
      const held = await database.query.webhookEvents.findFirst({
        where: eq(schema.webhookEvents.id, eventId),
      });
      // Not processed: the sweeper keeps retrying it.
      expect(held?.processedAt).toBeNull();

      await setStoreStatus("connected");
      expect(await processWebhook(job(eventId))).toBe("order_created");
    } finally {
      await setStoreStatus("connected");
    }
  });

  it("delivers a shop's sale to the organization connected to it now, never a former one", async () => {
    const owners = await createTestTenants(database, 2);
    const [formerOwner, currentOwner] = owners.ids;
    if (formerOwner === undefined || currentOwner === undefined) {
      throw new Error("tenants ausentes");
    }
    try {
      const current = await createTestStore(environment, currentOwner);
      await database.insert(schema.storeConnections).values({
        tenantId: formerOwner,
        marketplace: "mock",
        externalShopId: current.externalShopId,
        shopName: "Loja antiga",
        status: "disconnected",
      });
      const eventId = await recordEvent({
        shopId: current.externalShopId,
        resource: orderResource("NOT-OURS"),
      });
      expect(await processWebhook(job(eventId))).toBe("order_created");
      const owned = await database
        .select({ tenantId: schema.orders.tenantId })
        .from(schema.orders)
        .where(inArray(schema.orders.tenantId, owners.ids));
      expect(owned).toEqual([{ tenantId: currentOwner }]);
    } finally {
      await owners.cleanup();
    }
  });

  it("ignores other topics and events from unknown shops", async () => {
    expect(
      await processWebhook(job(await recordEvent({ shopId, resource: "x" }, "questions"))),
    ).toBe("ignored_topic");
    expect(
      await processWebhook(job(await recordEvent({ shopId: "loja-desconhecida", resource: "x" }))),
    ).toBe("unknown_store");
  });

  it("closes the event with the reason when the marketplace's answer can never be stored", async () => {
    const eventId = await recordEvent({ shopId, resource: "mock-order.invalido" });
    // No retry and no sweep: the same answer would come back every time.
    await expect(processWebhook(job(eventId))).rejects.toBeInstanceOf(UnrecoverableError);
    const row = await database.query.webhookEvents.findFirst({
      where: eq(schema.webhookEvents.id, eventId),
    });
    expect(row?.processedAt).toBeInstanceOf(Date);
    expect(row?.error).toBe("Pedido simulado em formato inválido");
  });
});
