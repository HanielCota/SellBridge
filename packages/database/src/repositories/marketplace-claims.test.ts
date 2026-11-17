import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { marketplaceClaims } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, testStoreInput } from "../testing/fixtures.ts";
import {
  type ClaimReading,
  findStoreOrdersForClaim,
  saveMarketplaceClaim,
} from "./marketplace-claims.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let store = { id: "", tenantId: "", marketplace: "mock" as const };
let otherStoreId = "";
let order = { orderId: "", externalOrderId: "" };

async function createOrder(storeConnectionId: string, tenantId: string, packId?: string) {
  const externalOrderId = String(Date.now()) + String(Math.floor(Math.random() * 1000));
  const { orderId } = await upsertMarketplaceOrder(database, tenantId, storeConnectionId, {
    externalOrderId,
    status: "paid",
    totalCents: 2500,
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt: new Date(),
    items: [],
    ...(packId === undefined ? {} : { packId }),
  });
  return { orderId, externalOrderId };
}

function claimReading(overrides: Partial<ClaimReading> = {}): ClaimReading {
  return {
    externalClaimId: randomUUID(),
    status: "opened",
    type: "mediations",
    stage: "claim",
    reasonId: "PNR3430",
    openedAt: new Date("2026-11-17T10:00:00.000Z"),
    marketplaceUpdatedAt: new Date("2026-11-17T10:00:00.000Z"),
    resolutionReason: null,
    closedAt: null,
    problem: "O produto não chegou",
    actionResponsible: "seller",
    actionDueAt: new Date("2026-11-19T10:00:00.000Z"),
    return: null,
    ...overrides,
  };
}

async function storedClaim(externalClaimId: string) {
  const [row] = await database
    .select()
    .from(marketplaceClaims)
    .where(eq(marketplaceClaims.externalClaimId, externalClaimId));
  return row;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  const created = await upsertStoreConnection(
    database,
    testStoreInput(tenants.tenantA, `claims-${randomUUID()}`),
  );
  store = { id: created.id, tenantId: tenants.tenantA, marketplace: "mock" };
  const other = await upsertStoreConnection(
    database,
    testStoreInput(tenants.tenantB, `claims-${randomUUID()}`),
  );
  otherStoreId = other.id;
  order = await createOrder(store.id, tenants.tenantA);
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("findStoreOrdersForClaim", () => {
  it("finds the store's order by its marketplace id", async () => {
    const found = await findStoreOrdersForClaim(database, {
      storeConnectionId: store.id,
      externalIds: [order.externalOrderId],
    });

    expect(found).toEqual([order]);
  });

  it("finds the orders of a cart by the cart id", async () => {
    const packId = `PACK-${randomUUID()}`;
    const first = await createOrder(store.id, tenants.tenantA, packId);

    const found = await findStoreOrdersForClaim(database, {
      storeConnectionId: store.id,
      externalIds: [packId],
    });

    expect(found).toEqual([first]);
  });

  it("never finds another store's order with the same id", async () => {
    const found = await findStoreOrdersForClaim(database, {
      storeConnectionId: otherStoreId,
      externalIds: [order.externalOrderId],
    });

    expect(found).toEqual([]);
  });

  it("answers nothing for no ids", async () => {
    const found = await findStoreOrdersForClaim(database, {
      storeConnectionId: store.id,
      externalIds: [],
    });

    expect(found).toEqual([]);
  });
});

describe("saveMarketplaceClaim", () => {
  it("stores a new open claim and asks for the opening notice", async () => {
    const claim = claimReading({
      return: {
        status: "shipped",
        moneyStatus: "retained",
        trackingCode: "BR123",
        destination: "seller",
      },
    });

    const result = await saveMarketplaceClaim(database, { store, order, claim });

    expect(result).toEqual({ saved: "created", moment: "opened" });
    expect(await storedClaim(claim.externalClaimId)).toMatchObject({
      tenantId: tenants.tenantA,
      orderId: order.orderId,
      status: "opened",
      reasonId: "PNR3430",
      returnStatus: "shipped",
      returnTrackingCode: "BR123",
      returnDestination: "seller",
      moneyStatus: "retained",
    });
  });

  it("asks for the mediation notice when the marketplace takes the claim over", async () => {
    const claim = claimReading();
    await saveMarketplaceClaim(database, { store, order, claim });
    const later = new Date("2026-11-18T10:00:00.000Z");

    const result = await saveMarketplaceClaim(database, {
      store,
      order,
      claim: { ...claim, stage: "dispute", marketplaceUpdatedAt: later },
    });

    expect(result).toEqual({ saved: "updated", moment: "mediation" });
  });

  it("asks for the closing notice once the claim closes", async () => {
    const claim = claimReading();
    await saveMarketplaceClaim(database, { store, order, claim });
    const later = new Date("2026-11-18T10:00:00.000Z");

    const result = await saveMarketplaceClaim(database, {
      store,
      order,
      claim: {
        ...claim,
        status: "closed",
        resolutionReason: "payment_refunded",
        marketplaceUpdatedAt: later,
      },
    });

    expect(result).toEqual({ saved: "updated", moment: "closed" });
    expect(await storedClaim(claim.externalClaimId)).toMatchObject({
      status: "closed",
      resolutionReason: "payment_refunded",
    });
  });

  it("keeps the newer reading when an older one arrives late", async () => {
    const claim = claimReading({ marketplaceUpdatedAt: new Date("2026-11-18T10:00:00.000Z") });
    await saveMarketplaceClaim(database, { store, order, claim: { ...claim, status: "closed" } });

    const result = await saveMarketplaceClaim(database, {
      store,
      order,
      claim: { ...claim, marketplaceUpdatedAt: new Date("2026-11-17T10:00:00.000Z") },
    });

    expect(result).toEqual({ saved: "stale" });
    expect((await storedClaim(claim.externalClaimId))?.status).toBe("closed");
  });

  it("stores a claim first seen already closed without any notice", async () => {
    const claim = claimReading({ status: "closed" });

    const result = await saveMarketplaceClaim(database, { store, order, claim });

    expect(result).toEqual({ saved: "created", moment: null });
  });

  it("asks for no notice when a reading repeats what is stored", async () => {
    const claim = claimReading();
    await saveMarketplaceClaim(database, { store, order, claim });

    const result = await saveMarketplaceClaim(database, { store, order, claim });

    expect(result).toEqual({ saved: "updated", moment: null });
  });
});
