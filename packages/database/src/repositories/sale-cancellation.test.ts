import { randomUUID } from "node:crypto";
import { supplierPaymentRefundReason } from "@sellbridge/shared/shipment-payments";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  member,
  notificationDeliveries,
  orderShipments,
  shipmentEvents,
  shipmentPayments,
  suppliers,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { applyMarketplaceShipment } from "./fulfillment.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { countSupplierOperationNow } from "./supplier-panel-orders.ts";
import { listShipmentPaymentRefundCandidates } from "./supplier-payments.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";
let supplierOwner = "";

const HOUR_IN_MS = 3_600_000;

/** Tenant A is the reseller; tenant B is the supplier's own organization (its panel account). */
beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 1);
  supplierOwner = users.ids[0] ?? "";
  await database.insert(member).values({
    id: randomUUID(),
    organizationId: tenants.tenantB,
    userId: supplierOwner,
    role: "owner",
    createdAt: new Date(),
  });
  storeId = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantA, `cancel-${randomUUID()}`))
  ).id;
  supplier = await createTestSupplierProduct(database, {
    sku: `CANCEL-${randomUUID()}`,
    title: "Luminária",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  await database
    .update(suppliers)
    .set({ organizationId: tenants.tenantB })
    .where(eq(suppliers.id, supplier.supplierId));
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

function marketplaceOrder(externalOrderId: string, status: "paid" | "cancelled") {
  return {
    externalOrderId,
    status,
    totalCents: 2500,
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt: new Date(),
    items: [],
  };
}

/** A paid sale with one parcel at `status`, its steps recorded the way the supplier took them. */
async function saleWithParcel(status: FulfillmentStatus) {
  const externalOrderId = `CANCEL-${randomUUID().slice(0, 8)}`;
  const { orderId } = await upsertMarketplaceOrder(
    database,
    tenants.tenantA,
    storeId,
    marketplaceOrder(externalOrderId, "paid"),
  );
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: tenants.tenantA,
      orderId,
      supplierId: supplier.supplierId,
      address: testAddress,
      items: [{ orderItemId: randomUUID(), title: "Luminária Aura", sku: "AURA", quantity: 1 }],
      status,
      dispatchDeadlineAt: new Date(Date.now() - HOUR_IN_MS),
      ...(status === "shipped" ? { carrier: "Correios", trackingCode: "QB000000001BR" } : {}),
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) {
    throw new Error("envio não criado");
  }
  const steps: FulfillmentStatus[] = ["forwarded", "accepted", "picking", "ready", "shipped"];
  const taken = steps.slice(0, steps.indexOf(status) + 1);
  for (const step of taken) {
    await database.insert(shipmentEvents).values({
      shipmentId: shipment.id,
      status: step,
      actor: step === "forwarded" ? "Revendedor" : "Fornecedor",
      note: "",
      // Three days ago: past any accept or dispatch time, so the parcel counts as late.
      createdAt: new Date(Date.now() - 72 * HOUR_IN_MS),
    });
  }
  return { externalOrderId, orderId, shipmentId: shipment.id };
}

async function cancelOnMarketplace(externalOrderId: string) {
  await upsertMarketplaceOrder(
    database,
    tenants.tenantA,
    storeId,
    marketplaceOrder(externalOrderId, "cancelled"),
  );
}

async function parcelStatus(shipmentId: string) {
  const [row] = await database
    .select({ status: orderShipments.status })
    .from(orderShipments)
    .where(eq(orderShipments.id, shipmentId));
  return row?.status;
}

async function cancellationNotices(shipmentId: string) {
  return database
    .select({ recipientId: notificationDeliveries.recipientId })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.dedupeKey, `shipment:${shipmentId}:sale_cancelled`),
        eq(notificationDeliveries.channel, "email"),
      ),
    );
}

async function paidParcel(shipmentId: string) {
  const [payment] = await database
    .insert(shipmentPayments)
    .values({
      shipmentId,
      supplierId: supplier.supplierId,
      provider: "asaas",
      status: "approved",
      amountCents: 1000,
      platformFeeCents: 40,
      platformFeeBasisPoints: 400,
      paidAt: new Date(),
    })
    .returning({ id: shipmentPayments.id });
  if (payment === undefined) {
    throw new Error("pagamento não criado");
  }
  return payment.id;
}

describe("a sale the marketplace cancels", () => {
  it("takes a parcel waiting for the accept out of the supplier's queue and warns the supplier", async () => {
    const sale = await saleWithParcel("forwarded");
    const before = await countSupplierOperationNow(database, supplier.supplierId);

    await cancelOnMarketplace(sale.externalOrderId);

    const after = await countSupplierOperationNow(database, supplier.supplierId);
    const [cancelEvent] = await database
      .select({ actor: shipmentEvents.actor, note: shipmentEvents.note })
      .from(shipmentEvents)
      .where(
        and(eq(shipmentEvents.shipmentId, sale.shipmentId), eq(shipmentEvents.status, "cancelled")),
      );
    expect(await parcelStatus(sale.shipmentId)).toBe("cancelled");
    expect(after.waiting).toBe(before.waiting - 1);
    expect(before.late).toBeGreaterThan(0);
    expect(after.late).toBe(before.late - 1);
    expect(cancelEvent?.actor).toBe("SellBridge");
    expect(cancelEvent?.note).toContain("Não envie o produto");
    expect((await cancellationNotices(sale.shipmentId)).map((row) => row.recipientId)).toEqual([
      supplierOwner,
    ]);
  });

  it("gives a paid parcel the supplier had accepted back to the reseller on its own", async () => {
    const sale = await saleWithParcel("accepted");
    const paymentId = await paidParcel(sale.shipmentId);

    await cancelOnMarketplace(sale.externalOrderId);

    const candidates = await listShipmentPaymentRefundCandidates(database, {
      provider: "asaas",
      limit: 500,
    });
    const candidate = candidates.find((row) => row.payment.id === paymentId);
    expect(candidate?.cancelledByResellerAfterAccept).toBe(false);
    expect(
      candidate === undefined
        ? null
        : supplierPaymentRefundReason({
            timing: candidate.timing,
            paidAt: new Date(),
            now: new Date(),
          }),
    ).toBe("cancelled");
  });

  it("keeps a parcel that already left and follows it until it comes back", async () => {
    const sale = await saleWithParcel("shipped");

    await cancelOnMarketplace(sale.externalOrderId);
    const statusAfterCancel = await parcelStatus(sale.shipmentId);
    await applyMarketplaceShipment(database, tenants.tenantA, sale.orderId, {
      status: "returned",
      trackingStatus: "returned",
      buyerReturnDelivered: false,
      carrier: null,
      trackingCode: null,
    });

    expect(statusAfterCancel).toBe("shipped");
    expect(await parcelStatus(sale.shipmentId)).toBe("returned");
  });

  it("changes nothing when the same cancellation arrives again", async () => {
    const sale = await saleWithParcel("picking");
    await cancelOnMarketplace(sale.externalOrderId);
    const eventsBefore = await database
      .select({ id: shipmentEvents.id })
      .from(shipmentEvents)
      .where(eq(shipmentEvents.shipmentId, sale.shipmentId));

    await cancelOnMarketplace(sale.externalOrderId);

    const eventsAfter = await database
      .select({ id: shipmentEvents.id })
      .from(shipmentEvents)
      .where(eq(shipmentEvents.shipmentId, sale.shipmentId));
    expect(eventsAfter).toHaveLength(eventsBefore.length);
    expect(await cancellationNotices(sale.shipmentId)).toHaveLength(1);
  });
});
