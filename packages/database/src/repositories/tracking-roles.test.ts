import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  member,
  notificationDeliveries,
  orderShipments,
  shipmentEvents,
  suppliers,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { getBuyerTracking, saveBuyerTrackingToken } from "./buyer-tracking.ts";
import { applyMarketplaceShipment, updateShipment } from "./fulfillment.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { listTrackedParcels } from "./shipment-tracking.ts";
import { countParcelAlerts, listStaffShipments } from "./staff-shipments.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let otherSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";
let resellerOwner = "";
let supplierOwner = "";

/** Tenant A is the reseller; tenant B is the supplier's own organization (its panel account). */
beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 2);
  [resellerOwner = "", supplierOwner = ""] = users.ids;
  await database.insert(member).values(
    [
      [tenants.tenantA, resellerOwner],
      [tenants.tenantB, supplierOwner],
    ].map(([organizationId = "", userId = ""]) => ({
      id: randomUUID(),
      organizationId,
      userId,
      role: "owner",
      createdAt: new Date(),
    })),
  );
  storeId = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantA, `roles-${randomUUID()}`))
  ).id;
  supplier = await createTestSupplierProduct(database, {
    sku: `ROLES-${randomUUID()}`,
    title: "Luminária",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  otherSupplier = await createTestSupplierProduct(database, {
    sku: `ROLES-OTHER-${randomUUID()}`,
    title: "Vaso",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  await database
    .update(suppliers)
    .set({ organizationId: tenants.tenantB })
    .where(eq(suppliers.id, supplier.supplierId));
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await supplier.cleanup();
  await otherSupplier.cleanup();
  await database.$client.end();
});

async function sentParcel(trackingCode: string) {
  const externalOrderId = `ROLES-${randomUUID().slice(0, 8)}`;
  const { orderId } = await upsertMarketplaceOrder(database, tenants.tenantA, storeId, {
    externalOrderId,
    status: "paid",
    totalCents: 2500,
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt: new Date(),
    items: [],
  });
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: tenants.tenantA,
      orderId,
      supplierId: supplier.supplierId,
      address: testAddress,
      items: [{ orderItemId: randomUUID(), title: "Luminária Aura", sku: "AURA", quantity: 2 }],
      status: "shipped",
      carrier: "Correios",
      trackingCode,
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) {
    throw new Error("envio não criado");
  }
  await database
    .insert(shipmentEvents)
    .values({ shipmentId: shipment.id, status: "shipped", actor: "Fornecedor", note: "" });
  return { shipmentId: shipment.id, orderId, externalOrderId };
}

describe("tracking code correction", () => {
  it("keeps the old code in the history when a sent parcel's code is corrected", async () => {
    const parcel = await sentParcel("QB000000001BR");
    await updateShipment(
      database,
      {
        shipmentId: parcel.shipmentId,
        status: "shipped",
        carrier: "Correios",
        trackingCode: "QB000000002BR",
        trackingUrl: "",
        note: "",
      },
      { tenantId: tenants.tenantA },
    );
    const [stored] = await database
      .select({ trackingCode: orderShipments.trackingCode })
      .from(orderShipments)
      .where(eq(orderShipments.id, parcel.shipmentId));
    const events = await database
      .select({ note: shipmentEvents.note, actor: shipmentEvents.actor })
      .from(shipmentEvents)
      .where(eq(shipmentEvents.shipmentId, parcel.shipmentId))
      .orderBy(asc(shipmentEvents.createdAt));
    expect(stored?.trackingCode).toBe("QB000000002BR");
    expect(events.at(-1)).toEqual({
      note: "Código corrigido de QB000000001BR para QB000000002BR",
      actor: "Revendedor",
    });
  });
});

describe("who reads a parcel's tracking", () => {
  it("lets the supplier read its own parcel and no other supplier", async () => {
    const parcel = await sentParcel("QB000000003BR");
    const filter = { kind: "shipment" as const, shipmentId: parcel.shipmentId };
    const own = await listTrackedParcels(database, { supplierId: supplier.supplierId }, filter);
    const other = await listTrackedParcels(
      database,
      { supplierId: otherSupplier.supplierId },
      filter,
    );
    expect(own.map((row) => row.shipmentId)).toEqual([parcel.shipmentId]);
    expect(other).toEqual([]);
  });

  it("lets staff read any customer's parcel", async () => {
    const parcel = await sentParcel("QB000000004BR");
    const rows = await listTrackedParcels(
      database,
      { staff: true },
      { kind: "shipment", shipmentId: parcel.shipmentId },
    );
    expect(rows.map((row) => row.shipmentId)).toEqual([parcel.shipmentId]);
  });
});

describe("buyer tracking link", () => {
  it("shows the store and the city, never the supplier or the address", async () => {
    const parcel = await sentParcel("QB000000005BR");
    const token = randomUUID().replaceAll("-", "").repeat(2);
    await saveBuyerTrackingToken(database, {
      tenantId: tenants.tenantA,
      shipmentId: parcel.shipmentId,
      token,
    });
    const view = await getBuyerTracking(database, token);
    expect(view?.externalOrderId).toBe(parcel.externalOrderId);
    expect(view?.destination).toBe(`${testAddress.city}/${testAddress.state}`);
    expect(view?.items).toEqual([{ title: "Luminária Aura", quantity: 2 }]);
    expect(JSON.stringify(view)).not.toContain(testAddress.street);
    expect(view).not.toHaveProperty("supplierName");
  });

  it("refuses to create a link for another reseller's parcel", async () => {
    const parcel = await sentParcel("QB000000006BR");
    await expect(
      saveBuyerTrackingToken(database, {
        tenantId: tenants.tenantB,
        shipmentId: parcel.shipmentId,
        token: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("finds nothing for a token no parcel has", async () => {
    expect(await getBuyerTracking(database, "b".repeat(64))).toBeNull();
  });
});

describe("delivery problems", () => {
  it("warns the reseller and the supplier, and counts it for both and for staff", async () => {
    const parcel = await sentParcel("QB000000007BR");
    await applyMarketplaceShipment(database, tenants.tenantA, parcel.orderId, {
      status: "not_delivered",
      trackingStatus: "not_delivered",
      buyerReturnDelivered: false,
      carrier: null,
      trackingCode: null,
    });
    const deliveries = await database
      .select({ recipientId: notificationDeliveries.recipientId })
      .from(notificationDeliveries)
      .where(
        and(
          eq(
            notificationDeliveries.dedupeKey,
            `shipment:${parcel.shipmentId}:problem:not_delivered`,
          ),
          eq(notificationDeliveries.channel, "email"),
        ),
      );
    const staffList = await listStaffShipments(database, {
      group: "problem",
      query: parcel.externalOrderId,
      page: 1,
    });
    expect(deliveries.map((row) => row.recipientId).toSorted()).toEqual(
      [resellerOwner, supplierOwner].toSorted(),
    );
    expect(staffList.items.map((row) => row.shipmentId)).toEqual([parcel.shipmentId]);
    expect(await countParcelAlerts(database, { tenantId: tenants.tenantA })).toBeGreaterThan(0);
    expect(
      await countParcelAlerts(database, { supplierOrganizationId: tenants.tenantB }),
    ).toBeGreaterThan(0);
  });
});

describe("supplier order attention", () => {
  it("counts pending acceptance and delivery alerts once within the supplier workspace", async () => {
    const scope = { supplierOrganizationId: tenants.tenantB, includeForwarded: true };
    const before = await countParcelAlerts(database, scope);
    const pending = await sentParcel("QB000000008BR");
    const late = await sentParcel("QB000000009BR");
    await database
      .update(orderShipments)
      .set({ status: "forwarded" })
      .where(eq(orderShipments.id, pending.shipmentId));
    await database
      .update(orderShipments)
      .set({ status: "forwarded", dispatchDeadlineAt: new Date(0) })
      .where(eq(orderShipments.id, late.shipmentId));
    expect(await countParcelAlerts(database, scope)).toBe(before + 2);
    expect(
      await countParcelAlerts(database, {
        supplierOrganizationId: tenants.tenantA,
        includeForwarded: true,
      }),
    ).toBe(0);
  });
});
