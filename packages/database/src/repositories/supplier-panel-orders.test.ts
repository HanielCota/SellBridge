import { randomUUID } from "node:crypto";
import { compareQueueUrgency } from "@sellbridge/shared/supplier-panel-orders";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, orderShipments, shipmentEvents, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { noteSupplierEmailFailed } from "./auto-forward.ts";
import { forwardOrder } from "./fulfillment.ts";
import { upsertStoreConnection } from "./stores.ts";
import { getSupplierPanelShipment } from "./supplier-panel-orders-detail.ts";
import { queueDueAt } from "./supplier-panel-orders-sql.ts";
import {
  countSupplierShipmentsByTab,
  listSupplierHomeShipments,
  listSupplierShipments,
} from "./supplier-panel-orders.ts";

const HOUR = 3_600_000;
const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let otherSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
const storeIds: Record<string, string> = {};

async function forwardedShipment(
  options: { tenantId?: string; productId?: string; hoursAgo?: number; status?: string } = {},
) {
  const tenantId = options.tenantId ?? tenants.tenantA;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeIds[tenantId] ?? "",
      externalOrderId: `PED-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 5000,
      orderedAt: new Date(),
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
