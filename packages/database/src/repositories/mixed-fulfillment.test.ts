import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { supplierProducts, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { autoForwardCandidate, forwardRecipients } from "./auto-forward.ts";
import {
  forwardOrder,
  getFulfillmentDetail,
  getSupplierShipment,
  rotateSupplierLink,
  updateShipment,
} from "./fulfillment.ts";
import { createListingWithTargets, markTargetPublished } from "./listings.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { ensureSellerCatalog } from "./seller-catalog.ts";
import { restartSellerShipment } from "./restart-seller-shipment.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let ownSource = "";
let publicSource = "";
let storeId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ownSource = (await ensureSellerCatalog(database, tenants.tenantA)).id;
  const [source] = await database
    .insert(suppliers)
    .values({
      name: "Mixed fulfillment supplier",
      niche: "Validation",
      state: "ZZ",
      city: "Validation",
      contactEmail: "fulfillment@example.com",
    })
    .returning();
  if (source === undefined) throw new Error("Missing external fulfillment source");
  publicSource = source.id;
  storeId = (
    await upsertStoreConnection(database, {
      ...testStoreInput(tenants.tenantA, randomUUID()),
      supplierId: publicSource,
    })
  ).id;
});
afterAll(async () => {
  await tenants.cleanup();
  await database.delete(suppliers).where(eq(suppliers.id, publicSource));
  await database.$client.end();
});

async function soldProduct(sourceId: string, title: string, stock: number, quantity: number) {
  const productId = randomUUID();
  await database.insert(supplierProducts).values({
    id: productId,
    supplierId: sourceId,
    sku: productId,
    title,
    description: "Complete fulfillment product description.",
    costCents: 1200,
    suggestedPriceCents: 3000,
    stock,
    active: true,
    reviewStatus: "approved",
  });
  const listing = await createListingWithTargets(
    database,
    tenants.tenantA,
    {
      supplierProductId: productId,
      title,
      description: "Complete fulfillment product description.",
      priceCents: 3000,
    },
    [storeId],
  );
  const targetId = listing.targetIds[0];
  if (targetId === undefined) throw new Error("Missing fulfillment target");
  const externalListingId = randomUUID();
  await markTargetPublished(database, targetId, {
    externalId: externalListingId,
    externalUrl: null,
  });
  return { productId, item: { externalListingId, title, quantity, unitPriceCents: 3000 } };
}

async function paidOrder(mixed = true) {
  const own = await soldProduct(ownSource, "Seller fulfillment item", 7, 1);
  const external = mixed
    ? await soldProduct(publicSource, "Supplier fulfillment item", 10, 2)
    : null;
  const result = await upsertMarketplaceOrder(database, tenants.tenantA, storeId, {
    externalOrderId: randomUUID(),
    status: "paid",
    totalCents: mixed ? 9000 : 3000,
    marketplaceFeeCents: 500,
    buyerName: "Mixed fulfillment customer",
    orderedAt: new Date(),
    items: external === null ? [own.item] : [own.item, external.item],
  });
  return {
    orderId: result.orderId,
    ownProductId: own.productId,
    supplierProductId: external?.productId,
  };
}

function prepare(orderId: string) {
  return forwardOrder(database, tenants.tenantA, {
    orderId,
    address: testAddress,
    notes: "Handle each party's items separately.",
  });
}

async function shelf(productId: string | undefined) {
  const [row] = await database
    .select({ stock: supplierProducts.stock, reserved: supplierProducts.reservedStock })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId ?? ""));
  return row;
}

async function ship(shipment: { id: string; status: FulfillmentStatus }, token?: string) {
  const stages: FulfillmentStatus[] =
    shipment.status === "forwarded"
      ? ["accepted", "picking", "ready", "shipped"]
      : ["picking", "ready", "shipped"];
  for (const status of stages) {
    await updateShipment(
      database,
      {
        shipmentId: shipment.id,
        status,
        carrier: "Postal service",
        trackingCode: `TRACK-${shipment.id}`,
        trackingUrl: "",
        note: "",
      },
      token === undefined ? { tenantId: tenants.tenantA } : { token },
    );
  }
}

describe("seller and supplier fulfillment", () => {
  it("does not let an own-product source without email block automatic supplier forwarding", async () => {
    const order = await paidOrder();
    expect((await autoForwardCandidate(database, order.orderId))?.blocker).toBeNull();
  });

  it("creates separate parcels and exposes supplier links and email recipients only for external items", async () => {
    const order = await paidOrder();
    const links = await prepare(order.orderId);
    expect(links).toHaveLength(1);
    expect(links[0]?.supplierId).toBe(publicSource);
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.orderId);
    const own = detail.shipments.find((shipment) => shipment.supplierId === ownSource);
    expect(own).toMatchObject({
      catalogKind: "seller",
      status: "accepted",
      supplierTokenExpiresAt: null,
      acceptBy: null,
      dispatchBy: null,
    });
    expect(own?.items.map((item) => item.title)).toEqual(["Seller fulfillment item"]);
    const token = links[0]?.token;
    if (token === undefined) throw new Error("Missing external supplier token");
    expect((await getSupplierShipment(database, token)).items.map((item) => item.title)).toEqual([
      "Supplier fulfillment item",
    ]);
    const recipients = await forwardRecipients(
      database,
      tenants.tenantA,
      detail.shipments.map((shipment) => shipment.id),
    );
    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.contactEmail).toBe("fulfillment@example.com");
  });

  it("consumes each party's inventory when its own parcel ships", async () => {
    const order = await paidOrder();
    const links = await prepare(order.orderId);
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.orderId);
    const own = detail.shipments.find((shipment) => shipment.supplierId === ownSource);
    const external = detail.shipments.find((shipment) => shipment.supplierId === publicSource);
    if (own === undefined || external === undefined) throw new Error("Missing mixed parcels");
    await ship(own);
    expect(await shelf(order.ownProductId)).toEqual({ stock: 6, reserved: 0 });
    expect(await shelf(order.supplierProductId)).toEqual({ stock: 10, reserved: 2 });
    expect(
      (await getFulfillmentDetail(database, tenants.tenantA, order.orderId)).order.status,
    ).toBe("paid");
    const token = links.find((link) => link.supplierId === publicSource)?.token;
    if (token === undefined) throw new Error("Missing external supplier token");
    await ship(external, token);
    expect(await shelf(order.supplierProductId)).toEqual({ stock: 8, reserved: 0 });
    expect(
      (await getFulfillmentDetail(database, tenants.tenantA, order.orderId)).order.status,
    ).toBe("shipped");
  });

  it("prepares an own-only order without generating a supplier link", async () => {
    const order = await paidOrder(false);
    expect(await prepare(order.orderId)).toEqual([]);
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.orderId);
    expect(detail.shipments).toHaveLength(1);
    expect(detail.shipments[0]).toMatchObject({
      catalogKind: "seller",
      status: "accepted",
      supplierTokenExpiresAt: null,
    });
  });

  it("refuses supplier-link issuance, supplier-role writes and other tenants on an own parcel", async () => {
    const order = await paidOrder(false);
    await prepare(order.orderId);
    const own = (await getFulfillmentDetail(database, tenants.tenantA, order.orderId)).shipments[0];
    if (own === undefined) throw new Error("Missing own parcel");
    await expect(rotateSupplierLink(database, tenants.tenantA, own.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const update = {
      shipmentId: own.id,
      status: "picking" as const,
      carrier: "",
      trackingCode: "",
      trackingUrl: "",
      note: "",
    };
    await expect(updateShipment(database, update, { supplierId: ownSource })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    await expect(
      updateShipment(database, update, { tenantId: tenants.tenantB }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await updateShipment(database, update, { tenantId: tenants.tenantA });
  });

  it("keeps a mixed order open until stopped own preparation is explicitly restarted and shipped", async () => {
    const order = await paidOrder();
    const links = await prepare(order.orderId);
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.orderId);
    const own = detail.shipments.find((shipment) => shipment.supplierId === ownSource);
    const external = detail.shipments.find((shipment) => shipment.supplierId === publicSource);
    const token = links.find((link) => link.supplierId === publicSource)?.token;
    if (own === undefined || external === undefined || token === undefined)
      throw new Error("Missing mixed parcels");
    await updateShipment(
      database,
      {
        shipmentId: own.id,
        status: "cancelled",
        note: "Seller needs to restart preparation.",
        carrier: "",
        trackingCode: "",
        trackingUrl: "",
      },
      { tenantId: tenants.tenantA },
    );
    await ship(external, token);
    expect(
      (await getFulfillmentDetail(database, tenants.tenantA, order.orderId)).order.status,
    ).toBe("paid");
    expect(await shelf(order.ownProductId)).toEqual({ stock: 7, reserved: 1 });
    await expect(restartSellerShipment(database, tenants.tenantB, own.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      restartSellerShipment(database, tenants.tenantA, external.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await restartSellerShipment(database, tenants.tenantA, own.id);
    const restarted = (
      await getFulfillmentDetail(database, tenants.tenantA, order.orderId)
    ).shipments.find((shipment) => shipment.id === own.id);
    expect(restarted).toMatchObject({ status: "accepted", supplierTokenExpiresAt: null });
    if (restarted === undefined) throw new Error("Missing restarted own parcel");
    await ship(restarted);
    expect(await shelf(order.ownProductId)).toEqual({ stock: 6, reserved: 0 });
    expect(
      (await getFulfillmentDetail(database, tenants.tenantA, order.orderId)).order.status,
    ).toBe("shipped");
    await expect(restartSellerShipment(database, tenants.tenantA, own.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
