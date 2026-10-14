import { eq } from "drizzle-orm";
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
