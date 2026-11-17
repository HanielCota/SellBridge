import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import {
  applyProviderPayment,
  findShipmentPaymentById,
  forwardOrder,
  savePaymentPreference,
  startShipmentPayment,
  updateShipment,
  upsertSupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import type { MercadoPagoSettings } from "@sellbridge/payments/mercado-pago";
import { logger } from "@sellbridge/shared/logger";
import { shipmentUpdateSchema, type FulfillmentStatus } from "@sellbridge/shared/schemas";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestProduct,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createSupplierPaymentProcessor } from "./supplier-payments.ts";

const environment = createWorkerTestEnvironment();
const { database, cipher } = environment;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let storeId = "";
const cleanups: (() => Promise<void>)[] = [];

const HOUR_IN_MS = 3_600_000;
const SELLER_ACCOUNT_ID = "112233";
const settings: MercadoPagoSettings = {
  clientId: "client",
  clientSecret: "secret",
  webhookSecret: "signature",
  testMode: false,
  apiUrl: "https://api.mercadopago.test",
  authUrl: "https://auth.mercadopago.test",
};
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

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  const [store] = await database
    .insert(schema.storeConnections)
    .values({
      tenantId: tenants.first,
      marketplace: "mercado_livre",
      externalShopId: `PAY-SHOP-${randomUUID()}`,
      shopName: "Loja repasse",
      accessTokenEnc: cipher.encrypt("ml-access-token"),
      refreshTokenEnc: cipher.encrypt("ml-refresh-token"),
      expiresAt: new Date(Date.now() + HOUR_IN_MS),
      status: "connected",
    })
    .returning();
  if (!store) throw new Error("loja de teste");
  storeId = store.id;
});

afterAll(async () => {
  await tenants.cleanup();
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await database.$client.end();
});

interface FakePayment {
  status: string;
  amount: number;
  fee: number;
  reference: string;
}

/** A stand-in Mercado Pago: payments by id, each checkout's payment ids, and its refund answer. */
const fake = {
  payments: new Map<string, FakePayment>(),
  checkouts: new Map<string, string[]>(),
  refundAnswer: { status: 201, body: { id: 9001, status: "approved" } as unknown },
  refundKeys: [] as string[],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function answerMercadoPago(url: unknown, init?: RequestInit): Promise<Response> {
  const requested = new URL(String(url));
  if (requested.pathname.endsWith("/merchant_orders/search")) {
    const preferenceId = requested.searchParams.get("preference_id") ?? "";
    const ids = fake.checkouts.get(preferenceId) ?? [];
    return json({
      elements: [{ preference_id: preferenceId, payments: ids.map((id) => ({ id })) }],
    });
  }
  const refund = /\/v1\/payments\/(\d+)\/refunds$/.exec(requested.pathname);
  if (refund !== null && init?.method === "POST") {
    fake.refundKeys.push(new Headers(init.headers).get("x-idempotency-key") ?? "");
    const payment = fake.payments.get(refund[1] ?? "");
    if (fake.refundAnswer.status < 300 && payment !== undefined) {
      payment.status = "refunded";
    }
    return json(fake.refundAnswer.body, fake.refundAnswer.status);
  }
  const read = /\/v1\/payments\/(\d+)$/.exec(requested.pathname);
  const payment = fake.payments.get(read?.[1] ?? "");
  if (payment === undefined) {
    return json({ message: "not found" }, 404);
  }
  return json({
    id: Number(read?.[1]),
    status: payment.status,
    external_reference: payment.reference,
    date_approved: payment.status === "approved" ? new Date().toISOString() : null,
    transaction_amount: payment.amount,
    payment_type_id: "credit_card",
    currency_id: "BRL",
    collector_id: Number(SELLER_ACCOUNT_ID),
    fee_details: [{ type: "application_fee", amount: payment.fee }],
  });
}

beforeEach(() => {
  fake.payments.clear();
  fake.checkouts.clear();
  fake.refundAnswer = { status: 201, body: { id: 9001, status: "approved" } };
  fake.refundKeys = [];
  vi.stubGlobal("fetch", vi.fn(answerMercadoPago));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fresh supplier with a linked Mercado Pago account and a forwarded, unpaid parcel. */
async function parcelWithCheckout() {
  const catalog = await createTestProduct(database, {
    sku: `PAY-${randomUUID().slice(0, 8)}`,
    title: "Produto repasse",
    stock: 9,
  });
  cleanups.push(catalog.cleanup);
  await upsertSupplierPaymentAccount(database, {
    supplierId: catalog.supplierId,
    provider: "mercado_pago",
    userId: null,
    providerAccountId: SELLER_ACCOUNT_ID,
    tokens: {
      accessTokenEnc: cipher.encrypt("seller-token"),
      refreshTokenEnc: cipher.encrypt("seller-refresh"),
      expiresAt: new Date(Date.now() + 90 * 24 * HOUR_IN_MS),
    },
  });
  const [order] = await database
    .insert(schema.orders)
    .values({
      tenantId: tenants.first,
      storeConnectionId: storeId,
      externalOrderId: `PAY-${randomUUID()}`,
      status: "paid",
      totalCents: 4990,
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("pedido de teste");
  await database.insert(schema.orderItems).values({
    tenantId: tenants.first,
    orderId: order.id,
    supplierProductId: catalog.productId,
    title: "Produto repasse",
    quantity: 1,
    unitPriceCents: 4990,
    unitCostCents: 2000,
  });
  await forwardOrder(database, tenants.first, { orderId: order.id, address, notes: "" });
  const [shipment] = await database
    .select()
    .from(schema.orderShipments)
    .where(eq(schema.orderShipments.orderId, order.id));
  if (!shipment) throw new Error("envio de teste");
  const payment = await startShipmentPayment(database, {
    shipmentId: shipment.id,
    supplierId: catalog.supplierId,
    provider: "mercado_pago",
    amountCents: 2000,
    platformFeeCents: 20,
    platformFeeBasisPoints: 100,
    now: new Date(),
    reservedUntil: new Date(Date.now() + 60_000),
  });
  if (payment === null) throw new Error("pagamento de teste");
  const preferenceId = `pref-${randomUUID()}`;
  await savePaymentPreference(database, {
    paymentId: payment.id,
    preferenceId,
    checkoutUrl: "https://www.mercadopago.com.br/checkout/v1/redirect",
    checkoutExpiresAt: new Date(Date.now() - 60_000),
    amountCents: 2000,
    platformFeeCents: 20,
  });
  return { payment, preferenceId, shipment, supplierId: catalog.supplierId };
}

/** The parcel paid `hoursAgo` hours ago through the fake's payment `providerPaymentId`. */
async function paidParcel(hoursAgo: number) {
  const parcel = await parcelWithCheckout();
  const providerPaymentId = String(Math.floor(Math.random() * 1e12));
  fake.payments.set(providerPaymentId, {
    status: "approved",
    amount: 20,
    fee: 0.2,
    reference: parcel.payment.id,
  });
  await applyProviderPayment(database, {
    paymentId: parcel.payment.id,
    providerPaymentId,
    status: "approved",
    paymentMethod: "credit_card",
    approvedAt: new Date(Date.now() - hoursAgo * HOUR_IN_MS),
  });
  return { ...parcel, providerPaymentId };
}

/** Moves the parcel as the supplier or the reseller would, so its history says who did it. */
async function moveParcel(
  parcel: { shipment: { id: string }; supplierId: string },
  status: FulfillmentStatus,
  by: "supplier" | "reseller",
): Promise<void> {
  const access =
    by === "supplier" ? { supplierId: parcel.supplierId } : { tenantId: tenants.first };
  const note = status === "cancelled" ? "Comprador desistiu" : "";
  await updateShipment(
    database,
    shipmentUpdateSchema.parse({ shipmentId: parcel.shipment.id, status, note }),
    access,
  );
}

function processor(requestStockSync = vi.fn<() => Promise<void>>(async () => {})) {
  return createSupplierPaymentProcessor({ database, cipher, settings, requestStockSync });
}

describe("supplier payment reconciliation", () => {
  it("marks a parcel paid when the approval of its checkout never arrived as a notice", async () => {
    const { payment, preferenceId } = await parcelWithCheckout();
    fake.payments.set("555001", {
      status: "approved",
      amount: 20,
      fee: 0.2,
      reference: payment.id,
    });
    fake.checkouts.set(preferenceId, ["555001"]);

    await processor()();

    const saved = await findShipmentPaymentById(database, payment.id);
    expect(saved?.status).toBe("approved");
    expect(saved?.providerPaymentId).toBe("555001");
    expect(saved?.checkedAt).toBeInstanceOf(Date);
  });

  it("does nothing while paying suppliers through Mercado Pago is off", async () => {
    const run = createSupplierPaymentProcessor({
      database,
      cipher,
      settings: null,
      requestStockSync: vi.fn<() => Promise<void>>(async () => {}),
    });

    const round = await run();

    expect(round).toEqual({ checked: 0, refundsRequested: 0, refundsRefused: 0, refundsHeld: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("automatic refund", () => {
  it("gives the money back when the supplier did not ship within the deadline", async () => {
    const parcel = await paidParcel(72);
    await database
      .update(schema.orderShipments)
      .set({ dispatchDeadlineAt: new Date(Date.now() - 3 * 24 * HOUR_IN_MS) })
      .where(eq(schema.orderShipments.id, parcel.shipment.id));

    await processor()();

    const saved = await findShipmentPaymentById(database, parcel.payment.id);
    expect(saved?.status).toBe("refunded");
    expect(saved?.refundReason).toBe("not_dispatched");
    expect(fake.refundKeys).toEqual([`refund-${parcel.payment.id}`]);
  });

  it("keeps the money with the supplier until 48 hours after the payment", async () => {
    const parcel = await paidParcel(47);
    await database
      .update(schema.orderShipments)
      .set({ dispatchDeadlineAt: new Date(Date.now() - 5 * 24 * HOUR_IN_MS) })
      .where(eq(schema.orderShipments.id, parcel.shipment.id));

    await processor()();

    const saved = await findShipmentPaymentById(database, parcel.payment.id);
    expect(saved?.status).toBe("approved");
    expect(fake.refundKeys).toEqual([]);
  });

  it("gives the money back at once for a cancelled parcel", async () => {
    const parcel = await paidParcel(1);
    await database
      .update(schema.orderShipments)
      .set({ status: "cancelled" })
      .where(eq(schema.orderShipments.id, parcel.shipment.id));

    await processor()();

    const saved = await findShipmentPaymentById(database, parcel.payment.id);
    expect(saved?.status).toBe("refunded");
    expect(saved?.refundReason).toBe("cancelled");
  });

  it("never refunds a parcel the carrier failed to deliver", async () => {
    const parcel = await paidParcel(500);
    await database
      .update(schema.orderShipments)
      .set({ status: "not_delivered" })
      .where(eq(schema.orderShipments.id, parcel.shipment.id));

    await processor()();

    expect(fake.refundKeys).toEqual([]);
  });

  it("deactivates the supplier once when Mercado Pago refuses the refund", async () => {
    const parcel = await paidParcel(1);
    await database
      .update(schema.orderShipments)
      .set({ status: "returned" })
      .where(eq(schema.orderShipments.id, parcel.shipment.id));
    fake.refundAnswer = { status: 400, body: { error: "insufficient_money_for_refund" } };
    const requestStockSync = vi.fn<() => Promise<void>>(async () => {});
    const run = processor(requestStockSync);

    await run();
    await run();

    const saved = await findShipmentPaymentById(database, parcel.payment.id);
    const [supplier] = await database
      .select({ active: schema.suppliers.active })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, parcel.supplierId));
    expect(saved?.refundError).toBe("insufficient_money_for_refund");
    expect(saved?.status).toBe("approved");
    expect(supplier?.active).toBe(false);
    expect(requestStockSync).toHaveBeenCalledTimes(1);
    expect(fake.refundKeys).toHaveLength(1);
  });

  it("asks again with the same key when Mercado Pago could not be reached", async () => {
    const parcel = await paidParcel(1);
    await database
      .update(schema.orderShipments)
      .set({ status: "cancelled" })
      .where(eq(schema.orderShipments.id, parcel.shipment.id));
    fake.refundAnswer = { status: 503, body: { message: "unavailable" } };
    const run = processor();

    await run();
    fake.refundAnswer = { status: 201, body: { id: 9002, status: "approved" } };
    await run();

    const saved = await findShipmentPaymentById(database, parcel.payment.id);
    const [supplier] = await database
      .select({ active: schema.suppliers.active })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, parcel.supplierId));
    expect(saved?.status).toBe("refunded");
    expect(supplier?.active).toBe(true);
    expect(fake.refundKeys).toEqual([`refund-${parcel.payment.id}`, `refund-${parcel.payment.id}`]);
  });

  it("leaves a parcel the reseller cancelled after the supplier accepted to the team", async () => {
    const parcel = await paidParcel(1);
    await moveParcel(parcel, "accepted", "supplier");
    await moveParcel(parcel, "cancelled", "reseller");
    const alerts = vi.spyOn(logger, "error");
    const run = processor();

    const first = await run();
    const second = await run();

    const saved = await findShipmentPaymentById(database, parcel.payment.id);
    const held = alerts.mock.calls.filter(([event]) => event === "mercado_pago.refund_held");
    expect(fake.refundKeys).toEqual([]);
    expect(saved?.status).toBe("approved");
    expect(saved?.refundHeldAt).not.toBeNull();
    expect(first.refundsHeld).toBe(1);
    expect(second.refundsHeld).toBe(0);
    expect(held).toHaveLength(1);
    expect(held[0]?.[1]).toMatchObject({ problemKey: parcel.payment.id });
    expect(String(held[0]?.[1]?.reason)).toContain("R$ 20,00");
  });

  it("still refunds at once when the reseller cancels before the supplier accepts", async () => {
    const parcel = await paidParcel(1);
    await moveParcel(parcel, "cancelled", "reseller");

    await processor()();

    const saved = await findShipmentPaymentById(database, parcel.payment.id);
    expect(saved?.status).toBe("refunded");
    expect(saved?.refundHeldAt).toBeNull();
  });

  it("still refunds at once when the supplier cancels a parcel it had accepted", async () => {
    const parcel = await paidParcel(1);
    await moveParcel(parcel, "accepted", "supplier");
    await moveParcel(parcel, "cancelled", "supplier");

    await processor()();

    const saved = await findShipmentPaymentById(database, parcel.payment.id);
    expect(saved?.status).toBe("refunded");
  });
});
