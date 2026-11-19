import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import {
  orderShipments,
  organization,
  orders,
  returnClaims,
  shipmentPayments,
  suppliers,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenants,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { findDeletionBlockers } from "./account-deletion-blockers.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const NOW = new Date("2026-11-19T15:00:00Z");
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const tenantIds: string[] = [];
const supplierIds: string[] = [];

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_IN_MILLISECONDS);
}

/** A reseller with a store, and a supplier run from its own supplier workspace. */
async function createSale() {
  const tenants = await createTestTenants(database, 2);
  const [sellerTenantId = "", supplierTenantId = ""] = tenants.ids;
  tenantIds.push(sellerTenantId, supplierTenantId);
  const store = await upsertStoreConnection(
    database,
    testStoreInput(sellerTenantId, `blockers-${sellerTenantId}`),
  );
  const [supplier] = await database
    .insert(suppliers)
    .values({
      name: "Fornecedor com pendência",
      niche: "Teste",
      state: "ZZ",
      city: "X",
      organizationId: supplierTenantId,
    })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("fornecedor não criado");
  }
  supplierIds.push(supplier.id);
  return { sellerTenantId, supplierTenantId, storeId: store.id, supplierId: supplier.id };
}

type Sale = Awaited<ReturnType<typeof createSale>>;

async function addOrder(
  sale: Sale,
  input: { status: "pending" | "paid" | "shipped" | "delivered" | "cancelled"; paidAt: Date },
): Promise<string> {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: sale.sellerTenantId,
      storeConnectionId: sale.storeId,
      externalOrderId: `BLK-${randomUUID()}`,
      status: input.status,
      totalCents: 10_000,
      orderedAt: input.paidAt,
      paidAt: input.status === "pending" ? null : input.paidAt,
    })
    .returning({ id: orders.id });
  if (order === undefined) {
    throw new Error("pedido não criado");
  }
  return order.id;
}

async function addShipment(
  sale: Sale,
  input: { status: FulfillmentStatus; updatedAt: Date },
): Promise<{ orderId: string; shipmentId: string }> {
  const orderId = await addOrder(sale, { status: "delivered", paidAt: daysAgo(90) });
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: sale.sellerTenantId,
      orderId,
      supplierId: sale.supplierId,
      address: testAddress,
      items: [],
      status: input.status,
      updatedAt: input.updatedAt,
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) {
    throw new Error("envio não criado");
  }
  return { orderId, shipmentId: shipment.id };
}

async function addPayment(
  sale: Sale,
  payment: Partial<typeof shipmentPayments.$inferInsert>,
): Promise<void> {
  const { shipmentId } = await addShipment(sale, { status: "delivered", updatedAt: daysAgo(90) });
  await database.insert(shipmentPayments).values({
    shipmentId,
    supplierId: sale.supplierId,
    provider: "asaas",
    amountCents: 34_000,
    platformFeeCents: 4_000,
    platformFeeBasisPoints: 1_200,
    ...payment,
  });
}

async function blockersOf(tenantId: string) {
  return await findDeletionBlockers(database, { tenantIds: [tenantId], now: NOW });
}

afterAll(async () => {
  await database.delete(orders).where(inArray(orders.tenantId, tenantIds));
  await database.delete(suppliers).where(inArray(suppliers.id, supplierIds));
  await database.delete(organization).where(inArray(organization.id, tenantIds));
  await database.$client.end();
});

describe("what keeps a seller account from being deleted", () => {
  it("finds nothing when every order is delivered, cancelled or still unpaid", async () => {
    const sale = await createSale();
    await addOrder(sale, { status: "delivered", paidAt: daysAgo(3) });
    await addOrder(sale, { status: "cancelled", paidAt: daysAgo(3) });
    await addOrder(sale, { status: "pending", paidAt: daysAgo(3) });

    const blockers = await blockersOf(sale.sellerTenantId);

    expect(blockers.ordersToShip).toBe(0);
    expect(blockers.ordersOnTheWay).toBe(0);
    expect(blockers.sellerMoneyHeld.count).toBe(0);
  });

  it("counts paid orders to ship and shipped orders on the way", async () => {
    const sale = await createSale();
    await addOrder(sale, { status: "paid", paidAt: daysAgo(1) });
    await addOrder(sale, { status: "paid", paidAt: daysAgo(2) });
    await addOrder(sale, { status: "shipped", paidAt: daysAgo(5) });

    const blockers = await blockersOf(sale.sellerTenantId);

    expect(blockers.ordersToShip).toBe(2);
    expect(blockers.ordersOnTheWay).toBe(1);
  });

  it("keeps counting an order paid 60 days ago", async () => {
    const sale = await createSale();
    await addOrder(sale, { status: "paid", paidAt: daysAgo(60) });

    expect((await blockersOf(sale.sellerTenantId)).ordersToShip).toBe(1);
  });

  it("leaves out an order that has not moved for 61 days", async () => {
    const sale = await createSale();
    await addOrder(sale, { status: "paid", paidAt: daysAgo(61) });

    expect((await blockersOf(sale.sellerTenantId)).ordersToShip).toBe(0);
  });

  it("counts money paid to the supplier and still held by Asaas, with its release date", async () => {
    const sale = await createSale();
    await addPayment(sale, {
      status: "approved",
      paidAt: daysAgo(200),
      escrowStatus: "active",
      escrowExpiresAt: new Date("2026-11-25T12:00:00Z"),
    });

    const blockers = await blockersOf(sale.sellerTenantId);

    expect(blockers.sellerMoneyHeld).toEqual({
      count: 1,
      amountCents: 34_000,
      lastReleaseAt: new Date("2026-11-25T12:00:00Z"),
      awaitingDelivery: 0,
    });
  });

  it("counts a refund asked and not finished yet, however old", async () => {
    const sale = await createSale();
    await addPayment(sale, {
      provider: "mercado_pago",
      status: "approved",
      paidAt: daysAgo(200),
      refundRequestedAt: daysAgo(150),
    });

    expect((await blockersOf(sale.sellerTenantId)).sellerMoneyHeld.count).toBe(1);
  });

  it("leaves out money already released or refunded", async () => {
    const sale = await createSale();
    await addPayment(sale, { status: "approved", releasedAt: daysAgo(2) });
    await addPayment(sale, { status: "refunded", refundRequestedAt: daysAgo(2) });

    expect((await blockersOf(sale.sellerTenantId)).sellerMoneyHeld.count).toBe(0);
  });

  it("counts a payment in progress, but not an abandoned checkout", async () => {
    const sale = await createSale();
    await addPayment(sale, { status: "in_process" });
    await addPayment(sale, {
      status: "pending",
      checkoutExpiresAt: new Date(NOW.getTime() + 60_000),
    });
    await addPayment(sale, { status: "pending", checkoutExpiresAt: daysAgo(1) });

    expect((await blockersOf(sale.sellerTenantId)).paymentsInProgress).toBe(2);
  });

  it("counts a return still in review, however old", async () => {
    const sale = await createSale();
    const { orderId, shipmentId } = await addShipment(sale, {
      status: "returned",
      updatedAt: daysAgo(200),
    });
    await database.insert(returnClaims).values({
      shipmentId,
      orderId,
      sellerTenantId: sale.sellerTenantId,
      supplierId: sale.supplierId,
      supplierCostCents: 5_000,
      createdAt: daysAgo(200),
    });

    expect((await blockersOf(sale.sellerTenantId)).returnsInReview).toBe(1);
    expect((await blockersOf(sale.supplierTenantId)).returnsInReview).toBe(1);
  });
});

describe("what keeps a supplier account from being deleted", () => {
  it("counts parcels to send and parcels on the way, not the delivered ones", async () => {
    const sale = await createSale();
    await addShipment(sale, { status: "forwarded", updatedAt: daysAgo(1) });
    await addShipment(sale, { status: "ready", updatedAt: daysAgo(1) });
    await addShipment(sale, { status: "shipped", updatedAt: daysAgo(1) });
    await addShipment(sale, { status: "delivered", updatedAt: daysAgo(1) });

    const blockers = await blockersOf(sale.supplierTenantId);

    expect(blockers.parcelsToShip).toBe(2);
    expect(blockers.parcelsOnTheWay).toBe(1);
  });

  it("keeps counting a parcel that moved 60 days ago, not one stopped for 61", async () => {
    const sale = await createSale();
    await addShipment(sale, { status: "accepted", updatedAt: daysAgo(60) });
    await addShipment(sale, { status: "accepted", updatedAt: daysAgo(61) });

    expect((await blockersOf(sale.supplierTenantId)).parcelsToShip).toBe(1);
  });

  it("counts its share of money still held, awaiting the delivery when there is no date", async () => {
    const sale = await createSale();
    await addPayment(sale, { status: "approved", paidAt: daysAgo(100) });

    const blockers = await blockersOf(sale.supplierTenantId);

    expect(blockers.supplierMoneyToReceive).toEqual({
      count: 1,
      amountCents: 30_000,
      lastReleaseAt: null,
      awaitingDelivery: 1,
    });
    expect(blockers.sellerMoneyHeld.count).toBe(0);
  });

  it("does not count Mercado Pago money, which is already in the supplier's account", async () => {
    const sale = await createSale();
    await addPayment(sale, { provider: "mercado_pago", status: "approved", paidAt: daysAgo(2) });

    expect((await blockersOf(sale.supplierTenantId)).supplierMoneyToReceive.count).toBe(0);
  });
});
