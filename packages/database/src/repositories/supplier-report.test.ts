import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import { SHIPMENT_ACTORS, type FulfillmentStatus } from "@sellbridge/shared/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orderShipments, shipmentEvents, supplierReviews } from "../schema/index.ts";
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
  exportSupplierProducts,
  exportSupplierShipments,
  listSupplierReportReviews,
  listSupplierReportShipments,
  summarizeSupplierCatalog,
} from "./supplier-report.ts";

const database = createTestDatabase();
const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = new Date();
const supplierActor = SHIPMENT_ACTORS.supplier;

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
    sku: `REPORT-${randomUUID()}`,
    title: "Caneca",
    costCents: 1000,
    suggestedPriceCents: 2500,
    stock: 0,
  });
  otherSupplier = await createTestSupplierProduct(database, {
    sku: `REPORT-OTHER-${randomUUID()}`,
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
  hours: number;
}

interface ParcelInput {
  supplierId: string;
  productId: string;
  daysAgo: number;
  status: FulfillmentStatus;
  shippedAfterHours?: number;
  quantity?: number;
}

/** A paid order with one line of the product (sold at 39,90, costing 10,00) and its parcel. */
async function parcel(input: ParcelInput) {
  const forwardedAt = new Date(NOW.getTime() - input.daysAgo * DAY);
  const { orderId } = await upsertMarketplaceOrder(database, tenants.tenantA, storeA, {
    externalOrderId: `ORD-${randomUUID()}`,
    status: "paid",
    totalCents: 3990,
    marketplaceFeeCents: 0,
    buyerName: "Comprador Teste",
    orderedAt: forwardedAt,
    items: [],
  });
  const quantity = input.quantity ?? 2;
  const [line] = await database
    .insert(orderItems)
    .values({
      tenantId: tenants.tenantA,
      orderId,
      supplierProductId: input.productId,
      title: "Caneca",
      quantity,
      unitPriceCents: 3990,
      unitCostCents: 1000,
    })
    .returning({ id: orderItems.id });
  if (line === undefined) {
    throw new Error("item não criado");
  }
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: tenants.tenantA,
      orderId,
      supplierId: input.supplierId,
      status: input.status,
      address: testAddress,
      items: [{ orderItemId: line.id, title: "Caneca", sku: "CAN-1", quantity }],
      trackingCode: "BR123",
      createdAt: forwardedAt,
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) {
    throw new Error("envio não criado");
  }
  const forward: ParcelEvent = { status: "forwarded", actor: SHIPMENT_ACTORS.reseller, hours: 0 };
  const events: ParcelEvent[] =
    input.shippedAfterHours === undefined
      ? [forward]
      : [forward, { status: "shipped", actor: supplierActor, hours: input.shippedAfterHours }];
  await database.insert(shipmentEvents).values(
    events.map((event) => ({
      shipmentId: shipment.id,
      status: event.status,
      actor: event.actor,
      createdAt: new Date(forwardedAt.getTime() + event.hours * HOUR),
    })),
  );
  return { orderId, shipmentId: shipment.id };
}

describe("supplier report shipments", () => {
  let recent = { orderId: "", shipmentId: "" };
  let shippedLate = { orderId: "", shipmentId: "" };

  beforeAll(async () => {
    recent = await parcel({
      supplierId: supplier.supplierId,
      productId: supplier.productId,
      daysAgo: 2,
      status: "shipped",
      shippedAfterHours: 10,
    });
    // Received 40 days ago, dispatched only 5 days ago: in the window by its dispatch.
    shippedLate = await parcel({
      supplierId: supplier.supplierId,
      productId: supplier.productId,
      daysAgo: 40,
      status: "shipped",
      shippedAfterHours: 35 * 24,
    });
    await parcel({
      supplierId: supplier.supplierId,
      productId: supplier.productId,
      daysAgo: 3,
      status: "cancelled",
      quantity: 7,
    });
    await parcel({
      supplierId: otherSupplier.supplierId,
      productId: otherSupplier.productId,
      daysAgo: 1,
      status: "forwarded",
    });
  });

  it("reads parcels received or dispatched in the window, with the supplier's price per item", async () => {
    const since = new Date(NOW.getTime() - 10 * DAY);
    const rows = await listSupplierReportShipments(database, {
      supplierId: supplier.supplierId,
      since,
      until: new Date(NOW.getTime() + HOUR),
    });
    const ids = rows.map((row) => row.shipmentId);
    expect(ids).toContain(recent.shipmentId);
    expect(ids).toContain(shippedLate.shipmentId);
    expect(rows).toHaveLength(3);
    const row = rows.find((candidate) => candidate.shipmentId === recent.shipmentId);
    expect(row).toMatchObject({
      destinationCity: "São Paulo",
      destinationState: "SP",
      trackingCode: "BR123",
      items: [{ sku: "CAN-1", quantity: 2, unitCostCents: 1000, productId: supplier.productId }],
    });
    expect(row?.receivedAt).toBeInstanceOf(Date);
    expect(row?.shippedAt?.getTime()).toBe((row?.receivedAt.getTime() ?? 0) + 10 * HOUR);
  });

  it("keeps no buyer name, street or sale price in a row", async () => {
    const rows = await exportSupplierShipments(database, {
      supplierId: supplier.supplierId,
      from: new Date(NOW.getTime() - 10 * DAY),
      to: new Date(NOW.getTime() + HOUR),
    });
    const text = JSON.stringify(rows);
    expect(text).not.toContain("Comprador Teste");
    expect(text).not.toContain(testAddress.street);
    expect(text).not.toContain("3990");
  });

  it("exports only the parcels received in the period", async () => {
    const rows = await exportSupplierShipments(database, {
      supplierId: supplier.supplierId,
      from: new Date(NOW.getTime() - 10 * DAY),
      to: new Date(NOW.getTime() + HOUR),
    });
    expect(rows.map((row) => row.shipmentId)).not.toContain(shippedLate.shipmentId);
    expect(rows).toHaveLength(2);
  });

  it("refuses a period with more lines than one file carries", async () => {
    const error = await exportSupplierShipments(database, {
      supplierId: supplier.supplierId,
      from: new Date(NOW.getTime() - 60 * DAY),
      to: new Date(NOW.getTime() + HOUR),
      maxRows: 2,
    }).catch((caught: unknown) => caught);
    expect(hasErrorCode(error, "VALIDATION")).toBe(true);
  });
});

describe("supplier report products", () => {
  it("counts resellers with published listings and units sold outside cancelled parcels", async () => {
    await publishTestProduct(database, supplier.productId, [
      { tenantId: tenants.tenantA, storeId: storeA },
      { tenantId: tenants.tenantB, storeId: storeB },
    ]);
    const rows = await exportSupplierProducts(database, {
      supplierId: supplier.supplierId,
      from: new Date(NOW.getTime() - 10 * DAY),
      to: new Date(NOW.getTime() + HOUR),
    });
    expect(rows).toEqual([
      expect.objectContaining({
        productId: supplier.productId,
        costCents: 1000,
        resellers: 2,
        publishedListings: 2,
        soldUnits: 2,
      }),
    ]);
  });

  it("summarizes the catalog", async () => {
    expect(await summarizeSupplierCatalog(database, supplier.supplierId)).toEqual({
      products: 1,
      approved: 1,
    });
  });
});

describe("listSupplierReportReviews", () => {
  it("returns the reviews of the window with their comment", async () => {
    const { orderId } = await parcel({
      supplierId: supplier.supplierId,
      productId: supplier.productId,
      daysAgo: 1,
      status: "delivered",
    });
    await database.insert(supplierReviews).values({
      tenantId: tenants.tenantA,
      orderId,
      supplierId: supplier.supplierId,
      rating: 2,
      comment: "Chegou amassado",
    });
    const reviews = await listSupplierReportReviews(database, {
      supplierId: supplier.supplierId,
      since: new Date(NOW.getTime() - DAY),
      until: new Date(NOW.getTime() + HOUR),
    });
    expect(reviews).toEqual([
      expect.objectContaining({ orderId, rating: 2, comment: "Chegou amassado" }),
    ]);
  });
});
