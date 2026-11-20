import { randomUUID } from "node:crypto";
import { billingPlan } from "@sellbridge/shared/billing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  billingAccounts,
  billingEvents,
  listings,
  listingTargets,
  organization,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenantPair,
  createTestTenants,
  createTestSupplierProduct,
  grantTestPlan,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  applyBillingState,
  assertBillingCapacity,
  billingUsage,
  findBillingAccountByPendingReference,
  findBillingAccountBySubscription,
  getBillingAccount,
  saveBillingAccount,
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
const RULES = { transition: null };
const START = billingPlan("start");
const DAY = 86_400_000;

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
/** A tenant created at the given moment, before or after the launch of the plans. */
async function accountCreatedAt(createdAt: Date) {
  const created = await createTestTenants(database, 1);
  const [tenantId] = created.ids;
  if (tenantId === undefined) throw new Error("missing fixture tenant");
  await database.update(organization).set({ createdAt }).where(eq(organization.id, tenantId));
  return { tenantId, cleanup: created.cleanup };
}

let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
const customerId = `cus_${randomUUID()}`;
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
  await database.$client.end();
});
describe("tenant billing persistence", () => {
  it("isolates customer and subscription data", async () => {
    await saveBillingAccount(database, tenants.tenantA, { customerId });
    expect((await getBillingAccount(database, tenants.tenantA))?.customerId).toBe(customerId);
    expect(await getBillingAccount(database, tenants.tenantB)).toBeNull();
  });
  // Regression (item 16.a, N5): checkout held the organization row lock while it waited on
  // the payment provider, so publishing and store connection stalled behind a payment page.
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
        assertBillingCapacity(transaction, {
          tenantId: tenants.tenantA,
          rules: RULES,
          resource: "listings",
          requested: 0,
        }),
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
  it("enforces store limits atomically across concurrent requests", async () => {
    await grantTestPlan(database, tenants.tenantB, "start");
    const results = await Promise.allSettled(
      Array.from({ length: START.stores + 1 }, async (_, index) =>
        upsertStoreConnection(database, {
          ...testStoreInput(tenants.tenantB, `billing-${index}`),
          billing: RULES,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(START.stores);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
  it("permits reconnecting an existing store at capacity", async () => {
    const connection = { ...testStoreInput(tenants.tenantB, "billing-0"), billing: RULES };
    // The scheduler may choose any of the concurrent stores; query an actual active shop.
    const stores = await database.query.storeConnections.findMany({
      where: (store, { eq: equals }) => equals(store.tenantId, tenants.tenantB),
    });
    const store = stores[0];
    if (!store) throw new Error("missing fixture store");
    await expect(
      upsertStoreConnection(database, { ...connection, externalShopId: store.externalShopId }),
    ).resolves.toMatchObject({ id: store.id });
  });
  // past_due keeps the plan through the grace (item 16, N9); an unpaid subscription does not,
  // and there is no free plan to fall back to.
  it("leaves no room for a new store once the subscription is unpaid", async () => {
    await upsertStoreConnection(database, {
      ...testStoreInput(tenants.tenantA, "paid-a"),
      billing: RULES,
    });
    await database
      .update(billingAccounts)
      .set({ status: "unpaid" })
      .where(eq(billingAccounts.tenantId, tenants.tenantA));
    await expect(
      upsertStoreConnection(database, {
        ...testStoreInput(tenants.tenantA, "unpaid-b"),
        billing: RULES,
      }),
    ).rejects.toThrow("Para conectar lojas, escolha um plano em Assinatura.");
  });
  it("cannot exceed listing capacity through simultaneous app/API creates", async () => {
    const store = await firstStoreOf(tenants.tenantB);
    await fillLiveSlots(tenants.tenantB, store.id, START.listings - 1);
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
            billing: RULES,
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
    const store = await firstStoreOf(tenants.tenantB);
    const usage = await billingUsage(database, tenants.tenantB);
    await fillLiveSlots(tenants.tenantB, store.id, START.listings - 2 - usage.listings);
    const batch = async (requested: number) =>
      assertBillingCapacity(database, {
        tenantId: tenants.tenantB,
        rules: RULES,
        resource: "listings",
        requested,
      });
    await expect(batch(2)).resolves.toBeUndefined();
    await expect(batch(3)).rejects.toThrow(
      "Limite do plano Start atingido. Para publicar anúncios, mude para um plano maior em Assinatura.",
    );
    await database.delete(listings).where(eq(listings.tenantId, tenants.tenantB));
  });

  describe("without a plan", () => {
    const launchedAt = new Date(Date.now() - DAY);
    const transition = { launchedAt, endsAt: new Date(Date.now() + DAY) };

    it("refuses the first store of a new account, with no free plan", async () => {
      const account = await accountCreatedAt(new Date());
      await expect(
        upsertStoreConnection(database, {
          ...testStoreInput(account.tenantId, "first-store"),
          billing: { transition },
        }),
      ).rejects.toThrow("Para conectar lojas, escolha um plano em Assinatura.");
      await account.cleanup();
    });

    it("keeps an account from before the launch unlimited during the transition", async () => {
      const account = await accountCreatedAt(new Date(launchedAt.getTime() - DAY));
      for (const index of Array.from({ length: START.stores + 1 }, (_, position) => position)) {
        await upsertStoreConnection(database, {
          ...testStoreInput(account.tenantId, `transition-${index}`),
          billing: { transition },
        });
      }
      expect((await billingUsage(database, account.tenantId)).stores).toBe(START.stores + 1);
      await account.cleanup();
    });

    it("blocks an account from before the launch once the transition is over", async () => {
      const account = await accountCreatedAt(new Date(launchedAt.getTime() - DAY));
      const ended = { launchedAt, endsAt: new Date(Date.now() - 1_000) };
      await expect(
        upsertStoreConnection(database, {
          ...testStoreInput(account.tenantId, "after-transition"),
          billing: { transition: ended },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await account.cleanup();
    });
  });

  // Last: it moves tenant A's newest observation past 2038, so no earlier state applies after it.
  // Regression: `last_event_created` was int4; it now holds milliseconds, far past 2_147_483_647.
  it("stores an observation time in milliseconds after 2038", async () => {
    const observedAt = Date.UTC(2040, 0, 1);
    const lateEventId = `evt_${randomUUID()}`;
    await applyBillingState(database, {
      tenantId: tenants.tenantA,
      eventId: lateEventId,
      observedAt,
      patch: { plan: "pro", status: "active", periodEnd: new Date(Date.now() + 86400000) },
    });
    expect((await getBillingAccount(database, tenants.tenantA))?.lastEventCreated).toBe(observedAt);
    await database.delete(billingEvents).where(eq(billingEvents.id, lateEventId));
  });
});

describe("subscription state from the provider", () => {
  it("applies a notice once and never lets an older read win", async () => {
    const { tenantId, cleanup } = await accountCreatedAt(new Date());
    const notice = `evt_${randomUUID()}`;
    await saveBillingAccount(database, tenantId, { subscriptionId: `sub_${randomUUID()}` });

    const applied = await applyBillingState(database, {
      tenantId,
      eventId: notice,
      observedAt: 20,
      patch: { status: "active", plan: "pro" },
    });
    const repeated = await applyBillingState(database, {
      tenantId,
      eventId: notice,
      observedAt: 30,
      patch: { status: "past_due" },
    });
    const older = await applyBillingState(database, {
      tenantId,
      eventId: null,
      observedAt: 10,
      patch: { status: "canceled" },
    });

    expect([applied, repeated, older]).toEqual([true, false, false]);
    expect((await getBillingAccount(database, tenantId))?.status).toBe("active");
    await database.delete(billingEvents).where(eq(billingEvents.id, notice));
    await cleanup();
  });

  it("finds the account by its subscription and by what it waits on", async () => {
    const { tenantId, cleanup } = await accountCreatedAt(new Date());
    const subscriptionId = `sub_${randomUUID()}`;
    const checkoutId = randomUUID();

    await saveBillingAccount(database, tenantId, {
      subscriptionId,
      pendingPlan: "elite",
      pendingReference: checkoutId,
    });

    expect((await findBillingAccountBySubscription(database, subscriptionId))?.tenantId).toBe(
      tenantId,
    );
    expect((await findBillingAccountByPendingReference(database, checkoutId))?.pendingPlan).toBe(
      "elite",
    );
    await cleanup();
  });

  it("refuses a scheduled plan without the day it starts", async () => {
    const { tenantId, cleanup } = await accountCreatedAt(new Date());

    await expect(
      saveBillingAccount(database, tenantId, { scheduledPlan: "pro", scheduledPlanAt: null }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint_name: "billing_accounts_scheduled_plan_check" }),
    });
    await cleanup();
  });
});
