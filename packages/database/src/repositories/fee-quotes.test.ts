import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeConnections, supplierProducts } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  findFeeQuotes,
  findMercadoLivreFeeAccess,
  findProductFeeProfile,
  saveFeeQuotes,
} from "./fee-quotes.ts";

const database = createTestDatabase();
const now = new Date("2026-11-16T12:00:00Z");
const cleanups: (() => Promise<void>)[] = [];
let tenantA = "";
let tenantB = "";

async function storeOf(
  tenantId: string,
  overrides: Partial<typeof storeConnections.$inferInsert> = {},
): Promise<string> {
  const [store] = await database
    .insert(storeConnections)
    .values({
      ...testStoreInput(tenantId, randomUUID()),
      marketplace: "mercado_livre",
      expiresAt: new Date("2026-11-16T18:00:00Z"),
      ...overrides,
    })
    .returning({ id: storeConnections.id });
  if (store === undefined) {
    throw new Error("store not created");
  }
  return store.id;
}

beforeAll(async () => {
  const pair = await createTestTenantPair(database);
  tenantA = pair.tenantA;
  tenantB = pair.tenantB;
  cleanups.push(pair.cleanup);
});

afterAll(async () => {
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await database.$client.end();
});

describe("findMercadoLivreFeeAccess", () => {
  it("keeps only the tenant's connected Mercado Livre stores with a live token", async () => {
    const usable = await storeOf(tenantA);
    const otherMarketplace = await storeOf(tenantA, { marketplace: "mock" });
    const disconnected = await storeOf(tenantA, { status: "disconnected" });
    const expired = await storeOf(tenantA, { expiresAt: new Date("2026-11-16T11:59:00Z") });
    const otherTenant = await storeOf(tenantB);

    const access = await findMercadoLivreFeeAccess(
      database,
      tenantA,
      [usable, otherMarketplace, disconnected, expired, otherTenant],
      now,
    );

    expect(access.map((store) => store.storeConnectionId)).toEqual([usable]);
    expect(access[0]?.accessTokenEnc).toBe("enc-access");
  });

  it("asks nothing for no stores", async () => {
    expect(await findMercadoLivreFeeAccess(database, tenantA, [], now)).toEqual([]);
  });
});

describe("fee quotes", () => {
  it("reads back what was saved, by key, and replaces it on the next save", async () => {
    const store = await storeOf(tenantA);
    const readAt = new Date("2026-11-15T10:00:00Z");
    const later = new Date("2026-11-16T10:00:00Z");

    await saveFeeQuotes(database, store, [
      { quoteKey: "commission:MLB1", amount: 1_400, readAt },
      { quoteKey: "shipping:10x15x20,450:4899", amount: 685, readAt },
    ]);
    await saveFeeQuotes(database, store, [
      { quoteKey: "commission:MLB1", amount: 1_250, readAt: later },
    ]);
    const quotes = await findFeeQuotes(database, store, [
      "commission:MLB1",
      "shipping:10x15x20,450:4899",
      "commission:never-asked",
    ]);

    expect(quotes.get("commission:MLB1")).toEqual({ amount: 1_250, readAt: later });
    expect(quotes.get("shipping:10x15x20,450:4899")).toEqual({ amount: 685, readAt });
    expect(quotes.has("commission:never-asked")).toBe(false);
  });

  it("keeps each store's answers apart", async () => {
    const first = await storeOf(tenantA);
    const second = await storeOf(tenantA);

    await saveFeeQuotes(database, first, [
      { quoteKey: "commission:MLB1", amount: 1_400, readAt: now },
    ]);

    expect((await findFeeQuotes(database, second, ["commission:MLB1"])).size).toBe(0);
  });

  it("goes with the store when the store is removed", async () => {
    const store = await storeOf(tenantA);
    await saveFeeQuotes(database, store, [
      { quoteKey: "commission:MLB1", amount: 1_400, readAt: now },
    ]);

    await database.delete(storeConnections).where(eq(storeConnections.id, store));

    expect((await findFeeQuotes(database, store, ["commission:MLB1"])).size).toBe(0);
  });
});

describe("findProductFeeProfile", () => {
  it("reads the Mercado Livre category, fields and the packed weight shipping is priced on", async () => {
    const product = await createTestSupplierProduct(database, {
      sku: `FEE-${randomUUID()}`,
      title: "Produto com pacote",
      costCents: 2_100,
      suggestedPriceCents: 3_190,
    });
    cleanups.push(product.cleanup);
    await database
      .update(supplierProducts)
      .set({
        mercadoLivreCategoryId: "MLB1234",
        mercadoLivreAttributes: { SELLER_PACKAGE_WEIGHT: "450 g" },
        fiscal: { netWeightGrams: 300 },
      })
      .where(eq(supplierProducts.id, product.productId));

    const profile = await findProductFeeProfile(database, product.productId);

    expect(profile).toEqual({
      categoryId: "MLB1234",
      attributes: { SELLER_PACKAGE_WEIGHT: "450 g" },
      weightGrams: 450,
    });
  });

  it("is null for an unknown product", async () => {
    expect(await findProductFeeProfile(database, randomUUID())).toBeNull();
  });
});
