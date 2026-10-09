import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createTestTenantPair, testStoreInput } from "../testing/fixtures.ts";
import {
  consumeOAuthState,
  createOAuthState,
  disconnectStore,
  findConnectedStores,
  listStoreConnections,
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
