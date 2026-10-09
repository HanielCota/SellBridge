import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import {
  createListingWithTargets,
  listListingTargets,
  markTargetFailed,
  resetTargetForRetry,
} from "./listings.ts";
import {
  consumeOAuthState,
  createOAuthState,
  disconnectStore,
  findConnectedStores,
  getStoreConnection,
  listStoreConnections,
  upsertStoreConnection,
} from "./stores.ts";
import { getStoreActivity } from "./store-activity.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantA = "";
let tenantB = "";
let storeA = "";
let storeB = "";
let supplierId = "";
let productId = "";

function storeInput(tenantId: string, shopId: string) {
  return {
    tenantId,
    marketplace: "mock" as const,
    externalShopId: shopId,
    shopName: `Loja ${shopId}`,
    accessTokenEnc: "enc-access",
    refreshTokenEnc: "enc-refresh",
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  const [first, second] = tenants.ids;
  if (!first || !second) {
    throw new Error("tenants não criados");
  }
  tenantA = first;
  tenantB = second;
  storeA = (await upsertStoreConnection(database, storeInput(tenantA, `shop-a-${tenantA}`))).id;
  storeB = (await upsertStoreConnection(database, storeInput(tenantB, `shop-b-${tenantB}`))).id;
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: "Fornecedor isolamento", niche: "Teste", state: "ZZ", city: "X" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor não criado");
  }
  supplierId = supplier.id;
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: "ISO-1",
      title: "Produto isolamento",
      costCents: 1000,
      suggestedPriceCents: 2500,
    })
    .returning();
  if (!product) {
    throw new Error("produto não criado");
  }
  productId = product.id;
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

describe("store connections are tenant-scoped", () => {
  it("lists only the tenant's stores", async () => {
    const storesOfA = await listStoreConnections(database, tenantA);
    expect(storesOfA.map((store) => store.id)).toEqual([storeA]);
  });

  it("does not load or disconnect another tenant's store", async () => {
    await expect(getStoreConnection(database, tenantA, storeB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(disconnectStore(database, tenantA, storeB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await getStoreConnection(database, tenantB, storeB)).status).toBe("connected");
  });

  it("findConnectedStores ignores stores of other tenants", async () => {
    const found = await findConnectedStores(database, tenantA, [storeA, storeB]);
    expect(found.map((store) => store.id)).toEqual([storeA]);
  });

  it("reconnecting the same shop reuses the connection", async () => {
    const again = await upsertStoreConnection(database, storeInput(tenantA, `shop-a-${tenantA}`));
    expect(again.id).toBe(storeA);
  });

  it("disconnected stores are hidden and cannot receive listings", async () => {
    const extra = await upsertStoreConnection(
      database,
      storeInput(tenantA, `shop-extra-${tenantA}`),
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

describe("listings are tenant-scoped", () => {
  it("lists only the tenant's publications and reports active ones", async () => {
    await createListingWithTargets(
      database,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio do tenant A",
        description: "Descrição",
        priceCents: 2500,
      },
      [storeA],
    );
    const ofA = await listListingTargets(database, tenantA, {}, { page: 1, pageSize: 10 });
    const ofB = await listListingTargets(database, tenantB, {}, { page: 1, pageSize: 10 });
    expect(ofA.items.map((item) => item.title)).toContain("Anúncio do tenant A");
    expect(ofA.hasActive).toBe(true);
    expect(ofB.items).toEqual([]);
    expect(ofB.hasActive).toBe(false);
  });

  it("only retries failed targets of the same tenant", async () => {
    const created = await createListingWithTargets(
      database,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio com erro",
        description: "Descrição",
        priceCents: 2500,
      },
      [storeA],
    );
    const [targetId] = created.targetIds;
    if (!targetId) {
      throw new Error("destino não criado");
    }
    await expect(resetTargetForRetry(database, tenantA, targetId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await markTargetFailed(database, targetId, "Falhou", { final: true });
    await expect(resetTargetForRetry(database, tenantB, targetId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await resetTargetForRetry(database, tenantA, targetId);
    const row = await database.query.listingTargets.findFirst({
      where: eq(listingTargets.id, targetId),
    });
    expect(row).toMatchObject({ status: "pending", errorReason: null });
  });

  it("requires at least one destination store", async () => {
    await expect(
      createListingWithTargets(
        database,
        tenantA,
        {
          supplierProductId: productId,
          title: "Sem lojas",
          description: "Descrição",
          priceCents: 2500,
        },
        [],
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("store activity", () => {
  it("counts live and failed listings per store, scoped to the tenant", async () => {
    const created = await createListingWithTargets(
      database,
      tenantA,
      { supplierProductId: productId, title: "Atividade", description: "", priceCents: 2500 },
      [storeA],
    );
    const [targetId = ""] = created.targetIds;
    await database
      .update(listingTargets)
      .set({ status: "published" })
      .where(eq(listingTargets.id, targetId));
    const activity = await getStoreActivity(database, tenantA, [storeA, storeB]);
    expect(activity.get(storeA)?.liveListings).toBeGreaterThanOrEqual(1);
    expect(activity.get(storeB)).toEqual({
      liveListings: 0,
      failedListings: 0,
      orders: 0,
      revenueCents: 0,
    });
  });
});
