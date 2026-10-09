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

const db = createTestDatabase();
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
  tenants = await createTestTenants(db, 2);
  const [first, second] = tenants.ids;
  if (!first || !second) {
    throw new Error("tenants não criados");
  }
  tenantA = first;
  tenantB = second;
  storeA = (await upsertStoreConnection(db, storeInput(tenantA, `shop-a-${tenantA}`))).id;
  storeB = (await upsertStoreConnection(db, storeInput(tenantB, `shop-b-${tenantB}`))).id;
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: "Fornecedor isolamento", niche: "Teste", state: "ZZ", city: "X" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor não criado");
  }
  supplierId = supplier.id;
  const [product] = await db
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
  await db.delete(suppliers).where(eq(suppliers.id, supplierId));
  await db.$client.end();
});

describe("store connections are tenant-scoped", () => {
  it("lists only the tenant's stores", async () => {
    const storesOfA = await listStoreConnections(db, tenantA);
    expect(storesOfA.map((store) => store.id)).toEqual([storeA]);
  });

  it("does not load or disconnect another tenant's store", async () => {
    await expect(getStoreConnection(db, tenantA, storeB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(disconnectStore(db, tenantA, storeB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getStoreConnection(db, tenantB, storeB)).status).toBe("connected");
  });

  it("findConnectedStores ignores stores of other tenants", async () => {
    const found = await findConnectedStores(db, tenantA, [storeA, storeB]);
    expect(found.map((store) => store.id)).toEqual([storeA]);
  });

  it("reconnecting the same shop reuses the connection", async () => {
    const again = await upsertStoreConnection(db, storeInput(tenantA, `shop-a-${tenantA}`));
    expect(again.id).toBe(storeA);
  });

  it("disconnected stores are hidden and cannot receive listings", async () => {
    const extra = await upsertStoreConnection(db, storeInput(tenantA, `shop-extra-${tenantA}`));
    await disconnectStore(db, tenantA, extra.id);
    expect((await listStoreConnections(db, tenantA)).map((store) => store.id)).not.toContain(
      extra.id,
    );
    expect(await findConnectedStores(db, tenantA, [extra.id])).toEqual([]);
  });
});

describe("oauth state", () => {
  it("is single use and bound to tenant and marketplace", async () => {
    const state = `state-${tenantA}`;
    await createOAuthState(db, {
      state,
      tenantId: tenantA,
      marketplace: "mock",
      codeVerifier: null,
      ttlMs: 60_000,
    });
    expect(await consumeOAuthState(db, { state, tenantId: tenantA, marketplace: "mock" })).toEqual({
      codeVerifier: null,
    });
    expect(
      await consumeOAuthState(db, { state, tenantId: tenantA, marketplace: "mock" }),
    ).toBeNull();
  });

  it("rejects another tenant and expired states", async () => {
    await createOAuthState(db, {
      state: `other-${tenantA}`,
      tenantId: tenantA,
      marketplace: "mock",
      codeVerifier: null,
      ttlMs: 60_000,
    });
    expect(
      await consumeOAuthState(db, {
        state: `other-${tenantA}`,
        tenantId: tenantB,
        marketplace: "mock",
      }),
    ).toBeNull();

    await createOAuthState(db, {
      state: `expired-${tenantA}`,
      tenantId: tenantA,
      marketplace: "mock",
      codeVerifier: null,
      ttlMs: -1000,
    });
    expect(
      await consumeOAuthState(db, {
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
      db,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio do tenant A",
        description: "Descrição",
        priceCents: 2500,
      },
      [storeA],
    );
    const ofA = await listListingTargets(db, tenantA, {}, { page: 1, pageSize: 10 });
    const ofB = await listListingTargets(db, tenantB, {}, { page: 1, pageSize: 10 });
    expect(ofA.items.map((item) => item.title)).toContain("Anúncio do tenant A");
    expect(ofA.hasActive).toBe(true);
    expect(ofB.items).toEqual([]);
    expect(ofB.hasActive).toBe(false);
  });

  it("only retries failed targets of the same tenant", async () => {
    const created = await createListingWithTargets(
      db,
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
    await expect(resetTargetForRetry(db, tenantA, targetId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await markTargetFailed(db, targetId, "Falhou", { final: true });
    await expect(resetTargetForRetry(db, tenantB, targetId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await resetTargetForRetry(db, tenantA, targetId);
    const row = await db.query.listingTargets.findFirst({ where: eq(listingTargets.id, targetId) });
    expect(row).toMatchObject({ status: "pending", errorReason: null });
  });

  it("requires at least one destination store", async () => {
    await expect(
      createListingWithTargets(
        db,
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
