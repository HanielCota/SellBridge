import { randomUUID } from "node:crypto";
import { DELIVERY_CONFIRMED_BY, SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, orderShipments, shipmentEvents } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { forwardOrder, updateShipment, type ShipmentAccess } from "./fulfillment.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplierA: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let supplierB: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";

async function forwardedTo(productId: string) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: randomUUID(),
      status: "paid",
      totalCents: 5000,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId: tenants.tenantA,
    orderId: order.id,
    supplierProductId: productId,
    title: "Camiseta",
    quantity: 1,
    unitPriceCents: 5000,
    unitCostCents: 1000,
  });
  const [link] = await forwardOrder(database, tenants.tenantA, {
    orderId: order.id,
    address: testAddress,
    notes: "",
  });
  if (link === undefined) throw new Error("No shipment");
  return link;
}

function move(
  shipmentId: string,
  status: "accepted" | "picking" | "ready" | "shipped" | "delivered",
  access: ShipmentAccess,
) {
  return updateShipment(
    database,
    {
      shipmentId,
      status,
      note: "",
      carrier: "Correios",
      trackingCode: "AB123456789BR",
      trackingUrl: "",
    },
    access,
  );
}

async function latestActor(shipmentId: string) {
  const [event] = await database
    .select({ actor: shipmentEvents.actor, status: shipmentEvents.status })
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, shipmentId))
    .orderBy(desc(shipmentEvents.createdAt))
    .limit(1);
  return event;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplierA = await createTestSupplierProduct(database, {
    sku: "ACCESS-A",
    title: "Camiseta",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  supplierB = await createTestSupplierProduct(database, {
    sku: "ACCESS-B",
    title: "Calça",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
});

afterAll(async () => {
  await tenants.cleanup();
  await supplierA.cleanup();
  await supplierB.cleanup();
  await database.$client.end();
});

describe("updateShipment with a supplier id", () => {
  it("moves the supplier's own parcel and credits the supplier", async () => {
    const { shipmentId } = await forwardedTo(supplierA.productId);
    await move(shipmentId, "accepted", { supplierId: supplierA.supplierId });
    expect(await latestActor(shipmentId)).toEqual({
      actor: SHIPMENT_ACTORS.supplier,
      status: "accepted",
    });
  });

  it("cannot move another supplier's parcel", async () => {
    const { shipmentId } = await forwardedTo(supplierA.productId);
    await expect(
      move(shipmentId, "accepted", { supplierId: supplierB.supplierId }),
    ).rejects.toThrow(/não encontrado/);
    const [shipment] = await database
      .select({ status: orderShipments.status })
      .from(orderShipments)
      .where(eq(orderShipments.id, shipmentId));
    expect(shipment?.status).toBe("forwarded");
  });

  it("cannot declare the delivery, which only the reseller or the marketplace confirms", async () => {
    const { shipmentId } = await forwardedTo(supplierA.productId);
    const supplier = { supplierId: supplierA.supplierId };
    for (const status of ["accepted", "picking", "ready", "shipped"] as const) {
      await move(shipmentId, status, supplier);
    }
    await expect(move(shipmentId, "delivered", supplier)).rejects.toThrow(DELIVERY_CONFIRMED_BY);
  });
});

describe("updateShipment existing callers", () => {
  it("still credits the reseller on the tenant path, which may confirm the delivery", async () => {
    const { shipmentId } = await forwardedTo(supplierA.productId);
    const reseller = { tenantId: tenants.tenantA };
    for (const status of ["accepted", "picking", "ready", "shipped", "delivered"] as const) {
      await move(shipmentId, status, reseller);
    }
    expect(await latestActor(shipmentId)).toEqual({
      actor: SHIPMENT_ACTORS.reseller,
      status: "delivered",
    });
  });

  it("still credits the supplier on the link token path, scoped to the token", async () => {
    const first = await forwardedTo(supplierA.productId);
    const second = await forwardedTo(supplierA.productId);
    await move(first.shipmentId, "accepted", { token: first.token });
    expect(await latestActor(first.shipmentId)).toEqual({
      actor: SHIPMENT_ACTORS.supplier,
      status: "accepted",
    });
    await expect(move(second.shipmentId, "accepted", { token: first.token })).rejects.toThrow(
      /não encontrado/,
    );
  });

  it("keeps another tenant out of the parcel", async () => {
    const { shipmentId } = await forwardedTo(supplierA.productId);
    await expect(move(shipmentId, "accepted", { tenantId: tenants.tenantB })).rejects.toThrow(
      /não encontrado/,
    );
  });
});
