import { randomUUID } from "node:crypto";
import type { SendEmail } from "@sellbridge/shared/mailer";
import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  member,
  notificationDeliveries,
  orderItems,
  orders,
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
import { forwardOrder } from "./fulfillment.ts";
import { listNotificationEvents } from "./notifications.ts";
import { deliverOrderMessageNotice } from "./order-message-delivery.ts";
import { upsertStoreConnection } from "./stores.ts";
import { markStoreMessagesRead } from "./supplier-order-messages.ts";
import { listSupplierShipments } from "./supplier-panel-orders.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let product: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";
let supplierUserId = "";

/** Tenant A sells; tenant B is the supplier's panel organization, with one person in it. */
beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 1);
  supplierUserId = users.ids[0] ?? "";
  product = await createTestSupplierProduct(database, {
    sku: `SMSG-${randomUUID().slice(0, 6)}`,
    title: "Vestido",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  await database
    .update(suppliers)
    .set({ organizationId: tenants.tenantB, contactEmail: "pedidos@fornecedor-painel.com.br" })
    .where(eq(suppliers.id, product.supplierId));
  await database.insert(member).values({
    id: randomUUID(),
    organizationId: tenants.tenantB,
    userId: supplierUserId,
    role: "owner",
    createdAt: new Date(),
  });
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await product.cleanup();
  await database.$client.end();
});

async function forwardedParcel() {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: `SMSG-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 5000,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId: tenants.tenantA,
    orderId: order.id,
    supplierProductId: product.productId,
    title: "Vestido",
    quantity: 1,
    unitPriceCents: 5000,
    unitCostCents: 1000,
  });
  const [link] = await forwardOrder(database, tenants.tenantA, {
    orderId: order.id,
    address: testAddress,
    notes: "",
  });
  if (link === undefined) throw new Error("No link");
  return { order, shipmentId: link.shipmentId };
}

async function write(shipmentId: string, actor: string, note: string, status = "forwarded") {
  await database.insert(shipmentEvents).values({
    shipmentId,
    actor,
    note,
    status: status === "accepted" ? "accepted" : "forwarded",
    createdAt: new Date(Date.now() + 1000),
  });
}

async function listedRow(shipmentId: string) {
  const page = await listSupplierShipments(database, {
    supplierId: product.supplierId,
    tab: "todo",
    page: 1,
    query: "",
  });
  return page.items.find((item) => item.id === shipmentId);
}

async function bellEntry(shipmentId: string) {
  const { events } = await listNotificationEvents(database, {
    tenantId: tenants.tenantB,
    userId: supplierUserId,
    reviewableSince: new Date(0),
  });
  return events.find((event) => event.kind === "order_message" && event.entityId === shipmentId);
}

describe("a store message on an order, for the supplier with a panel", () => {
  it("queues the supplier's notice and marks the order until the supplier opens it", async () => {
    const { order, shipmentId } = await forwardedParcel();
    await write(shipmentId, SHIPMENT_ACTORS.reseller, "Pode caprichar na embalagem? É presente.");
    const sendEmail = vi.fn<SendEmail>(async () => {});

    await deliverOrderMessageNotice(
      { database, sendEmail, appUrl: "https://app.sellbridge.test" },
      { shipmentId, author: "reseller", messageKey: randomUUID() },
    );
    const deliveries = await database
      .select({ recipientId: notificationDeliveries.recipientId })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.event, "store_order_message"),
          eq(notificationDeliveries.recipientId, supplierUserId),
          eq(notificationDeliveries.channel, "email"),
        ),
      );

    expect(deliveries).toHaveLength(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await listedRow(shipmentId))?.hasUnreadStoreMessage).toBe(true);
    expect(await bellEntry(shipmentId)).toMatchObject({
      from: "reseller",
      externalOrderId: order.externalOrderId,
      supplierTab: "todo",
    });
  });

  it("clears the mark and the bell entry once the supplier opens the order", async () => {
    const { shipmentId } = await forwardedParcel();
    await write(shipmentId, SHIPMENT_ACTORS.reseller, "Mandem a nota junto, por favor.");

    await markStoreMessagesRead(
      database,
      { supplierId: product.supplierId, shipmentId },
      new Date(Date.now() + 5000),
    );

    expect((await listedRow(shipmentId))?.hasUnreadStoreMessage).toBe(false);
    expect(await bellEntry(shipmentId)).toBeUndefined();
  });

  it("leaves the supplier's own messages and the store's step changes unmarked", async () => {
    const { shipmentId } = await forwardedParcel();
    await write(shipmentId, SHIPMENT_ACTORS.supplier, "Separando hoje");
    await write(shipmentId, SHIPMENT_ACTORS.reseller, "Aceito pelo fornecedor", "accepted");

    const row = await listedRow(shipmentId);

    expect(row?.hasUnreadStoreMessage).toBe(false);
    expect(await bellEntry(shipmentId)).toBeUndefined();
  });

  it("never marks another supplier's opening as this supplier's", async () => {
    const { shipmentId } = await forwardedParcel();
    await write(shipmentId, SHIPMENT_ACTORS.reseller, "Tem o tamanho M?");

    await markStoreMessagesRead(
      database,
      { supplierId: randomUUID(), shipmentId },
      new Date(Date.now() + 5000),
    );

    expect((await listedRow(shipmentId))?.hasUnreadStoreMessage).toBe(true);
  });
});
