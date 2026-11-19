import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { forwardOrder, recordWebhookEvent } from "@sellbridge/database/repositories";
import {
  marketplaceError,
  type MarketplaceClaim,
  parseMercadoLivreNotice,
} from "@sellbridge/marketplaces";
import { UnrecoverableError } from "bullmq";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestProduct,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import {
  type ClaimSweepDependencies,
  createClaimSweepProcessor,
} from "./marketplace-claim-sweep.ts";
import type { NoticeReaders } from "./marketplace-notice.ts";
import type { TrackedShipping } from "./shipment-tracking.ts";
import { createWebhookEventProcessor } from "./webhook-event.ts";

const environment = createWorkerTestEnvironment();
const { database, cipher } = environment;
const acquireRateLimit = vi.fn<(key: string) => Promise<void>>();
const requestStockSync = vi.fn<() => Promise<void>>();
const readShipmentOrders = vi.fn<NoticeReaders["readShipmentOrders"]>();
const readShipping = vi.fn<NoticeReaders["readShipping"]>();
const readClaim = vi.fn<NoticeReaders["readClaim"]>();
const readers: NoticeReaders = {
  parseNotice: (_marketplace, topic, rawPayload) => parseMercadoLivreNotice(topic, rawPayload),
  readShipmentOrders,
  readShipping,
  readClaim,
};
const processWebhook = createWebhookEventProcessor({
  ...environment,
  acquireRateLimit,
  requestStockSync,
  requestAutoForward: async () => {},
  requestCatchUp: async () => {},
  notices: readers,
});

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let storeId = "";
/** Numeric like a Mercado Livre seller id, unique per run. */
const shopId = String(Date.now());
const eventIds: string[] = [];

const address = {
  recipient: "Maria Silva",
  street: "Rua das Flores",
  number: "10",
  complement: "",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  postalCode: "01001-000",
};

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  catalog = await createTestProduct(database, { sku: "NTC-1", title: "Produto aviso", stock: 9 });
  const [store] = await database
    .insert(schema.storeConnections)
    .values({
      tenantId: tenants.first,
      marketplace: "mercado_livre",
      externalShopId: shopId,
      shopName: "Loja avisos",
      accessTokenEnc: cipher.encrypt("ml-access-token"),
      refreshTokenEnc: cipher.encrypt("ml-refresh-token"),
      expiresAt: new Date(Date.now() + 3_600_000),
      status: "connected",
    })
    .returning();
  if (store === undefined) throw new Error("loja de teste");
  storeId = store.id;
});

afterAll(async () => {
  await database.delete(schema.webhookEvents).where(inArray(schema.webhookEvents.id, eventIds));
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

beforeEach(() => {
  for (const mock of [
    acquireRateLimit,
    requestStockSync,
    readShipmentOrders,
    readShipping,
    readClaim,
  ]) {
    mock.mockReset();
  }
  acquireRateLimit.mockResolvedValue(undefined);
  requestStockSync.mockResolvedValue(undefined);
});

/** A paid order on the Mercado Livre store, already forwarded to the supplier. */
async function forwardedOrder() {
  const externalOrderId = `2000${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const [order] = await database
    .insert(schema.orders)
    .values({
      tenantId: tenants.first,
      storeConnectionId: storeId,
      externalOrderId,
      status: "paid",
      totalCents: 4990,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("pedido de teste");
  await database.insert(schema.orderItems).values({
    tenantId: tenants.first,
    orderId: order.id,
    supplierProductId: catalog.productId,
    title: "Produto aviso",
    quantity: 1,
    unitPriceCents: 4990,
    unitCostCents: 2000,
  });
  await forwardOrder(database, tenants.first, { orderId: order.id, address, notes: "" });
  return order;
}

/** A notification as Mercado Livre stores it (`verifyWebhook` keeps these fields). */
async function notice(topic: "shipments" | "post_purchase", resource: string, userId = shopId) {
  const result = await recordWebhookEvent(database, {
    marketplace: "mercado_livre",
    externalEventId: randomUUID(),
    topic,
    rawPayload: { _id: randomUUID(), resource, user_id: userId, topic, application_id: 1 },
    signatureValid: true,
  });
  if (result.status !== "created") throw new Error("evento não criado");
  eventIds.push(result.id);
  return result.id;
}

function job(webhookEventId: string, attemptsMade = 0) {
  return { data: { webhookEventId }, attemptsMade, maxAttempts: 5 };
}

function shipped(shipmentId: string): TrackedShipping {
  return {
    status: "shipped",
    trackingStatus: "shipped",
    buyerReturnDelivered: false,
    carrier: "Mercado Envios",
    trackingCode: "BR-NOTICE-1",
    logisticType: "cross_docking",
    estimatedDeliveryAt: null,
    dispatchDeadlineAt: null,
    shipmentId,
  };
}

function claim(overrides: Partial<MarketplaceClaim> = {}): MarketplaceClaim {
  return {
    externalClaimId: String(Date.now()) + String(Math.floor(Math.random() * 1000)),
    status: "opened",
    type: "mediations",
    stage: "claim",
    resource: "order",
    resourceId: "0",
    reasonId: "PDD9549",
    openedAt: new Date("2026-11-17T10:00:00.000Z"),
    marketplaceUpdatedAt: new Date("2026-11-17T10:00:00.000Z"),
    resolutionReason: null,
    closedAt: null,
    problem: "O produto chegou com defeito",
    actionResponsible: "seller",
    actionDueAt: new Date("2026-11-19T10:00:00.000Z"),
    return: null,
    ...overrides,
  };
}

async function eventRow(webhookEventId: string) {
  const [row] = await database
    .select()
    .from(schema.webhookEvents)
    .where(eq(schema.webhookEvents.id, webhookEventId));
  return row;
}

async function claimsOf(orderId: string) {
  return database
    .select()
    .from(schema.marketplaceClaims)
    .where(eq(schema.marketplaceClaims.orderId, orderId));
}

describe("shipment notifications", () => {
  it("reads the tracking of the shipment's order right away", async () => {
    const order = await forwardedOrder();
    const shipmentId = `4381${Date.now()}`;
    readShipmentOrders.mockResolvedValue([order.externalOrderId]);
    readShipping.mockResolvedValue(shipped(shipmentId));
    const eventId = await notice("shipments", `/shipments/${shipmentId}`);

    expect(await processWebhook(job(eventId))).toBe("shipment_tracked");

    const [parcel] = await database
      .select()
      .from(schema.orderShipments)
      .where(eq(schema.orderShipments.orderId, order.id));
    expect(parcel).toMatchObject({ status: "shipped", trackingCode: "BR-NOTICE-1" });
    expect(readShipping).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "ml-access-token" }),
      order.externalOrderId,
    );
    expect(requestStockSync).toHaveBeenCalledOnce();
    expect((await eventRow(eventId))?.processedAt).not.toBeNull();
  });

  it("finds the order by the stored shipment id without asking the marketplace again", async () => {
    const order = await forwardedOrder();
    const shipmentId = `4382${Date.now()}`;
    readShipmentOrders.mockResolvedValue([order.externalOrderId]);
    readShipping.mockResolvedValue({
      ...shipped(shipmentId),
      status: "ready_to_ship",
      trackingStatus: null,
    });
    await processWebhook(job(await notice("shipments", `/shipments/${shipmentId}`)));
    readShipmentOrders.mockClear();

    await processWebhook(job(await notice("shipments", `/shipments/${shipmentId}`)));

    expect(readShipmentOrders).not.toHaveBeenCalled();
    expect(readShipping).toHaveBeenCalledTimes(2);
  });

  it("marks the store as notified, so the periodic job reads it less often", async () => {
    readShipmentOrders.mockResolvedValue([]);

    await processWebhook(job(await notice("shipments", `/shipments/4383${Date.now()}`)));

    const [store] = await database
      .select({ at: schema.storeConnections.lastShipmentNoticeAt })
      .from(schema.storeConnections)
      .where(eq(schema.storeConnections.id, storeId));
    expect(store?.at).not.toBeNull();
  });

  it("closes the event of a shipment with no SellBridge order on its way", async () => {
    readShipmentOrders.mockResolvedValue(["999999999"]);
    const eventId = await notice("shipments", `/shipments/4384${Date.now()}`);

    expect(await processWebhook(job(eventId))).toBe("shipment_unknown");

    expect(readShipping).not.toHaveBeenCalled();
    expect((await eventRow(eventId))?.error).toBe("Envio sem pedido a caminho no SellBridge");
  });

  it("skips a notification about a shop that is not connected", async () => {
    const eventId = await notice("shipments", "/shipments/1", "1");

    expect(await processWebhook(job(eventId))).toBe("unknown_store");
    expect(readShipmentOrders).not.toHaveBeenCalled();
  });
});

describe("claim notifications", () => {
  it("reads the claim and stores it on its order", async () => {
    const order = await forwardedOrder();
    const reading = claim({ resourceId: order.externalOrderId });
    readClaim.mockResolvedValue(reading);
    const eventId = await notice(
      "post_purchase",
      `post-purchase/v1/claims/${reading.externalClaimId}`,
    );

    expect(await processWebhook(job(eventId))).toBe("claim_saved");

    expect(readClaim).toHaveBeenCalledWith(
      expect.objectContaining({ externalShopId: shopId }),
      reading.externalClaimId,
    );
    expect(await claimsOf(order.id)).toEqual([
      expect.objectContaining({
        externalClaimId: reading.externalClaimId,
        status: "opened",
        reasonId: "PDD9549",
        actionResponsible: "seller",
      }),
    ]);
    expect((await eventRow(eventId))?.processedAt).not.toBeNull();
  });

  // The notification is unsigned: every read spends the store's quota, like order notifications.
  it("spends the store's rate limit before asking for the claim", async () => {
    const order = await forwardedOrder();
    readClaim.mockResolvedValue(claim({ resourceId: order.externalOrderId }));

    await processWebhook(job(await notice("post_purchase", "/post-purchase/v1/claims/1")));

    expect(acquireRateLimit).toHaveBeenCalledWith(expect.stringContaining(storeId));
    const [firstLimit] = acquireRateLimit.mock.invocationCallOrder;
    const [firstRead] = readClaim.mock.invocationCallOrder;
    expect(firstLimit).toBeLessThan(firstRead ?? 0);
  });

  it("finds the order of a claim about a shipment through the shipment's orders", async () => {
    const order = await forwardedOrder();
    const reading = claim({ resource: "shipment", resourceId: "43810672299" });
    readClaim.mockResolvedValue(reading);
    readShipmentOrders.mockResolvedValue([order.externalOrderId]);

    await processWebhook(job(await notice("post_purchase", "/post-purchase/v1/claims/2")));

    expect(readShipmentOrders).toHaveBeenCalledWith(expect.anything(), "43810672299");
    expect(await claimsOf(order.id)).toHaveLength(1);
  });

  it("leaves alone a claim on a sale made outside SellBridge", async () => {
    readClaim.mockResolvedValue(claim({ resourceId: "123" }));
    const eventId = await notice("post_purchase", "/post-purchase/v1/claims/3");

    expect(await processWebhook(job(eventId))).toBe("claim_outside_sellbridge");
    expect((await eventRow(eventId))?.error).toBe(
      "Reclamação de uma venda que não está no SellBridge",
    );
  });

  it("closes the event for good when the marketplace refuses the claim", async () => {
    readClaim.mockRejectedValue(
      marketplaceError("Reclamação não pertence à loja conectada", { retryable: false }),
    );
    const eventId = await notice("post_purchase", "/post-purchase/v1/claims/4");

    await expect(processWebhook(job(eventId))).rejects.toBeInstanceOf(UnrecoverableError);
    expect((await eventRow(eventId))?.processedAt).not.toBeNull();
  });

  it("keeps the event open for a retry when the marketplace is down", async () => {
    readClaim.mockRejectedValue(marketplaceError("Fora do ar", { retryable: true }));
    const eventId = await notice("post_purchase", "/post-purchase/v1/claims/5");

    await expect(processWebhook(job(eventId))).rejects.toThrow("Fora do ar");
    expect((await eventRow(eventId))?.processedAt).toBeNull();
  });
});

describe("daily claim search", () => {
  it("stores the store's open and recent claims on their orders", async () => {
    const order = await forwardedOrder();
    const reading = claim({ resourceId: order.externalOrderId });
    const searchClaims = vi.fn<ClaimSweepDependencies["searchClaims"]>(async (store) =>
      store.externalShopId === shopId ? [reading.externalClaimId] : [],
    );
    readClaim.mockResolvedValue(reading);

    await createClaimSweepProcessor({
      database,
      cipher,
      acquireRateLimit,
      readers,
      searchClaims,
    })();

    expect(searchClaims).toHaveBeenCalledWith(expect.objectContaining({ externalShopId: shopId }), {
      status: "opened",
    });
    expect(await claimsOf(order.id)).toEqual([
      expect.objectContaining({ externalClaimId: reading.externalClaimId }),
    ]);
  });

  it("keeps going with the next claim when one fails", async () => {
    const order = await forwardedOrder();
    const reading = claim({ resourceId: order.externalOrderId });
    const searchClaims = vi.fn<ClaimSweepDependencies["searchClaims"]>(async (store) =>
      store.externalShopId === shopId ? ["broken", reading.externalClaimId] : [],
    );
    readClaim.mockImplementation(async (_store, claimId) => {
      if (claimId === "broken") throw marketplaceError("Fora do ar", { retryable: true });
      return reading;
    });

    const summary = await createClaimSweepProcessor({
      database,
      cipher,
      acquireRateLimit,
      readers,
      searchClaims,
    })();

    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(await claimsOf(order.id)).toHaveLength(1);
  });
});
