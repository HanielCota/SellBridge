import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  orderItems,
  orders,
  orderShipments,
  platformSettings,
  returnClaims,
  shipmentEvents,
  shipmentPayments,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  countConfirmedDeliveries,
  findSupplierPaymentChoice,
  getNewSupplierRule,
  saveAsaasAccount,
  saveShipmentPaymentEscrow,
  saveSupplierPaymentChoice,
  setNewSupplierRule,
  setPaymentAccountReview,
} from "./asaas-payments.ts";
import { forwardOrder } from "./fulfillment.ts";
import {
  claimEscrowRelease,
  listHeldPayments,
  markEscrowReleased,
  recordTeamDecision,
} from "./held-payments.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  applyProviderPayment,
  findSupplierPaymentAccount,
  listShipmentPaymentRefundCandidates,
  listShipmentPaymentsToReconcile,
  savePaymentPreference,
  startShipmentPayment,
} from "./supplier-payments.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let storeId = "";
let ownerId = "";
let previousRule: { protection: boolean; deliveries: number } | null = null;

const HOUR_IN_MS = 60 * 60 * 1000;

async function forwardedShipmentId(): Promise<string> {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: randomUUID(),
      status: "paid",
      totalCents: 10_000,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId: tenants.tenantA,
    orderId: order.id,
    supplierProductId: supplier.productId,
    title: "Camiseta",
    quantity: 1,
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
  return shipment.id;
}

/** A parcel paid through a charge of the given provider, its money held when `escrow` is set. */
async function paidParcel(provider: "asaas" | "mercado_pago", escrow = true) {
  const shipmentId = await forwardedShipmentId();
  const payment = await startShipmentPayment(database, {
    shipmentId,
    supplierId: supplier.supplierId,
    provider,
    amountCents: 3000,
    platformFeeCents: 30,
    platformFeeBasisPoints: 100,
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
    amountCents: 3000,
    platformFeeCents: 30,
  });
  await applyProviderPayment(database, {
    paymentId: payment.id,
    providerPaymentId: chargeId,
    status: "approved",
    paymentMethod: "PIX",
    approvedAt: new Date(),
  });
  if (escrow) {
    await saveShipmentPaymentEscrow(database, {
      paymentId: payment.id,
      escrowId: `esc_${randomUUID()}`,
      escrowStatus: "active",
      escrowExpiresAt: new Date(Date.now() + 30 * 24 * HOUR_IN_MS),
    });
  }
  return { shipmentId, paymentId: payment.id };
}

async function heldIds(): Promise<string[]> {
  const held = await listHeldPayments(database, { limit: 1000 });
  return held.map((row) => row.payment.id);
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 1);
  ownerId = users.ids[0] ?? "";
  supplier = await createTestSupplierProduct(database, {
    sku: `ASA-${randomUUID().slice(0, 6)}`,
    title: "Camiseta",
    costCents: 3000,
    suggestedPriceCents: 5000,
  });
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
  const [settings] = await database.select().from(platformSettings);
  previousRule =
    settings === undefined
      ? null
      : { protection: settings.newSupplierProtection, deliveries: settings.newSupplierDeliveries };
});

afterAll(async () => {
  if (previousRule !== null) {
    await database.update(platformSettings).set({
      newSupplierProtection: previousRule.protection,
      newSupplierDeliveries: previousRule.deliveries,
    });
  }
  await tenants.cleanup();
  await supplier.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("Asaas account", () => {
  it("saves the wallet and waits for Asaas's review, replacing an older account", async () => {
    await saveAsaasAccount(database, {
      supplierId: supplier.supplierId,
      userId: ownerId,
      providerAccountId: "acc_old",
      walletId: "wallet_old",
      apiKeyEnc: "old-key",
    });

    const saved = await saveAsaasAccount(database, {
      supplierId: supplier.supplierId,
      userId: ownerId,
      providerAccountId: "acc_new",
      walletId: "wallet_new",
      apiKeyEnc: "new-key",
    });

    expect(saved).toMatchObject({
      provider: "asaas",
      providerAccountId: "acc_new",
      walletId: "wallet_new",
      accessTokenEnc: "new-key",
      reviewStatus: "pending",
      status: "connected",
    });
  });

  it("records Asaas's approval of the documents", async () => {
    const account = await saveAsaasAccount(database, {
      supplierId: supplier.supplierId,
      userId: ownerId,
      providerAccountId: "acc_review",
      walletId: "wallet_review",
      apiKeyEnc: "key",
    });

    await setPaymentAccountReview(database, { accountId: account.id, reviewStatus: "approved" });

    const read = await findSupplierPaymentAccount(database, {
      supplierId: supplier.supplierId,
      provider: "asaas",
    });
    expect(read?.reviewStatus).toBe("approved");
  });
});

describe("supplier payment choice", () => {
  it("is null until chosen, then keeps the latest choice", async () => {
    const before = await findSupplierPaymentChoice(database, supplier.supplierId);
    await saveSupplierPaymentChoice(database, {
      supplierId: supplier.supplierId,
      provider: "asaas",
      userId: ownerId,
    });
    await saveSupplierPaymentChoice(database, {
      supplierId: supplier.supplierId,
      provider: "mercado_pago",
      userId: ownerId,
    });

    const after = await findSupplierPaymentChoice(database, supplier.supplierId);

    expect(before).toBeNull();
    expect(after).toBe("mercado_pago");
  });
});

describe("new supplier rule", () => {
  it("saves whether it is on and how many deliveries it asks for", async () => {
    await setNewSupplierRule(database, { enabled: true, deliveries: 7, userId: ownerId });

    const rule = await getNewSupplierRule(database);

    expect(rule).toEqual({ enabled: true, deliveries: 7 });
  });

  it("refuses zero deliveries", async () => {
    const saving = setNewSupplierRule(database, { enabled: true, deliveries: 0, userId: ownerId });

    await expect(saving).rejects.toThrow("Failed query");
  });
});

describe("countConfirmedDeliveries", () => {
  it("counts only the supplier's delivered parcels", async () => {
    const before = await countConfirmedDeliveries(database, supplier.supplierId);
    const delivered = await forwardedShipmentId();
    await forwardedShipmentId();
    await database
      .update(orderShipments)
      .set({ status: "delivered" })
      .where(eq(orderShipments.id, delivered));

    const after = await countConfirmedDeliveries(database, supplier.supplierId);

    expect(after).toBe(before + 1);
  });
});

describe("listHeldPayments", () => {
  it("lists a held Asaas payment with its first delivery and an open return claim", async () => {
    const { shipmentId, paymentId } = await paidParcel("asaas");
    const firstDelivery = new Date(Date.now() - 10 * 24 * HOUR_IN_MS);
    await database
      .update(orderShipments)
      .set({ status: "delivered" })
      .where(eq(orderShipments.id, shipmentId));
    await database.insert(shipmentEvents).values([
      { shipmentId, status: "delivered", actor: "Mercado Livre", createdAt: firstDelivery },
      { shipmentId, status: "delivered", actor: "Revendedor", createdAt: new Date() },
    ]);
    const [shipment] = await database
      .select({ orderId: orderShipments.orderId })
      .from(orderShipments)
      .where(eq(orderShipments.id, shipmentId));
    await database.insert(returnClaims).values({
      shipmentId,
      orderId: shipment?.orderId ?? "",
      sellerTenantId: tenants.tenantA,
      supplierId: supplier.supplierId,
      supplierCostCents: 3000,
    });

    const held = await listHeldPayments(database, { limit: 1000 });

    const row = held.find((candidate) => candidate.payment.id === paymentId);
    expect(row).toMatchObject({
      shipmentStatus: "delivered",
      deliveredAt: firstDelivery,
      hasOpenReturnClaim: true,
    });
  });

  it("lists a card payment Asaas does not hold yet", async () => {
    const { paymentId } = await paidParcel("asaas", false);

    expect(await heldIds()).toContain(paymentId);
  });

  it("leaves out Mercado Pago payments and released money", async () => {
    const mercadoPago = await paidParcel("mercado_pago");
    const released = await paidParcel("asaas");
    await markEscrowReleased(database, { paymentId: released.paymentId, now: new Date() });

    const ids = await heldIds();

    expect(ids).not.toContain(mercadoPago.paymentId);
    expect(ids).not.toContain(released.paymentId);
  });
});

describe("claimEscrowRelease", () => {
  it("claims a release once", async () => {
    const { paymentId } = await paidParcel("asaas");
    const now = new Date();

    const first = await claimEscrowRelease(database, {
      paymentId,
      now,
      retryAfterInMs: HOUR_IN_MS,
    });
    const second = await claimEscrowRelease(database, {
      paymentId,
      now,
      retryAfterInMs: HOUR_IN_MS,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("claims again a release that never reached Asaas after the retry delay", async () => {
    const { paymentId } = await paidParcel("asaas");
    const now = new Date();
    await claimEscrowRelease(database, { paymentId, now, retryAfterInMs: HOUR_IN_MS });

    const later = new Date(now.getTime() + HOUR_IN_MS + 1);
    const retried = await claimEscrowRelease(database, {
      paymentId,
      now: later,
      retryAfterInMs: HOUR_IN_MS,
    });

    expect(retried).toBe(true);
  });

  it("does not claim money already being refunded", async () => {
    const { paymentId } = await paidParcel("asaas");
    await database
      .update(shipmentPayments)
      .set({ refundRequestedAt: new Date(), refundReason: "cancelled" })
      .where(eq(shipmentPayments.id, paymentId));

    const claimed = await claimEscrowRelease(database, {
      paymentId,
      now: new Date(),
      retryAfterInMs: HOUR_IN_MS,
    });

    expect(claimed).toBe(false);
  });
});

describe("recordTeamDecision", () => {
  it("records the team's choice once", async () => {
    const { paymentId } = await paidParcel("asaas");
    const now = new Date();

    const first = await recordTeamDecision(database, {
      paymentId,
      decision: "refund",
      userId: ownerId,
      now,
    });
    const second = await recordTeamDecision(database, {
      paymentId,
      decision: "release",
      userId: ownerId,
      now,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("refuses a decision once the money was released", async () => {
    const { paymentId } = await paidParcel("asaas");
    await markEscrowReleased(database, { paymentId, now: new Date() });

    const decided = await recordTeamDecision(database, {
      paymentId,
      decision: "refund",
      userId: ownerId,
      now: new Date(),
    });

    expect(decided).toBe(false);
  });
});

describe("Mercado Pago jobs and Asaas payments", () => {
  it("never hands an Asaas payment to the Mercado Pago reconcile or refund jobs", async () => {
    const { paymentId, shipmentId } = await paidParcel("asaas");
    await database
      .update(orderShipments)
      .set({ status: "cancelled" })
      .where(eq(orderShipments.id, shipmentId));

    const reconcile = await listShipmentPaymentsToReconcile(database, {
      provider: "mercado_pago",
      now: new Date(),
      recheckForInMs: 3 * 24 * HOUR_IN_MS,
      limit: 1000,
    });
    const refunds = await listShipmentPaymentRefundCandidates(database, {
      provider: "mercado_pago",
      limit: 1000,
    });

    expect(reconcile.map((row) => row.id)).not.toContain(paymentId);
    expect(refunds.map((row) => row.payment.id)).not.toContain(paymentId);
  });
});
