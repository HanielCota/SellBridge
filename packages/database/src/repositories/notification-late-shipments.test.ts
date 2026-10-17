import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, notificationDeliveries, orderShipments } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { queueLateShipmentNotices } from "./notification-late-shipments.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const DAY = 86_400_000;
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let ownerA = "";
let ownerB = "";
let storeA = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 2);
  [ownerA = "", ownerB = ""] = users.ids;
  await database.insert(member).values(
    [
      [tenants.tenantA, ownerA],
      [tenants.tenantB, ownerB],
    ].map(([organizationId = "", userId = ""]) => ({
      id: randomUUID(),
      organizationId,
      userId,
      role: "owner",
      createdAt: new Date(),
    })),
  );
  storeA = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantA, `late-${randomUUID()}`))
  ).id;
  supplier = await createTestSupplierProduct(database, {
    sku: `LATE-${randomUUID()}`,
    title: "Fone",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

async function lateParcel(dispatchDeadlineAt: Date) {
  const { orderId } = await upsertMarketplaceOrder(database, tenants.tenantA, storeA, {
    externalOrderId: `ORD-${randomUUID()}`,
    status: "paid",
    totalCents: 2500,
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt: new Date(Date.now() - 10 * DAY),
    items: [],
  });
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: tenants.tenantA,
      orderId,
      supplierId: supplier.supplierId,
      address: testAddress,
      items: [],
      dispatchDeadlineAt,
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) {
    throw new Error("envio não criado");
  }
  return shipment.id;
}

async function lateEmails(userId: string, shipmentId: string) {
  return database
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, userId),
        eq(notificationDeliveries.channel, "email"),
        eq(notificationDeliveries.dedupeKey, `shipment:${shipmentId}:late:dispatch_overdue`),
      ),
    );
}

describe("queueLateShipmentNotices", () => {
  it("e-mails the workspace once when a parcel just became late", async () => {
    const shipmentId = await lateParcel(new Date(Date.now() - 2 * DAY));
    await queueLateShipmentNotices(database, { now: new Date(), tenantId: tenants.tenantA });
    await queueLateShipmentNotices(database, { now: new Date(), tenantId: tenants.tenantA });
    const emails = await lateEmails(ownerA, shipmentId);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.content).toMatchObject({
      subject: expect.stringContaining("Despacho atrasado"),
    });
    expect(await lateEmails(ownerB, shipmentId)).toEqual([]);
  });

  it("leaves alone parcels that were already late long ago", async () => {
    const shipmentId = await lateParcel(new Date(Date.now() - 20 * DAY));
    await queueLateShipmentNotices(database, { now: new Date(), tenantId: tenants.tenantA });
    expect(await lateEmails(ownerA, shipmentId)).toEqual([]);
  });

  it("ignores parcels on time", async () => {
    const shipmentId = await lateParcel(new Date(Date.now() + 2 * DAY));
    await queueLateShipmentNotices(database, { now: new Date(), tenantId: tenants.tenantA });
    expect(await lateEmails(ownerA, shipmentId)).toEqual([]);
  });
});
