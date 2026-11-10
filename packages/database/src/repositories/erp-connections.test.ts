import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestUsers,
} from "../testing/fixtures.ts";
import {
  consumeErpOAuthState,
  createErpOAuthState,
  deleteErpConnection,
  failErpCatalogRead,
  findErpCatalogRead,
  findErpConnection,
  findErpConnectionsExpiringBefore,
  findSupplierProductCostsBySku,
  finishErpCatalogRead,
  listSupplierProductsForErpExport,
  recordErpCatalogReadProgress,
  recordErpImport,
  recordErpRefreshFailure,
  rotateErpTokens,
  startErpCatalogRead,
  upsertErpConnection,
} from "./erp-connections.ts";

const database = createTestDatabase();
const PRODUCT_SKU = `ERP-${crypto.randomUUID().slice(0, 8)}`;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let userId = "";
let otherUserId = "";

beforeAll(async () => {
  supplier = await createTestSupplierProduct(database, {
    sku: PRODUCT_SKU,
    title: "Travesseiro",
    costCents: 3990,
    suggestedPriceCents: 5990,
  });
  users = await createTestUsers(database, 2);
  userId = users.ids[0] ?? "";
  otherUserId = users.ids[1] ?? "";
});

afterAll(async () => {
  await supplier.cleanup();
  await users.cleanup();
  await database.$client.end();
});

function tokens(suffix: string, expiresAt = new Date(Date.now() + 60_000)) {
  return {
    accessTokenEnc: `access-${suffix}`,
    refreshTokenEnc: `refresh-${suffix}`,
    expiresAt,
  };
}

describe("ERP OAuth state", () => {
  it("is consumed once, by the user who started it", async () => {
    const state = crypto.randomUUID();
    await createErpOAuthState(database, {
      state,
      supplierId: supplier.supplierId,
      userId,
      provider: "bling",
      ttlMilliseconds: 60_000,
    });

    const byOther = await consumeErpOAuthState(database, {
      state,
      userId: otherUserId,
      provider: "bling",
    });
    const again = await consumeErpOAuthState(database, { state, userId, provider: "bling" });

    expect(byOther).toBeNull();
    expect(again).toBeNull();
  });

  it("returns the supplier for the right user before it expires", async () => {
    const state = crypto.randomUUID();
    await createErpOAuthState(database, {
      state,
      supplierId: supplier.supplierId,
      userId,
      provider: "bling",
      ttlMilliseconds: 60_000,
    });

    const consumed = await consumeErpOAuthState(database, { state, userId, provider: "bling" });

    expect(consumed).toEqual({ supplierId: supplier.supplierId });
  });

  it("refuses an expired state", async () => {
    const state = crypto.randomUUID();
    await createErpOAuthState(database, {
      state,
      supplierId: supplier.supplierId,
      userId,
      provider: "bling",
      ttlMilliseconds: -1,
    });

    const consumed = await consumeErpOAuthState(database, { state, userId, provider: "bling" });

    expect(consumed).toBeNull();
  });
});

describe("ERP connection tokens", () => {
  it("reconnecting replaces the tokens and clears the error", async () => {
    const first = await upsertErpConnection(database, {
      supplierId: supplier.supplierId,
      provider: "bling",
      userId,
      tokens: tokens("first"),
    });
    await recordErpRefreshFailure(database, {
      connectionId: first.id,
      refreshTokenEnc: "refresh-first",
      lastError: "falhou",
      expired: true,
    });

    const second = await upsertErpConnection(database, {
      supplierId: supplier.supplierId,
      provider: "bling",
      userId,
      tokens: tokens("second"),
    });

    expect(second).toMatchObject({
      id: first.id,
      status: "connected",
      lastError: null,
      refreshTokenEnc: "refresh-second",
    });
  });

  it("rotates only while the caller's refresh token is still the saved one", async () => {
    const connection = await upsertErpConnection(database, {
      supplierId: supplier.supplierId,
      provider: "bling",
      userId,
      tokens: tokens("current"),
    });

    const stale = await rotateErpTokens(database, {
      connectionId: connection.id,
      previousRefreshTokenEnc: "refresh-old",
      tokens: tokens("stale"),
    });
    const fresh = await rotateErpTokens(database, {
      connectionId: connection.id,
      previousRefreshTokenEnc: "refresh-current",
      tokens: tokens("next"),
    });
    const saved = await findErpConnection(database, {
      supplierId: supplier.supplierId,
      provider: "bling",
    });

    expect([stale, fresh]).toEqual([false, true]);
    expect(saved?.refreshTokenEnc).toBe("refresh-next");
  });

  it("lists connected accounts expiring before the threshold", async () => {
    await upsertErpConnection(database, {
      supplierId: supplier.supplierId,
      provider: "bling",
      userId,
      tokens: tokens("soon", new Date(Date.now() + 5 * 60_000)),
    });

    const expiring = await findErpConnectionsExpiringBefore(
      database,
      new Date(Date.now() + 30 * 60_000),
    );

    expect(expiring.map((row) => row.supplierId)).toContain(supplier.supplierId);
  });
});

describe("catalog export listing", () => {
  it("pages the supplier's active products by id", async () => {
    const firstPage = await listSupplierProductsForErpExport(database, {
      supplierId: supplier.supplierId,
      afterId: null,
      limit: 10,
    });
    const nextPage = await listSupplierProductsForErpExport(database, {
      supplierId: supplier.supplierId,
      afterId: firstPage.at(-1)?.id ?? null,
      limit: 10,
    });

    expect(firstPage.map((product) => product.id)).toEqual([supplier.productId]);
    expect(nextPage).toEqual([]);
  });
});

describe("current reseller costs by SKU", () => {
  it("returns the cost of the supplier's own SKUs and leaves unknown ones out", async () => {
    const costs = await findSupplierProductCostsBySku(database, {
      supplierId: supplier.supplierId,
      skus: [PRODUCT_SKU, "SKU-QUE-NAO-EXISTE"],
    });

    expect(costs).toEqual(new Map([[PRODUCT_SKU, 3990]]));
  });

  it("does not read another supplier's product with the same SKU", async () => {
    const other = await createTestSupplierProduct(database, {
      sku: `ERP-OUTRO-${crypto.randomUUID().slice(0, 8)}`,
      title: "Outro",
      costCents: 1000,
      suggestedPriceCents: 2000,
    });

    const costs = await findSupplierProductCostsBySku(database, {
      supplierId: other.supplierId,
      skus: [PRODUCT_SKU],
    });
    await other.cleanup();

    expect(costs.size).toBe(0);
  });

  it("answers an empty list without querying", async () => {
    const costs = await findSupplierProductCostsBySku(database, {
      supplierId: supplier.supplierId,
      skus: [],
    });

    expect(costs.size).toBe(0);
  });
});

function key() {
  return { supplierId: supplier.supplierId, provider: "bling" as const };
}

describe("ERP catalog read", () => {
  it("records progress and the result while it is the current read", async () => {
    const read = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });

    await recordErpCatalogReadProgress(database, {
      readId: read.id,
      readProducts: 120,
      totalProducts: 400,
    });
    const finished = await finishErpCatalogRead(database, {
      readId: read.id,
      result: { items: [] },
    });
    const found = await findErpCatalogRead(database, key());

    expect(finished).toBe(true);
    expect(found).toMatchObject({
      id: read.id,
      status: "ready",
      readProducts: 120,
      totalProducts: 400,
      result: { items: [] },
    });
  });

  it("ignores a job of a read that a new one replaced", async () => {
    const old = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });
    const current = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });

    const finishedOld = await finishErpCatalogRead(database, { readId: old.id, result: {} });
    const found = await findErpCatalogRead(database, key());

    expect(finishedOld).toBe(false);
    expect(found).toMatchObject({ id: current.id, status: "reading" });
  });

  it("keeps the failure reason and stops taking a result", async () => {
    const read = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });

    await failErpCatalogRead(database, { readId: read.id, error: "O Bling não respondeu." });
    const finished = await finishErpCatalogRead(database, { readId: read.id, result: {} });

    expect(finished).toBe(false);
    expect(await findErpCatalogRead(database, key())).toMatchObject({
      status: "failed",
      error: "O Bling não respondeu.",
    });
  });

  it("treats an expired read as gone", async () => {
    await startErpCatalogRead(database, { ...key(), ttlMilliseconds: -1 });

    const found = await findErpCatalogRead(database, key());

    expect(found).toBeNull();
  });
});

describe("ERP import and disconnection", () => {
  it("remembers the discount rule, the import date and clears the read", async () => {
    await upsertErpConnection(database, { ...key(), userId, tokens: tokens("import") });
    await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });

    await recordErpImport(database, { ...key(), resellerDiscountTenths: 300 });
    const connection = await findErpConnection(database, key());

    expect(connection?.resellerDiscountTenths).toBe(300);
    expect(connection?.lastImportAt).toBeInstanceOf(Date);
    expect(await findErpCatalogRead(database, key())).toBeNull();
  });

  it("keeps the saved discount when an import had no rule", async () => {
    await recordErpImport(database, { ...key(), resellerDiscountTenths: null });

    const connection = await findErpConnection(database, key());

    expect(connection?.resellerDiscountTenths).toBe(300);
  });

  it("forgets the account and its read on disconnection", async () => {
    await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });

    const deleted = await deleteErpConnection(database, key());

    expect(deleted).toBe(true);
    expect(await findErpConnection(database, key())).toBeNull();
    expect(await findErpCatalogRead(database, key())).toBeNull();
  });
});
