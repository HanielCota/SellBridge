import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, orderShipments, shipmentEvents } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { saveShipmentPaymentProviderFee } from "./asaas-payments.ts";
import { forwardOrder } from "./fulfillment.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  applyProviderPayment,
  savePaymentPreference,
  startShipmentPayment,
} from "./supplier-payments.ts";
import { listSupplierStatementPayments, listSupplierStatementRows } from "./supplier-statement.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let otherSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";

const HOUR_IN_MS = 60 * 60 * 1000;
const NOVEMBER = {
  from: new Date("2026-11-01T03:00:00Z"),
  to: new Date("2026-12-01T03:00:00Z"),
};

async function forwardedShipment(supplierProductId: string) {
  const externalOrderId = `ML-${randomUUID().slice(0, 8)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId,
      status: "paid",
      totalCents: 10_000,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId: tenants.tenantA,
    orderId: order.id,
    supplierProductId,
    title: "Camiseta",
    quantity: 2,
    unitPriceCents: 5000,
    unitCostCents: 3000,
  });
  await forwardOrder(database, tenants.tenantA, {
    orderId: order.id,
    address: testAddress,
    notes: "",
  });
  const [shipment] = await database
    .select({ id: orderShipments.id })
    .from(orderShipments)
    .where(eq(orderShipments.orderId, order.id));
  if (shipment === undefined) throw new Error("No shipment");
  return { shipmentId: shipment.id, externalOrderId };
}

/** A parcel of `owner` paid on `paidAt`, or left unpaid. */
async function parcel(owner: typeof supplier, paidAt: Date | null) {
  const { shipmentId, externalOrderId } = await forwardedShipment(owner.productId);
  const payment = await startShipmentPayment(database, {
    shipmentId,
    supplierId: owner.supplierId,
    provider: "asaas",
    amountCents: 6000,
    platformFeeCents: 240,
    platformFeeBasisPoints: 400,
    now: new Date(),
    reservedUntil: new Date(Date.now() + 60_000),
  });
  if (payment === null) throw new Error("Payment not started");
  const chargeId = `pay_${randomUUID()}`;
  await savePaymentPreference(database, {
    paymentId: payment.id,
    preferenceId: chargeId,
    checkoutUrl: "https://asaas.test/i/1",
    checkoutExpiresAt: new Date(Date.now() + 24 * HOUR_IN_MS),
    amountCents: 6000,
    platformFeeCents: 240,
  });
  if (paidAt !== null) {
    await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: chargeId,
      status: "approved",
      paymentMethod: "PIX",
      approvedAt: paidAt,
    });
  }
  return { shipmentId, paymentId: payment.id, externalOrderId };
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplier = await createTestSupplierProduct(database, {
    sku: `STM-${randomUUID().slice(0, 6)}`,
    title: "Camiseta",
    costCents: 3000,
    suggestedPriceCents: 5000,
  });
  otherSupplier = await createTestSupplierProduct(database, {
    sku: `STO-${randomUUID().slice(0, 6)}`,
    title: "Boné",
    costCents: 3000,
    suggestedPriceCents: 5000,
  });
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await otherSupplier.cleanup();
  await database.$client.end();
});

describe("supplier statement", () => {
  it("lists only the supplier's parcels paid in the period, newest first, by page", async () => {
    const older = await parcel(supplier, new Date("2026-11-05T12:00:00Z"));
    const newer = await parcel(supplier, new Date("2026-11-20T12:00:00Z"));
    await parcel(supplier, new Date("2026-10-31T12:00:00Z"));
    await parcel(supplier, null);
    await parcel(otherSupplier, new Date("2026-11-10T12:00:00Z"));
    const period = { supplierId: supplier.supplierId, ...NOVEMBER };

    const firstPage = await listSupplierStatementRows(database, {
      ...period,
      cursor: null,
      limit: 1,
    });
    const last = firstPage.at(-1);
    if (last === undefined) throw new Error("Empty first page");
    const secondPage = await listSupplierStatementRows(database, {
      ...period,
      cursor: { paidAt: last.paidAt, id: last.id },
      limit: 10,
    });

    expect(firstPage.map((row) => row.id)).toEqual([newer.paymentId]);
    expect(secondPage.map((row) => row.id)).toEqual([older.paymentId]);
    expect(firstPage[0]).toMatchObject({
      externalOrderId: newer.externalOrderId,
      amountCents: 6000,
      platformFeeCents: 240,
      providerFeeCents: null,
      paidAt: new Date("2026-11-20T12:00:00Z"),
      items: [expect.objectContaining({ title: "Camiseta", quantity: 2 })],
    });
  });

  it("reads the delivery and the Asaas fee kept for a parcel", async () => {
    const paid = await parcel(supplier, new Date("2026-11-21T12:00:00Z"));
    const deliveredAt = new Date("2026-11-22T15:00:00Z");
    await database.insert(shipmentEvents).values([
      {
        shipmentId: paid.shipmentId,
        status: "delivered",
        actor: "marketplace",
        createdAt: deliveredAt,
      },
      {
        shipmentId: paid.shipmentId,
        status: "delivered",
        actor: "reseller",
        createdAt: new Date("2026-11-23T15:00:00Z"),
      },
    ]);
    await saveShipmentPaymentProviderFee(database, { paymentId: paid.paymentId, feeCents: 79 });
    await saveShipmentPaymentProviderFee(database, { paymentId: paid.paymentId, feeCents: 500 });

    const payments = await listSupplierStatementPayments(database, {
      supplierId: supplier.supplierId,
      from: new Date("2026-11-21T03:00:00Z"),
      to: new Date("2026-11-22T03:00:00Z"),
    });

    expect(payments).toEqual([
      expect.objectContaining({ providerFeeCents: 79, deliveredAt, status: "approved" }),
    ]);
  });
});
