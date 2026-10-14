import { randomUUID } from "node:crypto";
import type { MarketplaceTrackingStatus } from "@sellbridge/shared/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, orderShipments, user } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  applyMarketplaceShipment,
  forwardOrder,
  getFulfillmentDetail,
  getSupplierShipment,
  listOperationalOrders,
  reforwardShipment,
  revokeSupplierLink,
  rotateSupplierLink,
  updateShipment,
} from "./fulfillment.ts";
import { clearNotifications, listNotificationEvents } from "./notifications.ts";
import { upsertMarketplaceOrder } from "./orders.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplierA: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let supplierB: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";
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
async function createOrder(
  status: "paid" | "pending" = "paid",
  secondSupplier = false,
  unmapped = false,
) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: randomUUID(),
      status,
      totalCents: 10000,
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("No order");
  await database.insert(orderItems).values([
    {
      tenantId: tenants.tenantA,
      orderId: order.id,
      supplierProductId: unmapped ? null : supplierA.productId,
      title: "Camiseta",
      quantity: 2,
      unitPriceCents: 5000,
      unitCostCents: 1000,
    },
    ...(secondSupplier
      ? [
          {
            tenantId: tenants.tenantA,
            orderId: order.id,
            supplierProductId: supplierB.productId,
            title: "Calça",
            quantity: 1,
            unitPriceCents: 5000,
            unitCostCents: 1000,
          },
        ]
      : []),
  ]);
  return order;
}
const forward = (orderId: string) =>
  forwardOrder(database, tenants.tenantA, {
    orderId,
    address,
    notes: "Sem identificação do fornecedor",
  });
async function advance(
  shipmentId: string,
  status: "accepted" | "picking" | "ready" | "shipped" | "delivered",
  token?: string,
) {
  return updateShipment(
    database,
    {
      shipmentId,
      status,
      note: "",
      carrier: "Correios",
      trackingCode: "AB123456789BR",
      trackingUrl: "https://rastreamento.correios.com.br",
    },
    token ? { token } : { tenantId: tenants.tenantA },
  );
}
beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplierA = await createTestSupplierProduct(database, {
    sku: "FUL-A",
    title: "Camiseta",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  supplierB = await createTestSupplierProduct(database, {
    sku: "FUL-B",
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
/** A Mercado Livre reading of the parcel, as `loadMarketplaceShipping` returns it. */
function remote(
  status: string,
  trackingStatus: MarketplaceTrackingStatus | null,
  buyerReturnDelivered = false,
) {
  return {
    status,
    trackingStatus,
    buyerReturnDelivered,
    carrier: "Mercado Envios",
    trackingCode: "ML-404",
  };
}

/** Cancels a parcel with a reason, as the supplier (by link token) or the reseller. */
function cancel(shipmentId: string, reason: string, token?: string) {
  return updateShipment(
    database,
    {
      shipmentId,
      status: "cancelled",
      note: reason,
      carrier: "",
      trackingCode: "",
      trackingUrl: "",
    },
    token ? { token } : { tenantId: tenants.tenantA },
  );
}

async function cancelledNotices(userId = `reader-${randomUUID()}`) {
  const { events } = await listNotificationEvents(database, {
    tenantId: tenants.tenantA,
    userId,
    reviewableSince: new Date(0),
  });
  return events.filter((event) => event.kind === "shipment_cancelled");
}

describe("fulfillment", () => {
  it("splits by supplier, snapshots only their items and stores only a token hash", async () => {
    const order = await createOrder("paid", true);
    const links = await forward(order.id);
    expect(links).toHaveLength(2);
    const link = links[0];
    if (!link) throw new Error("No link");
    const supplierView = await getSupplierShipment(database, link.token);
    expect(supplierView.items).toHaveLength(1);
    expect(supplierView.address).toEqual(address);
    expect(supplierView).not.toHaveProperty("tenantId");
    expect(supplierView).not.toHaveProperty("supplierTokenHash");
    const [stored] = await database
      .select()
      .from(orderShipments)
      .where(eq(orderShipments.id, link.shipmentId));
    expect(stored?.supplierTokenHash).not.toBe(link.token);
    await expect(
      applyMarketplaceShipment(database, tenants.tenantA, order.id, {
        status: "shipped",
        trackingStatus: "shipped",
        buyerReturnDelivered: false,
        carrier: null,
        trackingCode: "123",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("prevents cross-tenant reads, forwarding and updates, and cross-shipment token writes", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    await expect(getFulfillmentDetail(database, tenants.tenantB, order.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      forwardOrder(database, tenants.tenantB, { orderId: order.id, address, notes: "" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateShipment(
        database,
        {
          shipmentId: link.shipmentId,
          status: "accepted",
          note: "",
          carrier: "",
          trackingCode: "",
          trackingUrl: "",
        },
        { tenantId: tenants.tenantB },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(advance(randomUUID(), "accepted", link.token)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("rejects unpaid and unmapped orders and serializes concurrent forwarding", async () => {
    const unpaid = await createOrder("pending");
    await expect(forward(unpaid.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const unmapped = await createOrder("paid", false, true);
    await expect(forward(unmapped.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const order = await createOrder();
    const results = await Promise.allSettled([forward(order.id), forward(order.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      (await getFulfillmentDetail(database, tenants.tenantA, order.id)).shipments,
    ).toHaveLength(1);
  });
  it("requires ordered transitions, supports supplier updates, and completes only after all parcels", async () => {
    const order = await createOrder("paid", true);
    const links = await forward(order.id);
    const first = links[0];
    if (!first) throw new Error("No link");
    await expect(advance(first.shipmentId, "shipped", first.token)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    for (const link of links)
      for (const status of ["accepted", "picking", "ready", "shipped"] as const)
        await advance(link.shipmentId, status, link.token);
    expect((await getFulfillmentDetail(database, tenants.tenantA, order.id)).order.status).toBe(
      "shipped",
    );
    await advance(first.shipmentId, "delivered", first.token);
    expect((await getFulfillmentDetail(database, tenants.tenantA, order.id)).order.status).toBe(
      "shipped",
    );
    const second = links[1];
    if (!second) throw new Error("No second link");
    await advance(second.shipmentId, "delivered", second.token);
    expect((await getFulfillmentDetail(database, tenants.tenantA, order.id)).order.status).toBe(
      "delivered",
    );
    await upsertMarketplaceOrder(database, tenants.tenantA, storeId, {
      externalOrderId: order.externalOrderId,
      status: "paid",
      totalCents: 10000,
      marketplaceFeeCents: 0,
      buyerName: null,
      orderedAt: order.orderedAt,
      items: [],
    });
    expect((await getFulfillmentDetail(database, tenants.tenantA, order.id)).order.status).toBe(
      "delivered",
    );
  });
  it("rotates, revokes and expires supplier access", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    const replacement = await rotateSupplierLink(database, tenants.tenantA, link.shipmentId);
    await expect(getSupplierShipment(database, link.token)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await getSupplierShipment(database, replacement.token)).id).toBe(link.shipmentId);
    await database
      .update(orderShipments)
      .set({ supplierTokenExpiresAt: new Date(0) })
      .where(eq(orderShipments.id, link.shipmentId));
    await expect(advance(link.shipmentId, "accepted", replacement.token)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await revokeSupplierLink(database, tenants.tenantA, link.shipmentId);
    await expect(getSupplierShipment(database, replacement.token)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("records a failed delivery and the parcel coming back, and keeps final statuses", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    const shipmentStatus = async () =>
      (await getFulfillmentDetail(database, tenants.tenantA, order.id)).shipments[0]?.status;

    // Still at the supplier: Mercado Livre's own pre-dispatch steps change nothing.
    await applyMarketplaceShipment(database, tenants.tenantA, order.id, remote("handling", null));
    expect(await shipmentStatus()).toBe("forwarded");
    await applyMarketplaceShipment(
      database,
      tenants.tenantA,
      order.id,
      remote("not_delivered", "not_delivered"),
    );
    expect(await shipmentStatus()).toBe("not_delivered");
    // By hand: an occurrence note is fine, but the parcel left, so no cancel and no new status.
    const byHand = (status: "not_delivered" | "returned" | "cancelled", note: string) =>
      updateShipment(
        database,
        {
          shipmentId: link.shipmentId,
          status,
          note,
          carrier: "",
          trackingCode: "",
          trackingUrl: "",
        },
        { tenantId: tenants.tenantA },
      );
    await byHand("not_delivered", "Comprador pediu nova tentativa");
    await expect(byHand("cancelled", "Desistiu")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(byHand("returned", "Voltou")).rejects.toMatchObject({ code: "CONFLICT" });
    await applyMarketplaceShipment(
      database,
      tenants.tenantA,
      order.id,
      remote("not_delivered", "returned"),
    );
    expect(await shipmentStatus()).toBe("returned");
    await expect(byHand("returned", "Mais uma nota")).rejects.toMatchObject({ code: "CONFLICT" });
    // Back with the seller is final: a late "shipped" reading cannot reopen it.
    await applyMarketplaceShipment(
      database,
      tenants.tenantA,
      order.id,
      remote("shipped", "shipped"),
    );
    expect(await shipmentStatus()).toBe("returned");
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.id);
    // Forwarded, the tracking code arriving, the failure, the note, the return.
    expect(detail.shipments[0]?.events.map((event) => event.status)).toEqual([
      "forwarded",
      "forwarded",
      "not_delivered",
      "not_delivered",
      "returned",
    ]);
    // The parcel came back: the order is returned, so it no longer counts as a sale.
    expect(detail.order.status).toBe("returned");
  });

  it("keeps a failed delivery out of shipped and delivered until the parcel comes back", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    await applyMarketplaceShipment(
      database,
      tenants.tenantA,
      order.id,
      remote("not_delivered", "not_delivered"),
    );
    expect((await getFulfillmentDetail(database, tenants.tenantA, order.id)).order.status).toBe(
      "paid",
    );
  });

  it("returns a delivered order once the buyer's return parcel reaches the seller", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    await applyMarketplaceShipment(
      database,
      tenants.tenantA,
      order.id,
      remote("delivered", "delivered"),
    );
    expect((await getFulfillmentDetail(database, tenants.tenantA, order.id)).order.status).toBe(
      "delivered",
    );
    await applyMarketplaceShipment(
      database,
      tenants.tenantA,
      order.id,
      remote("delivered", "delivered", true),
    );
    await applyMarketplaceShipment(
      database,
      tenants.tenantA,
      order.id,
      remote("delivered", "delivered", true),
    );
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.id);
    expect(detail.order.status).toBe("returned");
    // The sale parcel itself was delivered; only the order changed.
    expect(detail.shipments[0]?.status).toBe("delivered");
  });

  it("does not let a cancelled parcel hold the order back", async () => {
    const order = await createOrder("paid", true);
    const links = await forward(order.id);
    const [first, second] = links;
    if (!first || !second) throw new Error("No links");
    await cancel(second.shipmentId, "Sem estoque da calça", second.token);
    for (const status of ["accepted", "picking", "ready", "shipped", "delivered"] as const)
      await advance(first.shipmentId, status, first.token);
    expect((await getFulfillmentDetail(database, tenants.tenantA, order.id)).order.status).toBe(
      "delivered",
    );
  });

  it("re-forwards a parcel the supplier cancelled, with a new link and its history kept", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    // Not cancelled: nothing to re-forward.
    await expect(
      reforwardShipment(database, tenants.tenantA, link.shipmentId),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await cancel(link.shipmentId, "Produto em falta no depósito", link.token);
    await expect(
      reforwardShipment(database, tenants.tenantB, link.shipmentId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const again = await reforwardShipment(database, tenants.tenantA, link.shipmentId);
    expect(again.shipmentId).toBe(link.shipmentId);
    // The old link stops working; the new one opens the same parcel, ready to start over.
    await expect(getSupplierShipment(database, link.token)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await getSupplierShipment(database, again.token)).status).toBe("forwarded");
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.id);
    expect(detail.shipments).toHaveLength(1);
    expect(detail.shipments[0]?.events.map((event) => event.status)).toEqual([
      "forwarded",
      "cancelled",
      "forwarded",
    ]);
    // The supplier can take it from the start again.
    await advance(link.shipmentId, "accepted", again.token);
  });

  it("does not re-forward a parcel of an order that is no longer paid", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    await cancel(link.shipmentId, "Desistiu", link.token);
    await database.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    await expect(
      reforwardShipment(database, tenants.tenantA, link.shipmentId),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("tells the reseller when a supplier cancels, until the parcel is re-forwarded", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    const readerId = `reader-${randomUUID()}`;
    await database
      .insert(user)
      .values({ id: readerId, name: "Revendedor", email: `${readerId}@sellbridge.test` });

    await cancel(link.shipmentId, "Produto em falta no depósito", link.token);
    const notices = (await cancelledNotices(readerId)).filter(
      (event) => event.entityId === order.id,
    );
    expect(notices).toEqual([
      expect.objectContaining({
        kind: "shipment_cancelled",
        externalOrderId: order.externalOrderId,
        supplierName: expect.any(String),
        reason: "Produto em falta no depósito",
      }),
    ]);
    // Work to do, not news: clearing the list keeps it.
    await clearNotifications(database, { tenantId: tenants.tenantA, userId: readerId });
    expect((await cancelledNotices(readerId)).some((event) => event.entityId === order.id)).toBe(
      true,
    );

    await reforwardShipment(database, tenants.tenantA, link.shipmentId);
    expect((await cancelledNotices()).some((event) => event.entityId === order.id)).toBe(false);
    await database.delete(user).where(eq(user.id, readerId));
  });

  it("does not notify the reseller about a parcel they cancelled themselves", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    await cancel(link.shipmentId, "Cliente pediu para cancelar");
    expect((await cancelledNotices()).some((event) => event.entityId === order.id)).toBe(false);
  });

  it("records marketplace progress without duplicate history and filters the queue", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    const shipping = {
      status: "delivered",
      trackingStatus: "delivered" as const,
      buyerReturnDelivered: false,
      carrier: "Mercado Envios",
      trackingCode: "ML123",
    };
    await applyMarketplaceShipment(database, tenants.tenantA, order.id, shipping);
    await applyMarketplaceShipment(database, tenants.tenantA, order.id, shipping);
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.id);
    expect(detail.shipments[0]?.events).toHaveLength(2);
    expect(detail.order.status).toBe("delivered");
    const page = await listOperationalOrders(database, tenants.tenantA, {
      query: order.externalOrderId,
      stage: "delivered",
      page: 1,
    });
    expect(page.items.map((item) => item.id)).toEqual([order.id]);
    expect(
      (await listOperationalOrders(database, tenants.tenantB, { query: "", stage: "all", page: 1 }))
        .total,
    ).toBe(0);
  });
});
