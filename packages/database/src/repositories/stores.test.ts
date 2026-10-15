import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeConnections } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, testStoreInput } from "../testing/fixtures.ts";
import {
  consumeOAuthState,
  createOAuthState,
  disconnectStore,
  findConnectedStores,
  listStoreConnections,
  markStoreStatus,
  recordStoreError,
  updateStoreTokens,
  upsertStoreConnection,
} from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let tenantA = "";
let tenantB = "";
let storeA = "";
let storeB = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  storeA = (await upsertStoreConnection(database, testStoreInput(tenantA, `shop-a-${tenantA}`))).id;
  storeB = (await upsertStoreConnection(database, testStoreInput(tenantB, `shop-b-${tenantB}`))).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("store connections are tenant-scoped", () => {
  it("lists only the tenant's stores", async () => {
    const storesOfA = await listStoreConnections(database, tenantA);
    expect(storesOfA.map((store) => store.id)).toEqual([storeA]);
  });

  it("does not disconnect another tenant's store", async () => {
    await expect(disconnectStore(database, tenantA, storeB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const storesOfB = await listStoreConnections(database, tenantB);
    expect(storesOfB.map((store) => store.status)).toEqual(["connected"]);
  });

  it("findConnectedStores ignores stores of other tenants", async () => {
    const found = await findConnectedStores(database, tenantA, [storeA, storeB]);
    expect(found.map((store) => store.id)).toEqual([storeA]);
  });

  it("refuses a shop already connected to another organization, until it disconnects there", async () => {
    const shopId = `shop-a-${tenantA}`;
    await expect(
      upsertStoreConnection(database, testStoreInput(tenantB, shopId)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const otherShop = `shared-${tenantA}`;
    const first = await upsertStoreConnection(database, testStoreInput(tenantA, otherShop));
    await disconnectStore(database, tenantA, first.id);
    const second = await upsertStoreConnection(database, testStoreInput(tenantB, otherShop));
    expect(second.id).not.toBe(first.id);
  });

  it("refuses with a conflict the organization that loses a race for the same shop", async () => {
    const shopId = `race-${tenantA}`;
    const rival = createTestDatabase();
    const released = signal();
    const rivalInserted = signal();
    // The rival's row is written but not committed: the check of tenant A cannot see it yet,
    // so tenant A only finds out when its own insert hits the unique index.
    const rivalTransaction = rival.transaction(async (transaction) => {
      await transaction.insert(storeConnections).values(testStoreInput(tenantB, shopId));
      rivalInserted.fire();
      await released.promise;
    });
    try {
      await rivalInserted.promise;
      const outcome = settle(upsertStoreConnection(database, testStoreInput(tenantA, shopId)));
      await waitForLockWait();
      released.fire();
      await rivalTransaction;
      expect(await outcome).toMatchObject({ code: "CONFLICT" });
    } finally {
      released.fire();
      await settle(rivalTransaction);
      await rival.$client.end();
    }
  });

  it("reconnecting the same shop reuses the connection", async () => {
    const again = await upsertStoreConnection(
      database,
      testStoreInput(tenantA, `shop-a-${tenantA}`),
    );
    expect(again.id).toBe(storeA);
  });

  it("disconnected stores are hidden and cannot receive listings", async () => {
    const extra = await upsertStoreConnection(
      database,
      testStoreInput(tenantA, `shop-extra-${tenantA}`),
    );
    await disconnectStore(database, tenantA, extra.id);
    expect((await listStoreConnections(database, tenantA)).map((store) => store.id)).not.toContain(
      extra.id,
    );
    expect(await findConnectedStores(database, tenantA, [extra.id])).toEqual([]);
  });
});

describe("oauth state", () => {
  it("is single use and bound to tenant and marketplace", async () => {
    const state = `state-${tenantA}`;
    await createOAuthState(database, {
      state,
      tenantId: tenantA,
      marketplace: "mock",
      codeVerifier: null,
      ttlMilliseconds: 60_000,
    });
    expect(
      await consumeOAuthState(database, { state, tenantId: tenantA, marketplace: "mock" }),
    ).toEqual({
      codeVerifier: null,
      supplierId: null,
    });
    expect(
      await consumeOAuthState(database, { state, tenantId: tenantA, marketplace: "mock" }),
    ).toBeNull();
  });

  it("rejects another tenant and expired states", async () => {
    await createOAuthState(database, {
      state: `other-${tenantA}`,
      tenantId: tenantA,
      marketplace: "mock",
      codeVerifier: null,
      ttlMilliseconds: 60_000,
    });
    expect(
      await consumeOAuthState(database, {
        state: `other-${tenantA}`,
        tenantId: tenantB,
        marketplace: "mock",
      }),
    ).toBeNull();

    await createOAuthState(database, {
      state: `expired-${tenantA}`,
      tenantId: tenantA,
      marketplace: "mock",
      codeVerifier: null,
      ttlMilliseconds: -1000,
    });
    expect(
      await consumeOAuthState(database, {
        state: `expired-${tenantA}`,
        tenantId: tenantA,
        marketplace: "mock",
      }),
    ).toBeNull();
  });
});

async function storeRow(storeConnectionId: string) {
  const [row] = await database
    .select({
      status: storeConnections.status,
      accessTokenEnc: storeConnections.accessTokenEnc,
      refreshTokenEnc: storeConnections.refreshTokenEnc,
      lastError: storeConnections.lastError,
    })
    .from(storeConnections)
    .where(eq(storeConnections.id, storeConnectionId));
  return row;
}

async function connectShop(shopId: string) {
  return (await upsertStoreConnection(database, testStoreInput(tenantA, shopId))).id;
}

const rotatedTokens = {
  accessTokenEnc: "enc-access-new",
  refreshTokenEnc: "enc-refresh-new",
  expiresAt: new Date(Date.now() + 6 * 3_600_000),
};

describe("token refresh compare-and-swap", () => {
  it("rotates the tokens while the refresh token is unchanged", async () => {
    const storeId = await connectShop(`shop-rotate-${tenantA}`);
    await recordStoreError(database, storeId, "Instabilidade");
    const swapped = await updateStoreTokens(database, {
      storeConnectionId: storeId,
      previousRefreshTokenEnc: "enc-refresh",
      tokens: rotatedTokens,
    });
    expect(swapped).toBe(true);
    expect(await storeRow(storeId)).toEqual({
      status: "connected",
      accessTokenEnc: "enc-access-new",
      refreshTokenEnc: "enc-refresh-new",
      lastError: null,
    });
  });

  it("does not reconnect a store the seller disconnected during the refresh", async () => {
    const storeId = await connectShop(`shop-gone-${tenantA}`);
    await disconnectStore(database, tenantA, storeId);
    const swapped = await updateStoreTokens(database, {
      storeConnectionId: storeId,
      previousRefreshTokenEnc: "enc-refresh",
      tokens: rotatedTokens,
    });
    expect(swapped).toBe(false);
    expect(await storeRow(storeId)).toMatchObject({ status: "disconnected", accessTokenEnc: null });
  });

  it("keeps the tokens of a reconnection made during the refresh", async () => {
    const storeId = await connectShop(`shop-again-${tenantA}`);
    await database
      .update(storeConnections)
      .set({ refreshTokenEnc: "enc-refresh-oauth" })
      .where(eq(storeConnections.id, storeId));
    const swapped = await updateStoreTokens(database, {
      storeConnectionId: storeId,
      previousRefreshTokenEnc: "enc-refresh",
      tokens: rotatedTokens,
    });
    expect(swapped).toBe(false);
    expect(await storeRow(storeId)).toMatchObject({ refreshTokenEnc: "enc-refresh-oauth" });
  });

  it("does not expire a store over a refresh token already replaced", async () => {
    const storeId = await connectShop(`shop-stale-${tenantA}`);
    const change = {
      storeConnectionId: storeId,
      status: "expired" as const,
      lastError: "Revogado",
    };
    expect(await markStoreStatus(database, { ...change, refreshTokenEnc: "enc-old" })).toBe(false);
    expect(await storeRow(storeId)).toMatchObject({ status: "connected" });
    expect(await markStoreStatus(database, { ...change, refreshTokenEnc: "enc-refresh" })).toBe(
      true,
    );
    expect(await storeRow(storeId)).toMatchObject({ status: "expired", lastError: "Revogado" });
  });

  it("never marks a disconnected store as expired", async () => {
    const storeId = await connectShop(`shop-off-${tenantA}`);
    await disconnectStore(database, tenantA, storeId);
    const changed = await markStoreStatus(database, {
      storeConnectionId: storeId,
      status: "expired",
      lastError: "Revogado",
    });
    expect(changed).toBe(false);
    expect(await storeRow(storeId)).toMatchObject({ status: "disconnected" });
  });
});

async function settle(attempt: Promise<unknown>): Promise<unknown> {
  try {
    await attempt;
    return { code: "CONNECTED" };
  } catch (error) {
    return error;
  }
}

/** Waits until some insert into store_connections is blocked on a row lock (the unique index). */
async function waitForLockWait(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await database.execute(sql`
      select 1 from pg_stat_activity
      where wait_event_type = 'Lock' and query ilike 'insert into "store_connections"%'`);
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("o insert concorrente nunca esperou pelo índice único");
}

function doNothing(): void {}

/** A promise the test settles by hand, to order steps across two connections. */
function signal(): { promise: Promise<void>; fire: () => void } {
  const handle = { resolve: doNothing };
  const promise = new Promise<void>((resolve) => {
    handle.resolve = resolve;
  });
  return { promise, fire: () => handle.resolve() };
}
