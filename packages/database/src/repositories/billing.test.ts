import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { billingAccounts, billingEvents, listings, listingTargets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenantPair,
  createTestSupplierProduct,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  applyBillingEvent,
  assertBillingCapacity,
  billingUsage,
  getBillingAccount,
  saveBillingCustomer,
  tryLockBillingCheckout,
} from "./billing.ts";
import { createListingWithTargets } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";
/** A promise the test settles by hand, to hold a transaction open across concurrent calls. */
function deferred() {
  const settlers: { resolve: () => void } = { resolve: () => {} };
  const promise = new Promise<void>((resolve) => {
    settlers.resolve = resolve;
  });
  return { promise, resolve: () => settlers.resolve() };
}
const database = createTestDatabase();

/** Takes `amount` plan slots: listings live in one store, as the quota counts them. */
async function fillLiveSlots(tenantId: string, storeId: string, amount: number) {
  if (amount <= 0) return;
  const created = await database
    .insert(listings)
    .values(
      Array.from({ length: amount }, () => ({
        tenantId,
        supplierProductId: catalog.productId,
        title: "Limite",
        description: "",
        priceCents: 2500,
      })),
    )
    .returning({ id: listings.id });
  await database.insert(listingTargets).values(
    created.map((listing) => ({
      tenantId,
      listingId: listing.id,
      storeConnectionId: storeId,
      status: "published" as const,
      idempotencyKey: randomUUID(),
    })),
  );
}

async function firstStoreOf(tenantId: string) {
  const stores = await database.query.storeConnections.findMany({
    where: (store, { eq: equals }) => equals(store.tenantId, tenantId),
  });
  const store = stores[0];
  if (!store) throw new Error("missing fixture store");
  return store;
}
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
      observedAt: 20,
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
        observedAt: 10,
        status: "canceled",
      }),
    );
    expect((await getBillingAccount(database, tenants.tenantA))?.status).toBe("active");
    await database.delete(billingEvents).where(eq(billingEvents.id, oldId));
  });
  // Regression (item 16.a, N5): checkout held the organization row lock while it waited on
  // Stripe, so publishing and store connection stalled behind a payment page.
  it("serializes checkout without blocking capacity checks", async () => {
    const checkoutHeld = deferred();
    const lockTaken = deferred();
    const checkout = database.transaction(async (transaction) => {
      const locked = await tryLockBillingCheckout(transaction, tenants.tenantA);
      lockTaken.resolve();
      await checkoutHeld.promise;
      return locked;
    });
    await lockTaken.promise;
    const second = await database.transaction(async (transaction) =>
      tryLockBillingCheckout(transaction, tenants.tenantA),
    );
    const otherTenant = await database.transaction(async (transaction) =>
      tryLockBillingCheckout(transaction, tenants.tenantB),
    );
    const capacity = async () => {
      await database.transaction(async (transaction) =>
        assertBillingCapacity(transaction, tenants.tenantA, "listings", 0),
      );
      return "checked";
    };
    const outcome = await Promise.race([
      capacity(),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 2_000)),
    ]);
    checkoutHeld.resolve();
    expect(await checkout).toBe(true);
    expect(second).toBe(false);
    expect(otherTenant).toBe(true);
    expect(outcome).toBe("checked");
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
  // past_due keeps the plan through the grace (item 16, N9); an unpaid subscription does not.
  it("revoked paid access falls back to free capacity", async () => {
    await database
      .update(billingAccounts)
      .set({ status: "unpaid" })
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
    const store = await firstStoreOf(tenants.tenantB);
    await fillLiveSlots(tenants.tenantB, store.id, 24);
    const products = await Promise.all(
      ["RACE-1", "RACE-2"].map(async (sku) =>
        createTestSupplierProduct(database, {
          sku,
          title: "Corrida",
          costCents: 1000,
          suggestedPriceCents: 2500,
        }),
      ),
    );
    const outcomes = await Promise.allSettled(
      products.map(async (product) =>
        createListingWithTargets(
          database,
          tenants.tenantB,
          {
            supplierProductId: product.productId,
            title: "Limite",
            description: "",
            priceCents: 2500,
            billingEnabled: true,
          },
          [store.id],
        ),
      ),
    );
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "FORBIDDEN" });
    await database.delete(listings).where(eq(listings.tenantId, tenants.tenantB));
    await Promise.all(products.map(async (product) => product.cleanup()));
  });

  // Regression: a batch was checked one listing at a time, so 10 products on a plan with room for
  // one published the first and failed on the second.
  it("refuses a whole batch that does not fit the plan, and admits one that fits exactly", async () => {
    const store = await firstStoreOf(tenants.tenantA);
    const usage = await billingUsage(database, tenants.tenantA);
    await fillLiveSlots(tenants.tenantA, store.id, 23 - usage.listings);
    await expect(
      assertBillingCapacity(database, tenants.tenantA, "listings", 2),
    ).resolves.toBeUndefined();
    await expect(assertBillingCapacity(database, tenants.tenantA, "listings", 3)).rejects.toThrow(
      "Limite do plano",
    );
  });

  // Last: it moves tenant A's newest observation past 2038, so no earlier state applies after it.
  // Regression: `last_event_created` was int4; it now holds milliseconds, far past 2_147_483_647.
  it("stores an observation time in milliseconds after 2038", async () => {
    const observedAt = Date.UTC(2040, 0, 1);
    const lateEventId = `evt_${randomUUID()}`;
    await database.transaction(async (transaction) =>
      applyBillingEvent(transaction, {
        eventId: lateEventId,
        observedAt,
        customerId,
        subscriptionId: "sub_test",
        plan: "pro",
        status: "active",
        periodEnd: new Date(Date.now() + 86400000),
        cancelAtPeriodEnd: false,
      }),
    );
    expect((await getBillingAccount(database, tenants.tenantA))?.lastEventCreated).toBe(observedAt);
    await database.delete(billingEvents).where(eq(billingEvents.id, lateEventId));
  });
});
