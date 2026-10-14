import { randomUUID } from "node:crypto";
import { DELIVERY_CONFIRMED_BY, type MarketplaceTrackingStatus } from "@sellbridge/shared/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, orderShipments, shipmentEvents, user } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  applyMarketplaceShipment,
  forwardOrder,
  getFulfillmentDetail,
  getSupplierShipment,
  listOperationalOrders,
  MAX_SHIPMENT_EVENTS,
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
    address: testAddress,
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
  it("asks for carrier and code when a parcel ships, not for an occurrence after it", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    for (const status of ["accepted", "picking", "ready"] as const) {
      await advance(link.shipmentId, status, link.token);
    }
    const write = (status: "shipped", note: string, carrier: string) =>
      updateShipment(
        database,
        {
          shipmentId: link.shipmentId,
          status,
          note,
          carrier,
          trackingCode: carrier ? "AB1BR" : "",
          trackingUrl: "",
        },
        { token: link.token },
      );
    // A note does not stand in for the carrier when the parcel ships.
    await expect(write("shipped", "Saiu hoje", "")).rejects.toMatchObject({ code: "VALIDATION" });
    await write("shipped", "", "Correios");
    // Once shipped, an occurrence without them is recorded and keeps the carrier.
    await write("shipped", "Comprador ausente na primeira tentativa", "");
    const [stored] = await database
      .select({ carrier: orderShipments.carrier, trackingCode: orderShipments.trackingCode })
      .from(orderShipments)
      .where(eq(orderShipments.id, link.shipmentId));
    expect(stored).toEqual({ carrier: "Correios", trackingCode: "AB1BR" });
  });

  it("keeps the link through a cancellation and stops it once the parcel is delivered", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    for (const status of ["accepted", "picking", "ready", "shipped"] as const) {
      await advance(link.shipmentId, status, link.token);
    }
    expect((await getSupplierShipment(database, link.token)).status).toBe("shipped");
    await advance(link.shipmentId, "delivered");
    await expect(getSupplierShipment(database, link.token)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    // The supplier who cancels still sees its own cancellation.
    const other = await createOrder();
    const [otherLink] = await forward(other.id);
    if (!otherLink) throw new Error("No link");
    await cancel(otherLink.shipmentId, "Sem o produto no estoque", otherLink.token);
    expect((await getSupplierShipment(database, otherLink.token)).status).toBe("cancelled");
  });

  it("splits by supplier, snapshots only their items and stores only a token hash", async () => {
    const order = await createOrder("paid", true);
    const links = await forward(order.id);
    expect(links).toHaveLength(2);
    const link = links[0];
    if (!link) throw new Error("No link");
    const supplierView = await getSupplierShipment(database, link.token);
    expect(supplierView.items).toHaveLength(1);
    expect(supplierView.address).toEqual(testAddress);
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
      forwardOrder(database, tenants.tenantB, {
        orderId: order.id,
        address: testAddress,
        notes: "",
      }),
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
    // Delivery is confirmed by the reseller (or the marketplace), never through the supplier link.
    await advance(first.shipmentId, "delivered");
    expect((await getFulfillmentDetail(database, tenants.tenantA, order.id)).order.status).toBe(
      "shipped",
    );
    const second = links[1];
    if (!second) throw new Error("No second link");
    await advance(second.shipmentId, "delivered");
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

  it("stops showing the buyer's address on a supplier link once the parcel is over", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    expect((await getSupplierShipment(database, link.token)).address).toEqual(testAddress);
    await cancel(link.shipmentId, "Sem estoque", link.token);
    const view = await getSupplierShipment(database, link.token);
    expect(view.status).toBe("cancelled");
    expect(view.address).toBeNull();
  });

  it("caps the occurrences of one parcel, and still lets it move on", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    const history = async () =>
      (
        await database
          .select()
          .from(shipmentEvents)
          .where(eq(shipmentEvents.shipmentId, link.shipmentId))
      ).length;
    const filler = MAX_SHIPMENT_EVENTS - 1 - (await history());
    await database.insert(shipmentEvents).values(
      Array.from({ length: filler }, () => ({
        shipmentId: link.shipmentId,
        status: "forwarded" as const,
        actor: "Fornecedor",
        note: "Ocorrência",
      })),
    );
    const note = () =>
      updateShipment(
        database,
        {
          shipmentId: link.shipmentId,
          status: "forwarded",
          note: "Mais uma ocorrência",
          carrier: "",
          trackingCode: "",
          trackingUrl: "",
        },
        { token: link.token },
      );
    await note();
    expect(await history()).toBe(MAX_SHIPMENT_EVENTS);
    await expect(note()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await history()).toBe(MAX_SHIPMENT_EVENTS);
    await advance(link.shipmentId, "accepted", link.token);
    expect(await history()).toBe(MAX_SHIPMENT_EVENTS + 1);
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

  it("never lets the supplier link declare a delivery; the reseller and the marketplace can", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    for (const status of ["accepted", "picking", "ready", "shipped"] as const)
      await advance(link.shipmentId, status, link.token);
    await expect(advance(link.shipmentId, "delivered", link.token)).rejects.toMatchObject({
      code: "CONFLICT",
      message: DELIVERY_CONFIRMED_BY,
    });
    const [stored] = await database.select().from(orders).where(eq(orders.id, order.id));
    expect(stored).toMatchObject({ status: "shipped", deliveredAt: null });
    // Still free to log an occurrence on the way.
    await updateShipment(
      database,
      {
        shipmentId: link.shipmentId,
        status: "shipped",
        note: "Transportadora reagendou a entrega",
        carrier: "Correios",
        trackingCode: "AB123456789BR",
        trackingUrl: "",
      },
      { token: link.token },
    );

    await advance(link.shipmentId, "delivered");
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.id);
    expect(detail.order.status).toBe("delivered");
    expect(detail.shipments[0]?.events.at(-1)).toMatchObject({
      status: "delivered",
      actor: "Revendedor",
    });

    // The marketplace's own reading also counts, with its name on the step.
    const other = await createOrder();
    const [otherLink] = await forward(other.id);
    if (!otherLink) throw new Error("No link");
    await applyMarketplaceShipment(
      database,
      tenants.tenantA,
      other.id,
      remote("delivered", "delivered"),
    );
    const otherDetail = await getFulfillmentDetail(database, tenants.tenantA, other.id);
    expect(otherDetail.order.status).toBe("delivered");
    expect(otherDetail.shipments[0]?.events.at(-1)?.actor).toBe("Mercado Livre");
  });

  it("does not let a cancelled parcel hold the order back", async () => {
    const order = await createOrder("paid", true);
    const links = await forward(order.id);
    const [first, second] = links;
    if (!first || !second) throw new Error("No links");
    await cancel(second.shipmentId, "Sem estoque da calça", second.token);
    for (const status of ["accepted", "picking", "ready", "shipped"] as const)
      await advance(first.shipmentId, status, first.token);
    await advance(first.shipmentId, "delivered");
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

  it("filters operations by store and by sale date, inside the tenant only", async () => {
    const otherStore = (
      await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID()))
    ).id;
    const recent = await createOrder();
    const [old] = await database
      .insert(orders)
      .values({
        tenantId: tenants.tenantA,
        storeConnectionId: otherStore,
        externalOrderId: `OLD-${randomUUID()}`,
        status: "paid",
        totalCents: 5000,
        orderedAt: new Date("2026-01-10T15:00:00Z"),
      })
      .returning();
    if (!old) throw new Error("No order");
    const ids = async (
      filters: Partial<Parameters<typeof listOperationalOrders>[2]>,
      tenantId = tenants.tenantA,
    ) =>
      (
        await listOperationalOrders(database, tenantId, {
          query: "",
          stage: "all",
          page: 1,
          ...filters,
        })
      ).items.map((item) => item.id);

    expect(await ids({ store: otherStore })).toEqual([old.id]);
    const firstStore = await ids({ store: storeId });
    expect(firstStore).toContain(recent.id);
    expect(firstStore).not.toContain(old.id);
    // A day range, start inclusive and end exclusive.
    const january = await ids({
      orderedFrom: new Date("2026-01-10T03:00:00Z"),
      orderedTo: new Date("2026-01-11T03:00:00Z"),
    });
    expect(january).toEqual([old.id]);
    expect(await ids({ orderedFrom: new Date("2026-01-11T03:00:00Z") })).not.toContain(old.id);
    // Another tenant's store filters nothing in: the tenant still bounds the list.
    expect(await ids({ store: otherStore }, tenants.tenantB)).toEqual([]);
    // A page past the end (kept in the address after a forward) shows the last one instead.
    const pastTheEnd = await listOperationalOrders(database, tenants.tenantA, {
      query: "",
      stage: "all",
      page: 9999,
      store: otherStore,
    });
    expect(pastTheEnd).toMatchObject({ page: 1, totalPages: 1, total: 1 });
    expect(pastTheEnd.items.map((item) => item.id)).toEqual([old.id]);
    const nothing = await listOperationalOrders(database, tenants.tenantB, {
      query: "",
      stage: "all",
      page: 5,
    });
    expect(nothing).toMatchObject({ page: 1, totalPages: 0, items: [] });
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
