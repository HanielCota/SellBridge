import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orderItems, orders, orderShipments, platformSettings } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { forwardOrder } from "./fulfillment.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  applyProviderPayment,
  consumePaymentOAuthState,
  createPaymentOAuthState,
  disconnectSupplierPaymentAccount,
  openCheckoutUrl,
  findPayableShipment,
  findPaymentAccountsByProviderAccount,
  getPaymentFeeSetting,
  listSuppliersReceivingPayments,
  setPaymentFeeSetting,
  startShipmentPayment,
  upsertSupplierPaymentAccount,
} from "./supplier-payments.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let storeId = "";
let previousFee: number | null = null;

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
    quantity: 2,
    unitPriceCents: 5000,
    unitCostCents: 2995,
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

async function startPayment(shipmentId: string) {
  const payment = await startShipmentPayment(database, {
    shipmentId,
    supplierId: supplier.supplierId,
    provider: "mercado_pago",
    amountCents: 5990,
    platformFeeCents: 300,
    platformFeeBasisPoints: 500,
  });
  if (payment === null) throw new Error("Payment not started");
  return payment;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 2);
  supplier = await createTestSupplierProduct(database, {
    sku: `PAY-${randomUUID().slice(0, 6)}`,
    title: "Camiseta",
    costCents: 2995,
    suggestedPriceCents: 5000,
  });
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
  previousFee = (await getPaymentFeeSetting(database)).basisPoints;
});

afterAll(async () => {
  if (previousFee === null) {
    await database.delete(platformSettings);
  }
  if (previousFee !== null) {
    await database.update(platformSettings).set({ paymentFeeBasisPoints: previousFee });
  }
  await tenants.cleanup();
  await supplier.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("payment OAuth state", () => {
  it("returns the supplier once, to the user who started it", async () => {
    const state = randomUUID();
    const [owner] = users.ids;
    if (owner === undefined) throw new Error("No user");
    await createPaymentOAuthState(database, {
      state,
      supplierId: supplier.supplierId,
      userId: owner,
      provider: "mercado_pago",
      ttlMilliseconds: 60_000,
    });

    const first = await consumePaymentOAuthState(database, {
      state,
      userId: owner,
      provider: "mercado_pago",
    });
    const second = await consumePaymentOAuthState(database, {
      state,
      userId: owner,
      provider: "mercado_pago",
    });

    expect(first).toEqual({ supplierId: supplier.supplierId });
    expect(second).toBeNull();
  });

  it("refuses the state to another user", async () => {
    const state = randomUUID();
    const [owner, other] = users.ids;
    if (owner === undefined || other === undefined) throw new Error("No users");
    await createPaymentOAuthState(database, {
      state,
      supplierId: supplier.supplierId,
      userId: owner,
      provider: "mercado_pago",
      ttlMilliseconds: 60_000,
    });

    const result = await consumePaymentOAuthState(database, {
      state,
      userId: other,
      provider: "mercado_pago",
    });

    expect(result).toBeNull();
  });
});

describe("supplier payment account", () => {
  it("receives payments while linked and stops once unlinked", async () => {
    await upsertSupplierPaymentAccount(database, {
      supplierId: supplier.supplierId,
      provider: "mercado_pago",
      userId: null,
      tokens: { accessTokenEnc: "a", refreshTokenEnc: "r", expiresAt: new Date() },
      providerAccountId: "123456",
    });
    const linked = await listSuppliersReceivingPayments(database, {
      supplierIds: [supplier.supplierId],
      provider: "mercado_pago",
    });

    await disconnectSupplierPaymentAccount(database, {
      supplierId: supplier.supplierId,
      provider: "mercado_pago",
    });
    const unlinked = await listSuppliersReceivingPayments(database, {
      supplierIds: [supplier.supplierId],
      provider: "mercado_pago",
    });
    const accounts = await findPaymentAccountsByProviderAccount(database, {
      provider: "mercado_pago",
      providerAccountId: "123456",
    });

    expect(linked.has(supplier.supplierId)).toBe(true);
    expect(unlinked.has(supplier.supplierId)).toBe(false);
    expect(
      accounts.find((account) => account.supplierId === supplier.supplierId)?.accessTokenEnc,
    ).toBeNull();
  });
});

describe("payable shipment", () => {
  it("adds each item's cost times its quantity", async () => {
    const shipmentId = await forwardedShipmentId();

    const payable = await findPayableShipment(database, { tenantId: tenants.tenantA, shipmentId });

    expect(payable?.amountCents).toBe(5990);
    expect(payable?.payment).toBeNull();
  });

  it("is not found for another tenant", async () => {
    const shipmentId = await forwardedShipmentId();

    const payable = await findPayableShipment(database, { tenantId: tenants.tenantB, shipmentId });

    expect(payable).toBeNull();
  });
});

describe("shipment payment", () => {
  it("keeps the first approval when the notice repeats", async () => {
    const shipmentId = await forwardedShipmentId();
    const payment = await startPayment(shipmentId);
    const approvedAt = new Date("2026-11-10T17:32:00.000Z");

    await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-1",
      status: "approved",
      paymentMethod: "pix",
      approvedAt,
    });
    const repeated = await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-1",
      status: "approved",
      paymentMethod: "pix",
      approvedAt: new Date("2026-11-11T09:00:00.000Z"),
    });

    expect(repeated?.payment.status).toBe("approved");
    expect(repeated?.payment.paidAt?.toISOString()).toBe(approvedAt.toISOString());
  });

  it("does not turn a paid parcel back to pending on a late notice", async () => {
    const shipmentId = await forwardedShipmentId();
    const payment = await startPayment(shipmentId);
    await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-2",
      status: "approved",
      paymentMethod: "pix",
      approvedAt: new Date(),
    });

    const late = await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-2",
      status: "pending",
      paymentMethod: "pix",
      approvedAt: null,
    });

    expect(late?.payment.status).toBe("approved");
  });

  it("does not start a new checkout for a paid parcel", async () => {
    const shipmentId = await forwardedShipmentId();
    const payment = await startPayment(shipmentId);
    await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-3",
      status: "approved",
      paymentMethod: "credit_card",
      approvedAt: new Date(),
    });

    const again = await startShipmentPayment(database, {
      shipmentId,
      supplierId: supplier.supplierId,
      provider: "mercado_pago",
      amountCents: 5990,
      platformFeeCents: 0,
      platformFeeBasisPoints: 0,
    });

    expect(again).toBeNull();
  });

  it("restarts a rejected payment as pending with the same id", async () => {
    const shipmentId = await forwardedShipmentId();
    const payment = await startPayment(shipmentId);
    await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-4",
      status: "rejected",
      paymentMethod: "credit_card",
      approvedAt: null,
    });

    const again = await startPayment(shipmentId);

    expect(again.id).toBe(payment.id);
    expect(again.status).toBe("pending");
  });
});

function approve(paymentId: string, providerPaymentId: string) {
  return applyProviderPayment(database, {
    paymentId,
    providerPaymentId,
    status: "approved",
    paymentMethod: "pix",
    approvedAt: new Date(),
  });
}

describe("a second payment for the same parcel", () => {
  it("does not start a new checkout while a payment is under review", async () => {
    const shipmentId = await forwardedShipmentId();
    const payment = await startPayment(shipmentId);
    await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-5",
      status: "in_process",
      paymentMethod: "credit_card",
      approvedAt: null,
    });

    const again = await startShipmentPayment(database, {
      shipmentId,
      supplierId: supplier.supplierId,
      provider: "mercado_pago",
      amountCents: 5990,
      platformFeeCents: 0,
      platformFeeBasisPoints: 0,
    });

    expect(again).toBeNull();
  });

  it("reports a second approval as a duplicate and keeps the first payment", async () => {
    const payment = await startPayment(await forwardedShipmentId());
    await approve(payment.id, "p-6");

    const second = await approve(payment.id, "p-7");

    expect(second?.kind).toBe("duplicate");
    expect(second?.payment.providerPaymentId).toBe("p-6");
  });

  it("does not let the refund of another payment undo the paid one", async () => {
    const payment = await startPayment(await forwardedShipmentId());
    await approve(payment.id, "p-8");

    const refund = await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-9",
      status: "refunded",
      paymentMethod: "pix",
      approvedAt: null,
    });

    expect(refund?.kind).toBe("unchanged");
    expect(refund?.payment.status).toBe("approved");
  });

  it("lets another approved attempt settle a rejected one", async () => {
    const payment = await startPayment(await forwardedShipmentId());
    await applyProviderPayment(database, {
      paymentId: payment.id,
      providerPaymentId: "p-10",
      status: "rejected",
      paymentMethod: "credit_card",
      approvedAt: null,
    });

    const approved = await approve(payment.id, "p-11");

    expect(approved?.kind).toBe("applied");
    expect(approved?.payment.providerPaymentId).toBe("p-11");
  });
});

describe("openCheckoutUrl", () => {
  const now = new Date("2026-11-10T17:00:00.000Z");
  const open = {
    status: "pending" as const,
    checkoutUrl: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1",
    checkoutExpiresAt: new Date("2026-11-10T17:20:00.000Z"),
  };

  it("reuses a pending checkout that still takes payments", async () => {
    const payment = await startPayment(await forwardedShipmentId());

    expect(openCheckoutUrl({ ...payment, ...open }, now)).toBe(open.checkoutUrl);
  });

  it("opens a new checkout once the old one expired", async () => {
    const payment = await startPayment(await forwardedShipmentId());
    const expired = { ...payment, ...open, checkoutExpiresAt: new Date("2026-11-10T16:59:00Z") };

    expect(openCheckoutUrl(expired, now)).toBeNull();
  });
});

describe("payment fee setting", () => {
  it("saves the rate and reads it back", async () => {
    const [admin] = users.ids;
    if (admin === undefined) throw new Error("No user");

    await setPaymentFeeSetting(database, { basisPoints: 450, userId: admin });
    const setting = await getPaymentFeeSetting(database);

    expect(setting.basisPoints).toBe(450);
    expect(setting.updatedByUserId).toBe(admin);
  });

  it("refuses a rate above 30%", async () => {
    const [admin] = users.ids;
    if (admin === undefined) throw new Error("No user");

    await expect(
      setPaymentFeeSetting(database, { basisPoints: 3001, userId: admin }),
    ).rejects.toThrow("Failed query");
  });
});
