import { randomUUID } from "node:crypto";
import { SHIPMENT_ACTORS, type FulfillmentStatus } from "@sellbridge/shared/schemas";
import { hasErrorCode } from "@sellbridge/shared/errors";
import { SUPPLIER_EMAIL_FAILED_NOTE } from "@sellbridge/shared/forward-notes";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  orderShipments,
  shipmentEvents,
  supplierProducts,
  supplierReviews,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  publishTestProduct,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  getSupplierPanelProfile,
  listSupplierHealthDrillDown,
  listSupplierOpenShipments,
  listSupplierOutOfStockListed,
  loadSupplierHealthInput,
} from "./supplier-panel-home.ts";

const database = createTestDatabase();
const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = new Date();
const EMAIL_FAILED = SUPPLIER_EMAIL_FAILED_NOTE;

let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let otherSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeA = "";
let storeB = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  storeA = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
  storeB = (await upsertStoreConnection(database, testStoreInput(tenants.tenantB, randomUUID())))
    .id;
  supplier = await createTestSupplierProduct(database, {
    sku: `HOME-${randomUUID()}`,
    title: "Caneca",
    costCents: 1000,
    suggestedPriceCents: 2500,
    stock: 0,
  });
  otherSupplier = await createTestSupplierProduct(database, {
    sku: `HOME-OTHER-${randomUUID()}`,
    title: "Copo",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await otherSupplier.cleanup();
  await database.$client.end();
});

interface ParcelEvent {
  status: FulfillmentStatus;
  actor: string;
  hoursAfterForward: number;
  note?: string;
}

async function parcel(input: {
  supplierId: string;
  daysAgo: number;
  status: FulfillmentStatus;
  events: ParcelEvent[];
  tenantId?: string;
  storeId?: string;
}) {
  const tenantId = input.tenantId ?? tenants.tenantA;
  const forwardedAt = new Date(NOW.getTime() - input.daysAgo * DAY);
  const { orderId } = await upsertMarketplaceOrder(database, tenantId, input.storeId ?? storeA, {
    externalOrderId: `ORD-${randomUUID()}`,
    status: "paid",
    totalCents: 2500,
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt: forwardedAt,
    items: [],
  });
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId,
      orderId,
      supplierId: input.supplierId,
      status: input.status,
      address: testAddress,
      items: [],
      createdAt: forwardedAt,
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) {
    throw new Error("envio não criado");
  }
  const forward: ParcelEvent = {
    status: "forwarded",
    actor: SHIPMENT_ACTORS.reseller,
    hoursAfterForward: 0,
  };
  await database.insert(shipmentEvents).values(
    [forward, ...input.events].map((event) => ({
      shipmentId: shipment.id,
      status: event.status,
      actor: event.actor,
      note: event.note ?? "",
      createdAt: new Date(forwardedAt.getTime() + event.hoursAfterForward * HOUR),
    })),
  );
  return { orderId, shipmentId: shipment.id };
}

const supplierActor = SHIPMENT_ACTORS.supplier;

describe("loadSupplierHealthInput", () => {
  it("reads the supplier's parcels and reviews of both windows, and nothing else", async () => {
    const onTime = await parcel({
      supplierId: supplier.supplierId,
      daysAgo: 10,
      status: "shipped",
      events: [
        { status: "accepted", actor: supplierActor, hoursAfterForward: 1 },
        { status: "shipped", actor: supplierActor, hoursAfterForward: 10 },
      ],
    });
    const cancelled = await parcel({
      supplierId: supplier.supplierId,
      daysAgo: 90,
      status: "cancelled",
      tenantId: tenants.tenantB,
      storeId: storeB,
      events: [{ status: "cancelled", actor: supplierActor, hoursAfterForward: 2 }],
    });
    await parcel({ supplierId: supplier.supplierId, daysAgo: 200, status: "shipped", events: [] });
    await parcel({
      supplierId: otherSupplier.supplierId,
      daysAgo: 5,
      status: "forwarded",
      events: [],
    });
    await database.insert(supplierReviews).values({
      tenantId: tenants.tenantA,
      orderId: onTime.orderId,
      supplierId: supplier.supplierId,
      rating: 2,
    });

    const input = await loadSupplierHealthInput(database, {
      supplierId: supplier.supplierId,
      now: NOW,
    });

    const byOrder = new Map(input.shipments.map((record) => [record.orderId, record]));
    expect(input.shipments).toHaveLength(2);
    expect(byOrder.get(onTime.orderId)).toMatchObject({
      status: "shipped",
      cancelledBySupplier: false,
      acceptWithinHours: 24,
      dispatchWithinHours: 48,
    });
    const record = byOrder.get(onTime.orderId);
    expect(record?.forwardedAt).toBeInstanceOf(Date);
    expect(record?.acceptedAt?.getTime()).toBe((record?.forwardedAt?.getTime() ?? 0) + HOUR);
    expect(record?.shippedAt?.getTime()).toBe((record?.forwardedAt?.getTime() ?? 0) + 10 * HOUR);
    expect(byOrder.get(cancelled.orderId)).toMatchObject({
      cancelledBySupplier: true,
      acceptedAt: null,
    });
    expect(input.reviews).toEqual([
      expect.objectContaining({ orderId: onTime.orderId, rating: 2 }),
    ]);
  });

  it("lists the low review behind the rating in the drill-down", async () => {
    const rows = await listSupplierHealthDrillDown(database, {
      supplierId: supplier.supplierId,
      metric: "average_rating",
      now: NOW,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rating).toBe(2);
  });
});

describe("listSupplierOpenShipments", () => {
  it("brings the parcels still with the supplier and SellBridge's notes since the forward", async () => {
    const failed = await parcel({
      supplierId: supplier.supplierId,
      daysAgo: 1,
      status: "forwarded",
      events: [
        {
          status: "forwarded",
          actor: SHIPMENT_ACTORS.sellbridge,
          hoursAfterForward: 0.1,
          note: EMAIL_FAILED,
        },
        { status: "forwarded", actor: supplierActor, hoursAfterForward: 0.2, note: "Ocorrência" },
      ],
    });
    const open = await listSupplierOpenShipments(database, supplier.supplierId);
    const found = open.find((signal) => signal.orderId === failed.orderId);
    expect(found?.systemNotes).toEqual([EMAIL_FAILED]);
    expect(found?.forwardedAt).toBeInstanceOf(Date);
    expect(
      open.every((signal) => ["forwarded", "accepted", "picking", "ready"].includes(signal.status)),
    ).toBe(true);
  });
});

describe("listSupplierOutOfStockListed", () => {
  it("counts the published listings of active products without stock", async () => {
    await publishTestProduct(database, supplier.productId, [
      { tenantId: tenants.tenantA, storeId: storeA },
      { tenantId: tenants.tenantB, storeId: storeB },
    ]);
    await publishTestProduct(database, otherSupplier.productId, [
      { tenantId: tenants.tenantA, storeId: storeA },
    ]);
    const signals = await listSupplierOutOfStockListed(database, supplier.supplierId);
    expect(signals).toEqual([
      expect.objectContaining({
        productId: supplier.productId,
        availableStock: 0,
        activeListings: 2,
      }),
    ]);
  });

  it("leaves out products with stock left", async () => {
    await database
      .update(supplierProducts)
      .set({ stock: 5, reservedStock: 2 })
      .where(eq(supplierProducts.id, supplier.productId));
    expect(await listSupplierOutOfStockListed(database, supplier.supplierId)).toEqual([]);
  });

  it("shows an oversold product with negative stock", async () => {
    await database
      .update(supplierProducts)
      .set({ stock: 1, reservedStock: 3 })
      .where(eq(supplierProducts.id, supplier.productId));
    const [signal] = await listSupplierOutOfStockListed(database, supplier.supplierId);
    expect(signal?.availableStock).toBe(-2);
  });
});

describe("getSupplierPanelProfile", () => {
  it("returns the supplier's own deadlines", async () => {
    expect(await getSupplierPanelProfile(database, supplier.supplierId)).toMatchObject({
      id: supplier.supplierId,
      acceptWithinHours: 24,
    });
  });

  it("fails with a typed not found for an unknown id", async () => {
    const error = await getSupplierPanelProfile(database, randomUUID()).catch(
      (caught: unknown) => caught,
    );
    expect(hasErrorCode(error, "NOT_FOUND")).toBe(true);
  });
});
