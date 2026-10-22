import { randomUUID } from "node:crypto";
import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, shipmentEvents, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { forwardOrder } from "./fulfillment.ts";
import { orderMessageEvents } from "./notification-reply-events.ts";
import { findOrderMessageContext, orderMessageTimes } from "./order-message-notices.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let product: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  product = await createTestSupplierProduct(database, {
    sku: `MSG-${randomUUID().slice(0, 6)}`,
    title: "Vestido",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  await database
    .update(suppliers)
    .set({ contactEmail: "pedidos@fornecedor-mensagens.com.br" })
    .where(eq(suppliers.id, product.supplierId));
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
});

afterAll(async () => {
  await tenants.cleanup();
  await product.cleanup();
  await database.$client.end();
});

/** A paid order of profile A forwarded to the test supplier; returns its parcel. */
async function forwardedParcel() {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: `MSG-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 5000,
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("No order");
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
  if (!link) throw new Error("No link");
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

describe("orderMessageEvents: the bell's supplier messages", () => {
  it("lists a supplier note that keeps the status, once per order", async () => {
    const { order, shipmentId } = await forwardedParcel();
    await write(shipmentId, SHIPMENT_ACTORS.supplier, "A cor azul acabou");
    await write(shipmentId, SHIPMENT_ACTORS.supplier, "Mando a preta?");
    const events = await orderMessageEvents(database, {
      tenantId: tenants.tenantA,
      since: new Date(Date.now() - 60_000),
      limit: 10,
    });
    const forOrder = events.filter((event) => event.entityId === order.id);
    expect(forOrder).toHaveLength(1);
    expect(forOrder[0]).toMatchObject({
      kind: "order_message",
      externalOrderId: order.externalOrderId,
    });
  });

  it("leaves out the store's own messages and the supplier's step changes", async () => {
    const { order, shipmentId } = await forwardedParcel();
    await write(shipmentId, SHIPMENT_ACTORS.reseller, "Pode mandar a preta");
    await write(shipmentId, SHIPMENT_ACTORS.supplier, "Aceito", "accepted");
    const events = await orderMessageEvents(database, {
      tenantId: tenants.tenantA,
      since: new Date(Date.now() - 60_000),
      limit: 10,
    });
    expect(events.some((event) => event.entityId === order.id)).toBe(false);
  });

  it("never shows a store another store's messages", async () => {
    const { shipmentId } = await forwardedParcel();
    await write(shipmentId, SHIPMENT_ACTORS.supplier, "Mensagem da loja A");
    const events = await orderMessageEvents(database, {
      tenantId: tenants.tenantB,
      since: new Date(Date.now() - 60_000),
      limit: 10,
    });
    expect(events).toEqual([]);
  });
});

describe("findOrderMessageContext", () => {
  it("gives the supplier's order e-mail and the forward date, without any account", async () => {
    const { order, shipmentId } = await forwardedParcel();
    const context = await findOrderMessageContext(database, shipmentId);
    expect(context).toMatchObject({
      tenantId: tenants.tenantA,
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      supplierEmail: "pedidos@fornecedor-mensagens.com.br",
      supplierHasAccount: false,
    });
    expect(context?.forwardedAt).toBeInstanceOf(Date);
  });

  it("finds nothing for an unknown parcel", async () => {
    expect(await findOrderMessageContext(database, randomUUID())).toBeNull();
  });
});

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

describe("orderMessageTimes", () => {
  it("lists the author's messages oldest first, without the forward or the other side", async () => {
    const { shipmentId } = await forwardedParcel();
    // After the forward, which was just written: a message never comes before it.
    const first = minutesFromNow(1);
    const second = minutesFromNow(21);
    await database.insert(shipmentEvents).values([
      {
        shipmentId,
        actor: SHIPMENT_ACTORS.reseller,
        note: "primeira",
        status: "forwarded",
        createdAt: first,
      },
      {
        shipmentId,
        actor: SHIPMENT_ACTORS.supplier,
        note: "resposta",
        status: "forwarded",
        createdAt: minutesFromNow(2),
      },
      {
        shipmentId,
        actor: SHIPMENT_ACTORS.reseller,
        note: "segunda",
        status: "forwarded",
        createdAt: second,
      },
    ]);
    const times = await orderMessageTimes(database, {
      shipmentId,
      actor: SHIPMENT_ACTORS.reseller,
    });
    expect(times.map((time) => time.getTime())).toEqual([first.getTime(), second.getTime()]);
  });

  it("has nothing for an author who never wrote", async () => {
    const { shipmentId } = await forwardedParcel();
    expect(
      await orderMessageTimes(database, { shipmentId, actor: SHIPMENT_ACTORS.supplier }),
    ).toEqual([]);
  });
});
