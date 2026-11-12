import { randomUUID } from "node:crypto";
import { compareQueueUrgency } from "@sellbridge/shared/supplier-panel-orders";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  orderItems,
  orders,
  orderShipments,
  shipmentEvents,
  shipmentPayments,
  storeConnections,
  suppliers,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testCpf,
  testStoreInput,
} from "../testing/fixtures.ts";
import { noteSupplierEmailFailed } from "./auto-forward.ts";
import { forwardOrder } from "./fulfillment.ts";
import { saveBillingHolder } from "./region.ts";
import { recordLabelsPrinted, recordLabelsWaiting } from "./shipment-labels.ts";
import { upsertStoreConnection } from "./stores.ts";
import { getSupplierPanelShipment } from "./supplier-panel-orders-detail.ts";
import { queueDueAt } from "./supplier-panel-orders-sql.ts";
import { findSupplierShipmentsByCode } from "./supplier-panel-scan.ts";
import {
  countSupplierShipmentsByTab,
  listSupplierHomeShipments,
  listSupplierResellers,
  listSupplierResellerStores,
  listSupplierShipments,
} from "./supplier-panel-orders.ts";

const HOUR = 3_600_000;
const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let otherSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
const storeIds: Record<string, string> = {};

async function forwardedShipment(
  options: {
    tenantId?: string;
    productId?: string;
    hoursAgo?: number;
    storeId?: string;
    buyerName?: string;
    orderedAt?: Date;
  } = {},
) {
  const tenantId = options.tenantId ?? tenants.tenantA;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: options.storeId ?? storeIds[tenantId] ?? "",
      externalOrderId: `PED-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 5000,
      buyerName: options.buyerName ?? null,
      orderedAt: options.orderedAt ?? new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: options.productId ?? supplier.productId,
    title: "Camiseta",
    quantity: 1,
    unitPriceCents: 5000,
    unitCostCents: 1000,
  });
  const [link] = await forwardOrder(database, tenantId, {
    orderId: order.id,
    address: testAddress,
    notes: "",
  });
  if (link === undefined) throw new Error("No shipment");
  // Backdate the forward so each parcel has a different deadline.
  const forwardedAt = new Date(Date.now() - (options.hoursAgo ?? 0) * HOUR);
  await database
    .update(shipmentEvents)
    .set({ createdAt: forwardedAt })
    .where(eq(shipmentEvents.shipmentId, link.shipmentId));
  return { shipmentId: link.shipmentId, order };
}

async function setStatus(shipmentId: string, status: "accepted" | "ready" | "shipped") {
  await database.update(orderShipments).set({ status }).where(eq(orderShipments.id, shipmentId));
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplier = await createTestSupplierProduct(database, {
    sku: `PANEL-${randomUUID().slice(0, 6)}`,
    title: "Camiseta",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  otherSupplier = await createTestSupplierProduct(database, {
    sku: "PANEL-OTHER",
    title: "Calça",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  for (const tenantId of [tenants.tenantA, tenants.tenantB]) {
    storeIds[tenantId] = (
      await upsertStoreConnection(database, testStoreInput(tenantId, randomUUID()))
    ).id;
  }
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await otherSupplier.cleanup();
  await database.$client.end();
});

describe("listSupplierShipments", () => {
  let overdue: Awaited<ReturnType<typeof forwardedShipment>>;
  let fresh: Awaited<ReturnType<typeof forwardedShipment>>;
  let accepted: Awaited<ReturnType<typeof forwardedShipment>>;
  let shipped: Awaited<ReturnType<typeof forwardedShipment>>;
  let foreign: Awaited<ReturnType<typeof forwardedShipment>>;

  beforeAll(async () => {
    // Accept within 24 h, dispatch within 48 h (the supplier defaults).
    overdue = await forwardedShipment({ hoursAgo: 30 });
    fresh = await forwardedShipment({ hoursAgo: 1, tenantId: tenants.tenantB });
    accepted = await forwardedShipment({ hoursAgo: 40 });
    await setStatus(accepted.shipmentId, "accepted");
    shipped = await forwardedShipment({ hoursAgo: 50 });
    await setStatus(shipped.shipmentId, "shipped");
    foreign = await forwardedShipment({ productId: otherSupplier.productId });
  });

  it("lists the queue across resellers, most urgent first, as the shared domain sorts it", async () => {
    const result = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "todo",
      query: "",
      page: 1,
    });
    const ids = result.items.map((item) => item.id);
    expect(ids).toEqual([overdue.shipmentId, accepted.shipmentId, fresh.shipmentId]);
    expect(result.items.toSorted(compareQueueUrgency).map((item) => item.id)).toEqual(ids);
    expect(result.items[0]?.urgency).toBe("overdue");
    expect(result.items[0]?.action?.status).toBe("accepted");
    expect(result.items[1]?.action?.status).toBe("picking");
  });

  it("never shows another supplier's parcels nor the buyer's street", async () => {
    const result = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "todo",
      query: "",
      page: 1,
    });
    expect(result.items.map((item) => item.id)).not.toContain(foreign.shipmentId);
    const [first] = result.items;
    expect(first?.destinationCity).toBe(testAddress.city);
    expect(JSON.stringify(first)).not.toContain(testAddress.street);
    expect(JSON.stringify(first)).not.toContain(testAddress.recipient);
  });

  it("finds a parcel by order number or SKU", async () => {
    const byOrder = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "todo",
      query: fresh.order.externalOrderId.toLowerCase(),
      page: 1,
    });
    expect(byOrder.items.map((item) => item.id)).toEqual([fresh.shipmentId]);
    const bySku = await listSupplierShipments(database, {
      supplierId: otherSupplier.supplierId,
      tab: "todo",
      query: "panel-oth",
      page: 1,
    });
    expect(bySku.items.map((item) => item.id)).toEqual([foreign.shipmentId]);
  });

  it("gathers overdue, blocked and unmailed parcels under 'Com problema'", async () => {
    await noteSupplierEmailFailed(database, tenants.tenantB, fresh.shipmentId);
    const result = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "problem",
      query: "",
      page: 1,
    });
    const problems = Object.fromEntries(result.items.map((item) => [item.id, item.problems]));
    expect(problems[overdue.shipmentId]).toEqual(["overdue"]);
    expect(problems[fresh.shipmentId]).toEqual(["email_failed"]);
    expect(problems[accepted.shipmentId]).toBeUndefined();
  });

  it("counts every tab with the search applied", async () => {
    const counts = await countSupplierShipmentsByTab(database, {
      supplierId: supplier.supplierId,
      query: "",
    });
    expect(counts).toMatchObject({
      todo: 3,
      forwarded: 2,
      accepted: 1,
      shipped: 1,
      problem: 2,
      closed: 0,
    });
    const searched = await countSupplierShipmentsByTab(database, {
      supplierId: supplier.supplierId,
      query: shipped.order.externalOrderId,
    });
    expect(searched).toMatchObject({ todo: 0, shipped: 1 });
  });

  it("shows the last page when the page asked for is past the end", async () => {
    const result = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "shipped",
      query: "",
      page: 99,
    });
    expect(result).toMatchObject({ page: 1, total: 1, totalPages: 1 });
  });
});

describe("getSupplierPanelShipment", () => {
  it("gives the parcel with its history and address, without the link token", async () => {
    const { shipmentId } = await forwardedShipment();
    const detail = await getSupplierPanelShipment(database, {
      supplierId: supplier.supplierId,
      shipmentId,
    });
    expect(detail.address?.street).toBe(testAddress.street);
    expect(detail.events.map((event) => event.status)).toEqual(["forwarded"]);
    expect(detail.acceptBy).toBeInstanceOf(Date);
    expect(Object.keys(detail)).not.toContain("supplierTokenHash");
    expect(Object.keys(detail)).not.toContain("tenantId");
  });

  it("hides the address once the sale is cancelled", async () => {
    const { shipmentId, order } = await forwardedShipment();
    await database.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    const detail = await getSupplierPanelShipment(database, {
      supplierId: supplier.supplierId,
      shipmentId,
    });
    expect(detail.address).toBeNull();
  });

  // Resellers and suppliers must not reach each other outside the platform.
  it("never gives the supplier the reseller's phone or billing address", async () => {
    const phone = "11976543210";
    const billingAddress = {
      cep: "04538132",
      street: "Rua Faturamento Secreto",
      number: "77",
      complement: "",
      neighborhood: "Itaim Bibi",
      city: "Campinas",
      state: "SP" as const,
    };
    await saveBillingHolder(database, tenants.tenantA, {
      fullName: "Revendedora Contato Oculto",
      cpf: testCpf(),
      phone,
      company: null,
      address: billingAddress,
    });
    const { shipmentId } = await forwardedShipment();
    const detail = await getSupplierPanelShipment(database, {
      supplierId: supplier.supplierId,
      shipmentId,
    });
    const list = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "todo",
      query: "",
      page: 1,
    });
    for (const payload of [JSON.stringify(detail), JSON.stringify(list)]) {
      expect(payload).not.toContain(phone);
      expect(payload).not.toContain(billingAddress.street);
      expect(payload).not.toContain(billingAddress.cep);
      expect(payload).not.toContain("Revendedora Contato Oculto");
    }
  });

  it("treats another supplier's parcel as not found", async () => {
    const { shipmentId } = await forwardedShipment({ productId: otherSupplier.productId });
    await expect(
      getSupplierPanelShipment(database, { supplierId: supplier.supplierId, shipmentId }),
    ).rejects.toThrow(/não encontrado/);
  });
});

describe("supplier deadlines", () => {
  it("uses the supplier's own accept hours", async () => {
    await database
      .update(suppliers)
      .set({ acceptWithinHours: 2, dispatchWithinHours: 4 })
      .where(eq(suppliers.id, otherSupplier.supplierId));
    const { shipmentId } = await forwardedShipment({
      productId: otherSupplier.productId,
      hoursAgo: 3,
    });
    const result = await listSupplierShipments(database, {
      supplierId: otherSupplier.supplierId,
      tab: "problem",
      query: "",
      page: 1,
    });
    expect(result.items.map((item) => item.id)).toContain(shipmentId);
  });
});

describe("queueDueAt", () => {
  it("matches the shared domain's deadline, marketplace dates at the end of their Brazil day", async () => {
    const { shipmentId } = await forwardedShipment({ hoursAgo: 5 });
    await setStatus(shipmentId, "ready");
    await database
      .update(orderShipments)
      .set({ dispatchDeadlineAt: new Date("2026-10-20T15:30:00.000Z") })
      .where(eq(orderShipments.id, shipmentId));
    const [row] = await database
      .select({ dueAt: queueDueAt })
      .from(orderShipments)
      .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
      .innerJoin(orders, eq(orders.id, orderShipments.orderId))
      .where(eq(orderShipments.id, shipmentId));
    const listed = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "ready",
      query: "",
      page: 1,
    });
    const item = listed.items.find((candidate) => candidate.id === shipmentId);
    expect(item?.deadline?.at.toISOString()).toBe("2026-10-21T03:00:00.000Z");
    expect(new Date(String(row?.dueAt)).toISOString()).toBe(item?.deadline?.at.toISOString());
  });
});

describe("a sale not released for shipping", () => {
  it("lists a cancelled sale with no deadline and only the blocked reason", async () => {
    const { shipmentId, order } = await forwardedShipment({ hoursAgo: 30 });
    await database.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    const result = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "problem",
      query: order.externalOrderId,
      page: 1,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: shipmentId,
      action: null,
      deadline: null,
      urgency: "normal",
      problems: ["order_blocked"],
    });
  });
});

describe("listSupplierHomeShipments", () => {
  it("shows both groups even when more than one page waits for acceptance", async () => {
    for (let index = 0; index < 26; index += 1) {
      await forwardedShipment({ hoursAgo: 100 + index });
    }
    const underway = await forwardedShipment();
    await setStatus(underway.shipmentId, "accepted");
    const rows = await listSupplierHomeShipments(database, supplier.supplierId, 5);
    expect(rows.filter((row) => row.status === "forwarded")).toHaveLength(5);
    expect(rows.filter((row) => row.status !== "forwarded").length).toBeGreaterThan(0);
    expect(rows.every((row) => row.orderStatus === "paid")).toBe(true);
    const other = await listSupplierHomeShipments(database, otherSupplier.supplierId, 5);
    expect(other.some((row) => rows.some((own) => own.id === row.id))).toBe(false);
  });
});

describe("finding a parcel", () => {
  it("finds it by the buyer's name, the reseller's store or the tracking code", async () => {
    const buyer = `Comprador ${randomUUID().slice(0, 6)}`;
    // A store of its own, so the search by store name finds this parcel alone.
    const ownStore = await upsertStoreConnection(
      database,
      testStoreInput(tenants.tenantA, randomUUID()),
    );
    const { shipmentId } = await forwardedShipment({ buyerName: buyer, storeId: ownStore.id });
    await database
      .update(orderShipments)
      .set({ trackingCode: `BR${shipmentId.slice(0, 8)}` })
      .where(eq(orderShipments.id, shipmentId));
    const [store] = await database
      .select({ shopName: storeConnections.shopName })
      .from(storeConnections)
      .where(eq(storeConnections.id, ownStore.id));
    const search = (query: string) =>
      listSupplierShipments(database, {
        supplierId: supplier.supplierId,
        tab: "todo",
        query,
        page: 1,
      });

    const byBuyer = await search(buyer.toLowerCase());
    const byStore = await search(store?.shopName ?? "missing");
    const byTracking = await search(`br${shipmentId.slice(0, 8)}`);

    expect(byBuyer.items.map((item) => item.id)).toEqual([shipmentId]);
    expect(byBuyer.items[0]).toMatchObject({ buyerName: buyer, shopName: store?.shopName });
    expect(byStore.items.map((item) => item.id)).toEqual([shipmentId]);
    expect(byTracking.items.map((item) => item.id)).toEqual([shipmentId]);
  });

  it("keeps only the sales of the period asked for", async () => {
    const old = await forwardedShipment({ orderedAt: new Date("2026-01-10T12:00:00Z") });

    const recent = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "todo",
      query: old.order.externalOrderId,
      page: 1,
      orderedFrom: new Date("2026-02-01T03:00:00Z"),
    });

    expect(recent.items).toHaveLength(0);
  });

  it("lists the reseller stores the supplier has parcels from, never another supplier's", async () => {
    const stores = await listSupplierResellerStores(database, otherSupplier.supplierId);

    expect(stores).toEqual([
      expect.objectContaining({ id: storeIds[tenants.tenantA], resellerId: tenants.tenantA }),
    ]);
  });

  it("lists the resellers the supplier has parcels from, never another supplier's", async () => {
    const resellers = await listSupplierResellers(database, otherSupplier.supplierId);

    expect(resellers.map((reseller) => reseller.id)).toEqual([tenants.tenantA]);
    expect(resellers[0]?.name).not.toBe("");
  });

  it("keeps only the parcels of the reseller asked for", async () => {
    const buyer = `Revenda ${randomUUID().slice(0, 6)}`;
    await forwardedShipment({ buyerName: buyer, tenantId: tenants.tenantA });
    const fromB = await forwardedShipment({ buyerName: buyer, tenantId: tenants.tenantB });

    const result = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "todo",
      query: buyer,
      page: 1,
      reseller: tenants.tenantB,
    });

    expect(result.items.map((item) => item.id)).toEqual([fromB.shipmentId]);
  });
});

async function recordPayment(shipmentId: string, status: "approved" | "refunded") {
  await database.insert(shipmentPayments).values({
    shipmentId,
    supplierId: supplier.supplierId,
    provider: "mercado_pago",
    status,
    amountCents: 1000,
    platformFeeCents: 50,
    platformFeeBasisPoints: 500,
    paidAt: new Date(),
  });
}

describe("payment filter", () => {
  it("tells parcels paid here from the refunded and the never paid", async () => {
    const buyer = `Pagamento ${randomUUID().slice(0, 6)}`;
    const paid = await forwardedShipment({ buyerName: buyer });
    const refunded = await forwardedShipment({ buyerName: buyer });
    const never = await forwardedShipment({ buyerName: buyer });
    await recordPayment(paid.shipmentId, "approved");
    await recordPayment(refunded.shipmentId, "refunded");
    const list = (payment: "paid" | "unpaid") =>
      listSupplierShipments(database, {
        supplierId: supplier.supplierId,
        tab: "todo",
        query: buyer,
        page: 1,
        payment,
      });

    const paidOnes = await list("paid");
    const unpaidOnes = await list("unpaid");
    const counts = await countSupplierShipmentsByTab(database, {
      supplierId: supplier.supplierId,
      query: buyer,
      payment: "unpaid",
    });

    expect(paidOnes.items.map((item) => item.id)).toEqual([paid.shipmentId]);
    expect(unpaidOnes.items.map((item) => item.id).toSorted()).toEqual(
      [refunded.shipmentId, never.shipmentId].toSorted(),
    );
    expect(counts.todo).toBe(2);
  });
});

async function labelRow(
  shipment: { shipmentId: string; order: { externalOrderId: string } },
  label?: "pending" | "printed" | "waiting",
) {
  const result = await listSupplierShipments(database, {
    supplierId: supplier.supplierId,
    tab: "todo",
    query: shipment.order.externalOrderId,
    page: 1,
    channel: "mercado_livre",
    label,
  });
  return result.items.find((item) => item.id === shipment.shipmentId);
}

describe("label records", () => {
  let mercadoLivreStore = "";

  beforeAll(async () => {
    mercadoLivreStore = (
      await upsertStoreConnection(database, {
        ...testStoreInput(tenants.tenantA, randomUUID()),
        marketplace: "mercado_livre",
      })
    ).id;
  });

  it("says pending until the label is emitted, then printed with how many times", async () => {
    const parcel = await forwardedShipment({ storeId: mercadoLivreStore });
    await setStatus(parcel.shipmentId, "accepted");
    const before = await labelRow(parcel, "pending");

    await recordLabelsPrinted(database, [
      { orderId: parcel.order.id, marketplaceShipmentId: "4400" },
    ]);
    await recordLabelsPrinted(database, [
      { orderId: parcel.order.id, marketplaceShipmentId: "4400" },
    ]);
    const after = await labelRow(parcel, "printed");

    expect(before?.labelState).toBe("pending");
    expect(after).toMatchObject({ labelState: "printed", labelPrintCount: 2 });
    expect(await labelRow(parcel, "pending")).toBeUndefined();
  });

  it("says waiting while the marketplace holds the label, and printed once it prints", async () => {
    const parcel = await forwardedShipment({ storeId: mercadoLivreStore });
    await recordLabelsWaiting(database, [parcel.order.id]);
    const waiting = await labelRow(parcel, "waiting");

    await recordLabelsPrinted(database, [
      { orderId: parcel.order.id, marketplaceShipmentId: "4400" },
    ]);
    await recordLabelsWaiting(database, [parcel.order.id]);
    const printed = await labelRow(parcel);

    expect(waiting?.labelState).toBe("waiting");
    expect(printed).toMatchObject({ labelState: "printed", labelWaitingSince: null });
  });

  it("gives no label state to a channel without marketplace labels", async () => {
    const { order } = await forwardedShipment();

    const result = await listSupplierShipments(database, {
      supplierId: supplier.supplierId,
      tab: "todo",
      query: order.externalOrderId,
      page: 1,
    });

    expect(result.items[0]?.labelState).toBeNull();
  });

  it("shows the store, the buyer, what the supplier receives and the label in the detail", async () => {
    const { shipmentId, order } = await forwardedShipment({
      storeId: mercadoLivreStore,
      buyerName: "Paula Ribeiro",
    });
    await recordLabelsPrinted(database, [{ orderId: order.id, marketplaceShipmentId: "4400" }]);

    const detail = await getSupplierPanelShipment(database, {
      supplierId: supplier.supplierId,
      shipmentId,
    });

    expect(detail).toMatchObject({
      buyerName: "Paula Ribeiro",
      receivableCents: 1000,
      labelState: "printed",
      labelPrintCount: 1,
    });
    expect(detail.shopName).toMatch(/^Loja /);
  });
});

describe("findSupplierShipmentsByCode", () => {
  it("finds an open parcel by its order number or its tracking code, typed with noise", async () => {
    const { shipmentId, order } = await forwardedShipment();
    await setStatus(shipmentId, "ready");
    await database
      .update(orderShipments)
      .set({ trackingCode: `SC${shipmentId.slice(0, 6).toUpperCase()}BR` })
      .where(eq(orderShipments.id, shipmentId));

    const byOrder = await findSupplierShipmentsByCode(
      database,
      supplier.supplierId,
      ` ${order.externalOrderId.toLowerCase()} `,
    );
    const byCode = await findSupplierShipmentsByCode(
      database,
      supplier.supplierId,
      `sc-${shipmentId.slice(0, 6)} br`,
    );

    expect(byOrder.map((row) => row.id)).toEqual([shipmentId]);
    expect(byCode.map((row) => row.id)).toEqual([shipmentId]);
  });

  it("never finds another supplier's parcel nor one that already left", async () => {
    const foreign = await forwardedShipment({ productId: otherSupplier.productId });
    const sent = await forwardedShipment();
    await setStatus(sent.shipmentId, "shipped");

    const other = await findSupplierShipmentsByCode(
      database,
      supplier.supplierId,
      foreign.order.externalOrderId,
    );
    const left = await findSupplierShipmentsByCode(
      database,
      supplier.supplierId,
      sent.order.externalOrderId,
    );

    expect(other).toEqual([]);
    expect(left).toEqual([]);
  });

  it("finds a parcel by the marketplace shipment id its label barcode carries", async () => {
    const { shipmentId, order } = await forwardedShipment();
    await setStatus(shipmentId, "accepted");
    const marketplaceShipmentId = String(Date.now());
    await recordLabelsPrinted(database, [{ orderId: order.id, marketplaceShipmentId }]);

    const found = await findSupplierShipmentsByCode(
      database,
      supplier.supplierId,
      marketplaceShipmentId,
    );

    expect(found.map((row) => row.id)).toEqual([shipmentId]);
  });

  it("finds nothing for an empty scan", async () => {
    expect(await findSupplierShipmentsByCode(database, supplier.supplierId, "   ")).toEqual([]);
  });
});
