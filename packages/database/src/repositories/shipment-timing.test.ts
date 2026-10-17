import { randomUUID } from "node:crypto";
import { SUPPLIER_EMAIL_FAILED_NOTE } from "@sellbridge/shared/forward-notes";
import { SHIPMENT_ACTORS, type FulfillmentStatus } from "@sellbridge/shared/schemas";
import { shipmentDelay } from "@sellbridge/shared/shipment-delay";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderShipments, shipmentEvents, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { shipmentTimingColumns } from "./shipment-timing.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const HOUR = 3_600_000;
const FORWARDED_AT = new Date(Date.now() - 30 * HOUR);

let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
  supplier = await createTestSupplierProduct(database, {
    sku: `TIMING-${randomUUID()}`,
    title: "Bolsa",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

interface TimedEvent {
  status: FulfillmentStatus;
  actor: string;
  hoursAfterForward: number;
  note?: string;
}

/** A parcel with the given history, its first forward `FORWARDED_AT`. */
async function parcelWith(status: FulfillmentStatus, events: readonly TimedEvent[]) {
  const { orderId } = await upsertMarketplaceOrder(database, tenants.tenantA, storeId, {
    externalOrderId: `ORD-${randomUUID()}`,
    status: "paid",
    totalCents: 2500,
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt: FORWARDED_AT,
    items: [],
  });
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: tenants.tenantA,
      orderId,
      supplierId: supplier.supplierId,
      status,
      address: testAddress,
      items: [],
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) {
    throw new Error("envio não criado");
  }
  const forward: TimedEvent = {
    status: "forwarded",
    actor: SHIPMENT_ACTORS.reseller,
    hoursAfterForward: 0,
  };
  await database.insert(shipmentEvents).values(
    [forward, ...events].map((event) => ({
      shipmentId: shipment.id,
      status: event.status,
      actor: event.actor,
      note: event.note ?? "",
      createdAt: new Date(FORWARDED_AT.getTime() + event.hoursAfterForward * HOUR),
    })),
  );
  return shipment.id;
}

async function timingOf(shipmentId: string) {
  const [row] = await database
    .select(shipmentTimingColumns)
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(eq(orderShipments.id, shipmentId));
  if (row === undefined) {
    throw new Error("envio não encontrado");
  }
  return row;
}

describe("latestForwardedAt", () => {
  it("keeps the forward time when notes are added while the parcel waits for the accept", async () => {
    const shipmentId = await parcelWith("forwarded", [
      {
        status: "forwarded",
        actor: SHIPMENT_ACTORS.sellbridge,
        hoursAfterForward: 0.01,
        note: SUPPLIER_EMAIL_FAILED_NOTE,
      },
      {
        status: "forwarded",
        actor: SHIPMENT_ACTORS.supplier,
        hoursAfterForward: 20,
        note: "Sem tinta",
      },
    ]);
    const timing = await timingOf(shipmentId);
    expect(timing.forwardedAt).toEqual(FORWARDED_AT);
    // 30 h after the forward with 24 h to accept: late, a note does not restart the clock.
    expect(shipmentDelay(timing, new Date())).toBe("accept_overdue");
  });

  it("starts over at a re-forward after a cancellation", async () => {
    const shipmentId = await parcelWith("forwarded", [
      { status: "cancelled", actor: SHIPMENT_ACTORS.supplier, hoursAfterForward: 2 },
      { status: "forwarded", actor: SHIPMENT_ACTORS.reseller, hoursAfterForward: 10 },
      { status: "forwarded", actor: SHIPMENT_ACTORS.supplier, hoursAfterForward: 12, note: "Ok" },
    ]);
    const timing = await timingOf(shipmentId);
    expect(timing.forwardedAt).toEqual(new Date(FORWARDED_AT.getTime() + 10 * HOUR));
  });
});
