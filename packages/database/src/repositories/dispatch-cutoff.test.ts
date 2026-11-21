import { randomUUID } from "node:crypto";
import { cutoffPostingDay, DEFAULT_CUTOFF_MINUTES } from "@sellbridge/shared/dispatch-cutoff";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, orderShipments, shipmentEvents, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { getDispatchCutoffSettings, setDispatchCutoffSettings } from "./dispatch-cutoff.ts";
import { forwardOrder } from "./fulfillment.ts";
import { effectiveDispatchDeadlineAt } from "./shipment-timing.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantId = "";
let userId = "";
let storeId = "";
const cleanups: (() => Promise<void>)[] = [];

const LONG_AGO = new Date("2020-01-01T00:00:00Z");
const CUTOFFS = {
  mercadoLivre: DEFAULT_CUTOFF_MINUTES.mercado_livre,
  shopee: DEFAULT_CUTOFF_MINUTES.shopee,
  tiktokShop: DEFAULT_CUTOFF_MINUTES.tiktok_shop,
};

async function turnCutoff(enabled: boolean, now: Date = LONG_AGO) {
  return setDispatchCutoffSettings(database, { enabled, ...CUTOFFS, userId, now });
}

/** A parcel of a public supplier, forwarded (and created) at `forwardedAt`. */
async function forwardedParcel(forwardedAt: Date): Promise<string> {
  const created = await createTestSupplierProduct(database, {
    sku: `CUT-${randomUUID().slice(0, 8)}`,
    title: "Camiseta",
    costCents: 3000,
    suggestedPriceCents: 5000,
    stock: 5,
  });
  cleanups.push(created.cleanup);
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeId,
      externalOrderId: randomUUID(),
      status: "paid",
      totalCents: 10_000,
      orderedAt: forwardedAt,
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: created.productId,
    title: "Camiseta",
    quantity: 1,
    unitPriceCents: 5000,
    unitCostCents: 3000,
  });
  await forwardOrder(database, tenantId, { orderId: order.id, address: testAddress, notes: "" });
  const [shipment] = await database
    .update(orderShipments)
    .set({ createdAt: forwardedAt })
    .where(eq(orderShipments.orderId, order.id))
    .returning({ id: orderShipments.id });
  if (shipment === undefined) throw new Error("No shipment");
  await database
    .update(shipmentEvents)
    .set({ createdAt: forwardedAt })
    .where(eq(shipmentEvents.shipmentId, shipment.id));
  return shipment.id;
}

async function postingDateOf(shipmentId: string): Promise<Date | null> {
  const [row] = await database
    .select({ date: effectiveDispatchDeadlineAt })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(eq(orderShipments.id, shipmentId));
  if (row === undefined) throw new Error("No parcel");
  return row.date;
}

function midnightInBrasilia(day: string): Date {
  return new Date(`${day}T00:00:00-03:00`);
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  users = await createTestUsers(database, 1);
  tenantId = tenants.ids[0] ?? "";
  userId = users.ids[0] ?? "";
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenantId, `cut-${tenantId}`),
    marketplace: "mercado_livre",
  });
  storeId = store.id;
});

afterEach(async () => {
  await turnCutoff(false);
});

afterAll(async () => {
  await tenants.cleanup();
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await users.cleanup();
  await database.$client.end();
});

describe("setDispatchCutoffSettings", () => {
  it("keeps the instant the rule was first turned on when only the times change", async () => {
    const first = await turnCutoff(true, new Date("2026-11-01T12:00:00Z"));

    const second = await setDispatchCutoffSettings(database, {
      enabled: true,
      mercadoLivre: 900,
      shopee: 780,
      tiktokShop: 1080,
      userId,
      now: new Date("2026-11-10T12:00:00Z"),
    });

    expect(second.since).toEqual(first.since);
    expect(await getDispatchCutoffSettings(database)).toEqual(second);
  });

  it("clears the instant when turned off", async () => {
    await turnCutoff(true);

    const off = await turnCutoff(false);

    expect(off.since).toBeNull();
  });
});

describe("posting date from the cutoff", () => {
  it("is the same business day for a sale before the Mercado Livre cutoff", async () => {
    await turnCutoff(true);
    const tuesdayMorning = new Date("2026-11-17T10:00:00-03:00");
    const shipmentId = await forwardedParcel(tuesdayMorning);

    const date = await postingDateOf(shipmentId);

    expect(date).toEqual(midnightInBrasilia("2026-11-17"));
  });

  it("counts a sale exactly at the cutoff for the next business day", async () => {
    await turnCutoff(true);
    const tuesdayAtCutoff = new Date("2026-11-17T14:30:00-03:00");
    const shipmentId = await forwardedParcel(tuesdayAtCutoff);

    const date = await postingDateOf(shipmentId);

    expect(date).toEqual(midnightInBrasilia("2026-11-18"));
  });

  it("skips the holiday and the weekend, agreeing with the shared rule", async () => {
    await turnCutoff(true);
    const thursdayAfternoon = new Date("2026-11-19T16:00:00-03:00");
    const shipmentId = await forwardedParcel(thursdayAfternoon);

    const date = await postingDateOf(shipmentId);

    const expected = cutoffPostingDay(thursdayAfternoon, CUTOFFS.mercadoLivre);
    expect(expected).toBe("2026-11-23");
    expect(date).toEqual(midnightInBrasilia(expected));
  });

  it("moves a sale on the Saturday before Carnaval to Ash Wednesday", async () => {
    await turnCutoff(true);
    const saturday = new Date("2026-02-14T09:00:00-03:00");
    const shipmentId = await forwardedParcel(saturday);

    const date = await postingDateOf(shipmentId);

    expect(date).toEqual(midnightInBrasilia("2026-02-18"));
  });

  it("gives no date while the rule is off", async () => {
    const shipmentId = await forwardedParcel(new Date("2026-11-17T10:00:00-03:00"));

    const date = await postingDateOf(shipmentId);

    expect(date).toBeNull();
  });

  it("gives no date to a parcel created before the rule was turned on", async () => {
    await turnCutoff(true, new Date("2026-11-18T00:00:00-03:00"));
    const shipmentId = await forwardedParcel(new Date("2026-11-17T10:00:00-03:00"));

    const date = await postingDateOf(shipmentId);

    expect(date).toBeNull();
  });

  it("keeps the marketplace's own date when it sent one", async () => {
    await turnCutoff(true);
    const shipmentId = await forwardedParcel(new Date("2026-11-17T10:00:00-03:00"));
    const marketplaceDate = midnightInBrasilia("2026-11-19");
    await database
      .update(orderShipments)
      .set({ dispatchDeadlineAt: marketplaceDate })
      .where(eq(orderShipments.id, shipmentId));

    const date = await postingDateOf(shipmentId);

    expect(date).toEqual(marketplaceDate);
  });

  it("gives no date to a Mercado Livre Full parcel, which the supplier does not post", async () => {
    await turnCutoff(true);
    const shipmentId = await forwardedParcel(new Date("2026-11-17T10:00:00-03:00"));
    await database
      .update(orderShipments)
      .set({ marketplaceLogisticType: "fulfillment" })
      .where(eq(orderShipments.id, shipmentId));

    const date = await postingDateOf(shipmentId);

    expect(date).toBeNull();
  });
});
