import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderShipments, storeConnections } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  applyMarketplaceShipment,
  listShipmentsToTrack,
  listTrackableStoreOrders,
  NOTIFIED_TRACKING_INTERVAL_MILLISECONDS,
  recordStoreShipmentNotice,
} from "./marketplace-shipment-tracking.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const HOUR_MILLISECONDS = 60 * 60 * 1000;
/** The shared test database holds other runs' parcels: the batch must reach every one. */
const WHOLE_TABLE = 100_000;
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;

async function mercadoLivreStore(tenantId: string) {
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenantId, `ml-${randomUUID()}`),
    marketplace: "mercado_livre",
  });
  return store.id;
}

async function parcelOnItsWay(input: {
  storeConnectionId: string;
  tenantId: string;
  trackedAt: Date | null;
  marketplaceShipmentId?: string;
}) {
  const externalOrderId = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const { orderId } = await upsertMarketplaceOrder(
    database,
    input.tenantId,
    input.storeConnectionId,
    {
      externalOrderId,
      status: "paid",
      totalCents: 2500,
      marketplaceFeeCents: 0,
      buyerName: null,
      orderedAt: new Date(),
      items: [],
    },
  );
  await database.insert(orderShipments).values({
    tenantId: input.tenantId,
    orderId,
    supplierId: supplier.supplierId,
    address: testAddress,
    items: [],
    status: "ready",
    trackedAt: input.trackedAt,
    marketplaceShipmentId: input.marketplaceShipmentId ?? null,
  });
  return { orderId, externalOrderId };
}

async function trackedOrderIds(now: Date): Promise<string[]> {
  const rows = await listShipmentsToTrack(database, { limit: WHOLE_TABLE, now });
  return rows.map((row) => row.orderId);
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplier = await createTestSupplierProduct(database, {
    sku: `NOTICE-${randomUUID()}`,
    title: "Caneca",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

describe("listShipmentsToTrack with shipment notifications", () => {
  it("keeps reading a store without notifications every run", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);
    const now = new Date();
    const parcel = await parcelOnItsWay({
      storeConnectionId: storeId,
      tenantId: tenants.tenantA,
      trackedAt: new Date(now.getTime() - HOUR_MILLISECONDS),
    });

    expect(await trackedOrderIds(now)).toContain(parcel.orderId);
  });

  it("skips a notified store's parcel read a short while ago", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);
    const now = new Date();
    await recordStoreShipmentNotice(database, { storeConnectionId: storeId, receivedAt: now });
    const parcel = await parcelOnItsWay({
      storeConnectionId: storeId,
      tenantId: tenants.tenantA,
      trackedAt: new Date(now.getTime() - HOUR_MILLISECONDS),
    });

    expect(await trackedOrderIds(now)).not.toContain(parcel.orderId);
  });

  it("still reads a notified store's parcel once its interval passed, or never read", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);
    const now = new Date();
    await recordStoreShipmentNotice(database, { storeConnectionId: storeId, receivedAt: now });
    const stale = await parcelOnItsWay({
      storeConnectionId: storeId,
      tenantId: tenants.tenantA,
      trackedAt: new Date(now.getTime() - NOTIFIED_TRACKING_INTERVAL_MILLISECONDS - 1),
    });
    const neverRead = await parcelOnItsWay({
      storeConnectionId: storeId,
      tenantId: tenants.tenantA,
      trackedAt: null,
    });

    const tracked = await trackedOrderIds(now);

    expect(tracked).toContain(stale.orderId);
    expect(tracked).toContain(neverRead.orderId);
  });

  it("goes back to every run when the store's notifications stop for a day", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);
    const now = new Date();
    await recordStoreShipmentNotice(database, {
      storeConnectionId: storeId,
      receivedAt: new Date(now.getTime() - 25 * HOUR_MILLISECONDS),
    });
    const parcel = await parcelOnItsWay({
      storeConnectionId: storeId,
      tenantId: tenants.tenantA,
      trackedAt: new Date(now.getTime() - HOUR_MILLISECONDS),
    });

    expect(await trackedOrderIds(now)).toContain(parcel.orderId);
  });

  it("never moves the last notification back with a late one", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);
    const now = new Date();
    await recordStoreShipmentNotice(database, { storeConnectionId: storeId, receivedAt: now });

    await recordStoreShipmentNotice(database, {
      storeConnectionId: storeId,
      receivedAt: new Date(now.getTime() - HOUR_MILLISECONDS),
    });

    const [store] = await database
      .select({ at: storeConnections.lastShipmentNoticeAt })
      .from(storeConnections)
      .where(eq(storeConnections.id, storeId));
    expect(store?.at?.getTime()).toBe(now.getTime());
  });
});

describe("listTrackableStoreOrders", () => {
  it("finds the order by the shipment id stored on its parcel", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);
    const shipmentId = `${Date.now()}`;
    const parcel = await parcelOnItsWay({
      storeConnectionId: storeId,
      tenantId: tenants.tenantA,
      trackedAt: null,
      marketplaceShipmentId: shipmentId,
    });

    const rows = await listTrackableStoreOrders(database, {
      storeConnectionId: storeId,
      match: { marketplaceShipmentId: shipmentId },
    });

    expect(rows.map((row) => row.orderId)).toEqual([parcel.orderId]);
  });

  it("finds orders by marketplace order id only inside the store", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);
    const otherStoreId = await mercadoLivreStore(tenants.tenantB);
    const parcel = await parcelOnItsWay({
      storeConnectionId: storeId,
      tenantId: tenants.tenantA,
      trackedAt: null,
    });

    const own = await listTrackableStoreOrders(database, {
      storeConnectionId: storeId,
      match: { externalOrderIds: [parcel.externalOrderId] },
    });
    const other = await listTrackableStoreOrders(database, {
      storeConnectionId: otherStoreId,
      match: { externalOrderIds: [parcel.externalOrderId] },
    });

    expect(own.map((row) => row.orderId)).toEqual([parcel.orderId]);
    expect(other).toEqual([]);
  });

  it("answers nothing for an empty list of orders", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);

    const rows = await listTrackableStoreOrders(database, {
      storeConnectionId: storeId,
      match: { externalOrderIds: [] },
    });

    expect(rows).toEqual([]);
  });
});

describe("applyMarketplaceShipment", () => {
  it("keeps the marketplace's shipment id once read, for the next notification", async () => {
    const storeId = await mercadoLivreStore(tenants.tenantA);
    const parcel = await parcelOnItsWay({
      storeConnectionId: storeId,
      tenantId: tenants.tenantA,
      trackedAt: null,
    });

    await applyMarketplaceShipment(database, tenants.tenantA, parcel.orderId, {
      status: "ready_to_ship",
      trackingStatus: null,
      buyerReturnDelivered: false,
      carrier: "Mercado Envios",
      trackingCode: "ML123",
      shipmentId: "43810672299",
    });

    const [row] = await database
      .select({ marketplaceShipmentId: orderShipments.marketplaceShipmentId })
      .from(orderShipments)
      .where(eq(orderShipments.orderId, parcel.orderId));
    expect(row?.marketplaceShipmentId).toBe("43810672299");
  });
});
