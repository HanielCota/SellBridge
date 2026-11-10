import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestUsers,
} from "../testing/fixtures.ts";
import {
  consumeErpOAuthState,
  createErpOAuthState,
  findErpConnection,
  findErpConnectionsExpiringBefore,
  listSupplierProductsForErpExport,
  recordErpRefreshFailure,
  rotateErpTokens,
  upsertErpConnection,
} from "./erp-connections.ts";

const database = createTestDatabase();
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let userId = "";
let otherUserId = "";

beforeAll(async () => {
  supplier = await createTestSupplierProduct(database, {
    sku: `ERP-${crypto.randomUUID().slice(0, 8)}`,
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
