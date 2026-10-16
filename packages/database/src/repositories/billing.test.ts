import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { billingAccounts, billingEvents, listings } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenantPair,
  createTestSupplierProduct,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  applyBillingEvent,
  assertBillingCapacity,
  getBillingAccount,
  saveBillingCustomer,
} from "./billing.ts";
import { createListingWithTargets } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";
const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
const customerId = `cus_${randomUUID()}`;
const eventId = `evt_${randomUUID()}`;
beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  catalog = await createTestSupplierProduct(database, {
    sku: "BILLING",
    title: "Limite",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
});
afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.delete(billingEvents).where(eq(billingEvents.id, eventId));
  await database.$client.end();
});
describe("tenant billing persistence", () => {
  it("isolates customer and subscription data", async () => {
    await saveBillingCustomer(database, tenants.tenantA, customerId);
    expect((await getBillingAccount(database, tenants.tenantA))?.customerId).toBe(customerId);
    expect(await getBillingAccount(database, tenants.tenantB)).toBeNull();
  });
  it("deduplicates delivery and rejects older events", async () => {
    const input = {
      eventId,
      eventCreated: 20,
      customerId,
      subscriptionId: "sub_test",
      plan: "pro",
      status: "active",
      periodEnd: new Date(Date.now() + 86400000),
      cancelAtPeriodEnd: false,
    };
    await database.transaction(async (transaction) => applyBillingEvent(transaction, input));
    await database.transaction(async (transaction) =>
      applyBillingEvent(transaction, { ...input, status: "canceled" }),
    );
    expect((await getBillingAccount(database, tenants.tenantA))?.status).toBe("active");
    const oldId = `evt_${randomUUID()}`;
    await database.transaction(async (transaction) =>
      applyBillingEvent(transaction, {
        ...input,
        eventId: oldId,
        eventCreated: 10,
        status: "canceled",
      }),
    );
    expect((await getBillingAccount(database, tenants.tenantA))?.status).toBe("active");
    await database.delete(billingEvents).where(eq(billingEvents.id, oldId));
  });
  it("enforces free store limits atomically across concurrent requests", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, (_, index) =>
        upsertStoreConnection(database, {
          ...testStoreInput(tenants.tenantB, `billing-${index}`),
          billingEnabled: true,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
  it("permits reconnecting an existing store at capacity", async () => {
    const connection = { ...testStoreInput(tenants.tenantB, "billing-0"), billingEnabled: true };
    // The scheduler may choose any two of the three concurrent stores; query an actual active shop.
    const stores = await database.query.storeConnections.findMany({
      where: (store, { eq: equals }) => equals(store.tenantId, tenants.tenantB),
    });
    const store = stores[0];
    if (!store) throw new Error("missing fixture store");
    await expect(
      upsertStoreConnection(database, { ...connection, externalShopId: store.externalShopId }),
    ).resolves.toMatchObject({ id: store.id });
  });
  it("revoked paid access falls back to free capacity", async () => {
    await database
      .update(billingAccounts)
      .set({ status: "past_due" })
      .where(eq(billingAccounts.tenantId, tenants.tenantA));
    await upsertStoreConnection(database, {
      ...testStoreInput(tenants.tenantA, "free-a"),
      billingEnabled: true,
    });
    await upsertStoreConnection(database, {
      ...testStoreInput(tenants.tenantA, "free-b"),
      billingEnabled: true,
    });
    await expect(
      upsertStoreConnection(database, {
        ...testStoreInput(tenants.tenantA, "free-c"),
        billingEnabled: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("cannot exceed listing capacity through simultaneous app/API creates", async () => {
    const values = {
      tenantId: tenants.tenantB,
      supplierProductId: catalog.productId,
      title: "Limite",
      description: "",
      priceCents: 2500,
    };
    await database.insert(listings).values(Array.from({ length: 24 }, () => values));
    const stores = await database.query.storeConnections.findMany({
      where: (store, { eq: equals }) => equals(store.tenantId, tenants.tenantB),
    });
    const store = stores[0];
    if (!store) throw new Error("missing fixture store");
    const outcomes = await Promise.allSettled(
      [0, 1].map(async () =>
        createListingWithTargets(database, tenants.tenantB, { ...values, billingEnabled: true }, [
          store.id,
        ]),
      ),
    );
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  // Regression: a batch was checked one listing at a time, so 10 products on a plan with room for
  // one published the first and failed on the second.
  it("refuses a whole batch that does not fit the plan, and admits one that fits exactly", async () => {
    const [existing] = await database
      .select({ total: count() })
      .from(listings)
      .where(eq(listings.tenantId, tenants.tenantA));
    const missing = 23 - (existing?.total ?? 0);
    if (missing > 0) {
      await database.insert(listings).values(
        Array.from({ length: missing }, () => ({
          tenantId: tenants.tenantA,
          supplierProductId: catalog.productId,
          title: "Limite",
          description: "",
          priceCents: 2500,
        })),
      );
    }
    await expect(
      assertBillingCapacity(database, tenants.tenantA, "listings", 2),
    ).resolves.toBeUndefined();
    await expect(assertBillingCapacity(database, tenants.tenantA, "listings", 3)).rejects.toThrow(
      "Limite do plano",
    );
  });

  // Last: it moves tenant A's newest event past 2038, so no earlier event applies after it.
  // Regression: `last_event_created` was int4, and Stripe's `created` (Unix seconds) passes
  // 2_147_483_647 on 2038-01-19, failing every webhook with "integer out of range".
  it("stores a Stripe event created after 2038", async () => {
    const eventCreated = 2_200_000_000;
    const lateEventId = `evt_${randomUUID()}`;
    await database.transaction(async (transaction) =>
      applyBillingEvent(transaction, {
        eventId: lateEventId,
        eventCreated,
        customerId,
        subscriptionId: "sub_test",
        plan: "pro",
        status: "active",
        periodEnd: new Date(Date.now() + 86400000),
        cancelAtPeriodEnd: false,
      }),
    );
    expect((await getBillingAccount(database, tenants.tenantA))?.lastEventCreated).toBe(
      eventCreated,
    );
    await database.delete(billingEvents).where(eq(billingEvents.id, lateEventId));
  });
});
