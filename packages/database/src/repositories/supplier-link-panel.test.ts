import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, orderShipments, organization, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  findPanelOrderOfLink,
  forwardOrder,
  getFulfillmentDetail,
  getSupplierShipment,
  rotateSupplierLink,
  updateShipment,
} from "./fulfillment.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";

function sellerId(): string {
  const id = tenants.ids[0];
  if (id === undefined) throw new Error("perfil de teste não criado");
  return id;
}

function supplierProfileId(): string {
  const id = tenants.ids[1];
  if (id === undefined) throw new Error("perfil de teste não criado");
  return id;
}

async function forwardedOrder() {
  const externalOrderId = randomUUID();
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: sellerId(),
      storeConnectionId: storeId,
      externalOrderId,
      status: "paid",
      totalCents: 5000,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("pedido não criado");
  await database.insert(orderItems).values({
    tenantId: sellerId(),
    orderId: order.id,
    supplierProductId: supplier.productId,
    title: "Camiseta",
    quantity: 1,
    unitPriceCents: 5000,
    unitCostCents: 1000,
  });
  const [link] = await forwardOrder(database, sellerId(), {
    orderId: order.id,
    address: testAddress,
    notes: "",
  });
  if (link === undefined) throw new Error("envio não criado");
  return { ...link, orderId: order.id, externalOrderId };
}

async function setPanel(owner: string | null) {
  await database
    .update(suppliers)
    .set({ organizationId: owner })
    .where(eq(suppliers.id, supplier.supplierId));
}

const ACCEPT = {
  status: "accepted",
  note: "",
  carrier: "",
  trackingCode: "",
  trackingUrl: "",
} as const;

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  await database
    .update(organization)
    .set({ kind: "supplier" })
    .where(eq(organization.id, supplierProfileId()));
  supplier = await createTestSupplierProduct(database, {
    sku: "PANEL-LINK",
    title: "Camiseta",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  storeId = (await upsertStoreConnection(database, testStoreInput(sellerId(), randomUUID()))).id;
});

afterAll(async () => {
  await setPanel(null);
  await tenants.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

describe("an order link of a supplier without a panel", () => {
  it("still opens the parcel and points nowhere else", async () => {
    await setPanel(null);
    const link = await forwardedOrder();

    const shipment = await getSupplierShipment(database, link.token);

    expect(shipment.id).toBe(link.shipmentId);
    expect(await findPanelOrderOfLink(database, link.token)).toBeNull();
  });
});

describe("an order link of a supplier that now has a panel", () => {
  it("no longer opens the parcel and points to the order number instead", async () => {
    await setPanel(null);
    const link = await forwardedOrder();
    await setPanel(supplierProfileId());

    const reading = getSupplierShipment(database, link.token);

    await expect(reading).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await findPanelOrderOfLink(database, link.token)).toEqual({
      externalOrderId: link.externalOrderId,
    });
  });

  it("no longer moves the parcel, while the panel still does", async () => {
    await setPanel(null);
    const link = await forwardedOrder();
    await setPanel(supplierProfileId());

    const byLink = updateShipment(
      database,
      { shipmentId: link.shipmentId, ...ACCEPT },
      { token: link.token },
    );

    await expect(byLink).rejects.toMatchObject({ code: "NOT_FOUND" });
    const byPanel = await updateShipment(
      database,
      { shipmentId: link.shipmentId, ...ACCEPT },
      { supplierId: supplier.supplierId },
    );
    expect(byPanel.statusChanged).toBe(true);
  });

  it("gets no new link from the reseller", async () => {
    await setPanel(supplierProfileId());
    const link = await forwardedOrder();

    const rotation = rotateSupplierLink(database, sellerId(), link.shipmentId);

    await expect(rotation).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("points nowhere once the link expired", async () => {
    await setPanel(supplierProfileId());
    const link = await forwardedOrder();
    await database
      .update(orderShipments)
      .set({ supplierTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(orderShipments.id, link.shipmentId));

    expect(await findPanelOrderOfLink(database, link.token)).toBeNull();
  });

  it("tells the reseller the supplier works from its panel", async () => {
    await setPanel(supplierProfileId());
    const link = await forwardedOrder();

    const detail = await getFulfillmentDetail(database, sellerId(), link.orderId);

    expect(detail.shipments[0]?.supplierHasPanel).toBe(true);
  });
});
