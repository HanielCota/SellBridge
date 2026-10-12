import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, orderShipments } from "../schema/index.ts";
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
  revokeSupplierLink,
  rotateSupplierLink,
  updateShipment,
} from "./fulfillment.ts";
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
  it("records marketplace progress without duplicate history and filters the queue", async () => {
    const order = await createOrder();
    const [link] = await forward(order.id);
    if (!link) throw new Error("No link");
    const shipping = { status: "delivered", carrier: "Mercado Envios", trackingCode: "ML123" };
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
