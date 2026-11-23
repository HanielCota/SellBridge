import { randomUUID } from "node:crypto";
import {
  HOLD_REFUSALS,
  SUPPLIER_WITHOUT_RECEIVING_MESSAGE,
} from "@sellbridge/shared/receiving-rules";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  orderItems,
  orders,
  orderShipments,
  platformSettings,
  suppliers,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { saveAsaasAccount, setPaymentAccountReview } from "./asaas-payments.ts";
import { forwardOrder, updateShipment } from "./fulfillment.ts";
import { queueReceivingAccountNotices } from "./notification-producers.ts";
import { getReceivingRules, setReceivingRules } from "./receiving-rules.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  applyProviderPayment,
  savePaymentPreference,
  startShipmentPayment,
} from "./supplier-payments.ts";
import { countSupplierParcelsToAccept } from "./supplier-panel-orders.ts";
import { getSupplierPanelShipment } from "./supplier-panel-orders-detail.ts";
import { countParcelAlerts } from "./staff-shipments.ts";
import { assertStoresSellSupplier } from "./store-suppliers.ts";
import {
  getSellableCatalogProduct,
  listActiveSuppliers,
  listSellableCatalog,
} from "./suppliers.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantId = "";
let userId = "";
let storeId = "";
const cleanups: (() => Promise<void>)[] = [];
const PAGE = { page: 1, pageSize: 50 };

async function supplierWithProduct(label: string) {
  const sku = `RCV-${label}-${randomUUID().slice(0, 8)}`;
  const created = await createTestSupplierProduct(database, {
    sku,
    title: `Produto ${sku}`,
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock: 5,
  });
  cleanups.push(created.cleanup);
  return { ...created, sku };
}

async function approveAsaas(supplierId: string) {
  const account = await saveAsaasAccount(database, {
    supplierId,
    userId,
    providerAccountId: `acc-${supplierId}`,
    walletId: `wallet-${supplierId}`,
    apiKeyEnc: "enc-key",
  });
  await setPaymentAccountReview(database, { accountId: account.id, reviewStatus: "approved" });
}

async function turnRules(choice: {
  requireReceivingAccount: boolean;
  paymentBeforePreparing: boolean;
}) {
  return setReceivingRules(database, { ...choice, userId, now: new Date() });
}

async function catalogSkus(search: string): Promise<string[]> {
  const page = await listSellableCatalog(database, tenantId, { search, sort: "title" }, PAGE);
  return page.items.map((item) => item.sku);
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  users = await createTestUsers(database, 1);
  tenantId = tenants.ids[0] ?? "";
  userId = users.ids[0] ?? "";
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, `rcv-${tenantId}`));
  storeId = store.id;
});

afterEach(async () => {
  await turnRules({ requireReceivingAccount: false, paymentBeforePreparing: false });
});

afterAll(async () => {
  // The tenants take their orders and parcels along; only then can the suppliers go.
  await tenants.cleanup();
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await users.cleanup();
  await database.$client.end();
});

describe("setReceivingRules", () => {
  it("keeps the instant the account rule was first turned on", async () => {
    const first = await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    const second = await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: true });

    expect(second.receivingAccountSince).toEqual(first.receivingAccountSince);
    expect(second.paymentBeforePreparingSince).not.toBeNull();
    expect(await getReceivingRules(database)).toEqual(second);
  });

  it("refuses paying first without the account rule", async () => {
    await expect(
      turnRules({ requireReceivingAccount: false, paymentBeforePreparing: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is refused by the database too when written around the repository", async () => {
    await expect(
      database
        .update(platformSettings)
        .set({ requireReceivingAccountSince: null, paymentBeforePreparingSince: new Date() })
        .where(eq(platformSettings.id, 1)),
    ).rejects.toMatchObject({
      cause: { constraint_name: "platform_settings_payment_before_preparing_check" },
    });
  });
});

describe("receiving-account rule in the reseller catalog", () => {
  it("shows a supplier without an account while the rule is off", async () => {
    const plain = await supplierWithProduct("off");

    expect(await catalogSkus(plain.sku)).toEqual([plain.sku]);
  });

  it("hides the products of a supplier without an approved account while the rule is on", async () => {
    const unpaid = await supplierWithProduct("hidden");
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    expect(await catalogSkus(unpaid.sku)).toEqual([]);
    await expect(getSellableCatalogProduct(database, unpaid.productId, tenantId)).rejects.toThrow(
      "Produto não encontrado no catálogo",
    );
  });

  it("keeps a supplier whose account is still under review hidden", async () => {
    const reviewing = await supplierWithProduct("review");
    await saveAsaasAccount(database, {
      supplierId: reviewing.supplierId,
      userId,
      providerAccountId: `acc-${reviewing.supplierId}`,
      walletId: `wallet-${reviewing.supplierId}`,
      apiKeyEnc: "enc-key",
    });
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    expect(await catalogSkus(reviewing.sku)).toEqual([]);
  });

  it("shows a supplier with an approved account while the rule is on", async () => {
    const paid = await supplierWithProduct("approved");
    await approveAsaas(paid.supplierId);
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    expect(await catalogSkus(paid.sku)).toEqual([paid.sku]);
    expect((await getSellableCatalogProduct(database, paid.productId, tenantId)).id).toBe(
      paid.productId,
    );
  });

  it("leaves a hidden supplier out of the supplier directory", async () => {
    const unpaid = await supplierWithProduct("directory");
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    const found = await listActiveSuppliers(database, { search: `de teste ${unpaid.sku}` });

    expect(found).toEqual([]);
  });
});

describe("receiving-account rule on publishing", () => {
  it("refuses publishing a product of a supplier without an approved account", async () => {
    const unpaid = await supplierWithProduct("publish");
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    await expect(
      assertStoresSellSupplier(database, tenantId, [], unpaid.supplierId),
    ).rejects.toThrow(SUPPLIER_WITHOUT_RECEIVING_MESSAGE);
  });

  it("lets the same supplier publish while the rule is off", async () => {
    const unpaid = await supplierWithProduct("publish-off");

    await expect(
      assertStoresSellSupplier(database, tenantId, [], unpaid.supplierId),
    ).resolves.toBeUndefined();
  });
});

/** A paid order of the supplier's product, forwarded now; returns its parcel. */
async function forwardedParcel(supplier: { supplierId: string; productId: string }) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeId,
      externalOrderId: randomUUID(),
      status: "paid",
      totalCents: 10_000,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: supplier.productId,
    title: "Camiseta",
    quantity: 1,
    unitPriceCents: 5000,
    unitCostCents: 3000,
  });
  await forwardOrder(database, tenantId, { orderId: order.id, address: testAddress, notes: "" });
  const [shipment] = await database
    .select({ id: orderShipments.id })
    .from(orderShipments)
    .where(eq(orderShipments.orderId, order.id));
  if (shipment === undefined) throw new Error("No shipment");
  return shipment.id;
}

async function payParcel(shipmentId: string, supplierId: string, approvedAt: Date) {
  const payment = await startShipmentPayment(database, {
    shipmentId,
    supplierId,
    provider: "asaas",
    amountCents: 3000,
    platformFeeCents: 30,
    platformFeeBasisPoints: 100,
    now: approvedAt,
    reservedUntil: new Date(approvedAt.getTime() + 60_000),
  });
  if (payment === null) throw new Error("Payment not started");
  const chargeId = `pay_${randomUUID()}`;
  await savePaymentPreference(database, {
    paymentId: payment.id,
    preferenceId: chargeId,
    checkoutUrl: "https://asaas.test/i/1",
    checkoutExpiresAt: new Date(approvedAt.getTime() + 86_400_000),
    amountCents: 3000,
    platformFeeCents: 30,
  });
  await applyProviderPayment(database, {
    paymentId: payment.id,
    providerPaymentId: chargeId,
    status: "approved",
    paymentMethod: "PIX",
    approvedAt,
  });
}

function accept(shipmentId: string, supplierId: string) {
  return updateShipment(
    database,
    { shipmentId, status: "accepted", carrier: "", trackingCode: "", trackingUrl: "", note: "" },
    { supplierId },
  );
}

describe("parcels waiting before the supplier prepares them", () => {
  it("lets a parcel move while both rules are off", async () => {
    const supplier = await supplierWithProduct("free");
    const shipmentId = await forwardedParcel(supplier);

    await accept(shipmentId, supplier.supplierId);

    const parcel = await getSupplierPanelShipment(database, { ...supplier, shipmentId });
    expect(parcel.status).toBe("accepted");
    expect(parcel.preparationHold).toBeNull();
  });

  it("holds a new parcel of a supplier without an approved account", async () => {
    const supplier = await supplierWithProduct("hold-account");
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });
    const shipmentId = await forwardedParcel(supplier);

    const parcel = await getSupplierPanelShipment(database, { ...supplier, shipmentId });

    expect(parcel.preparationHold).toBe("receiving_account");
    await expect(accept(shipmentId, supplier.supplierId)).rejects.toThrow(
      HOLD_REFUSALS.receiving_account,
    );
  });

  it("keeps moving a parcel forwarded before the rule was turned on", async () => {
    const supplier = await supplierWithProduct("before-rule");
    const shipmentId = await forwardedParcel(supplier);
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: true });

    await accept(shipmentId, supplier.supplierId);

    const parcel = await getSupplierPanelShipment(database, { ...supplier, shipmentId });
    expect(parcel.status).toBe("accepted");
  });

  it("holds an unpaid parcel without any deadline while payment comes first", async () => {
    const supplier = await supplierWithProduct("unpaid");
    await approveAsaas(supplier.supplierId);
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: true });
    const shipmentId = await forwardedParcel(supplier);

    const parcel = await getSupplierPanelShipment(database, { ...supplier, shipmentId });

    expect(parcel.preparationHold).toBe("payment");
    expect(parcel.acceptBy).toBeNull();
    expect(parcel.dispatchBy).toBeNull();
    await expect(accept(shipmentId, supplier.supplierId)).rejects.toThrow(HOLD_REFUSALS.payment);
  });

  it("leaves an unpaid parcel out of what the supplier has to accept", async () => {
    const supplier = await supplierWithProduct("to-accept");
    const organization = await createTestTenants(database, 1);
    cleanups.push(organization.cleanup);
    const organizationId = organization.ids[0] ?? "";
    await database
      .update(suppliers)
      .set({ organizationId })
      .where(eq(suppliers.id, supplier.supplierId));
    await approveAsaas(supplier.supplierId);
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: true });
    await forwardedParcel(supplier);

    const toAccept = await countSupplierParcelsToAccept(database, supplier.supplierId);
    const navBadge = await countParcelAlerts(database, {
      supplierOrganizationId: organizationId,
      includeForwarded: true,
    });

    expect(toAccept).toBe(0);
    expect(navBadge).toBe(0);
  });

  it("starts the supplier's times at the payment and releases the parcel", async () => {
    const supplier = await supplierWithProduct("paid");
    await approveAsaas(supplier.supplierId);
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: true });
    const shipmentId = await forwardedParcel(supplier);
    const paidAt = new Date(Date.now() + 3 * 3_600_000);
    await payParcel(shipmentId, supplier.supplierId, paidAt);

    const parcel = await getSupplierPanelShipment(database, { ...supplier, shipmentId });

    expect(parcel.preparationHold).toBeNull();
    expect(parcel.acceptBy).toEqual(new Date(paidAt.getTime() + 24 * 3_600_000));
    await accept(shipmentId, supplier.supplierId);
  });

  it("notices only the parcels that wait for the receiving account", async () => {
    const waiting = await supplierWithProduct("notice-wait");
    const paid = await supplierWithProduct("notice-paid");
    await approveAsaas(paid.supplierId);
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });
    const held = await forwardedParcel(waiting);
    const free = await forwardedParcel(paid);

    const noticed = await queueReceivingAccountNotices(database, [held, free]);

    expect(noticed).toBe(1);
  });

  it("still lets a held parcel be cancelled", async () => {
    const supplier = await supplierWithProduct("cancel");
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });
    const shipmentId = await forwardedParcel(supplier);

    await updateShipment(
      database,
      { shipmentId, status: "cancelled", carrier: "", trackingCode: "", trackingUrl: "", note: "" },
      { tenantId },
    );

    const parcel = await getSupplierPanelShipment(database, { ...supplier, shipmentId });
    expect(parcel.status).toBe("cancelled");
  });
});
