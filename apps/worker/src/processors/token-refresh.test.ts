import { marketplaceError } from "@sellbridge/marketplaces";
import { MOCK_REVOKED_REFRESH_TOKEN } from "@sellbridge/marketplaces/testing";
import { schema } from "@sellbridge/database";
import { eq } from "drizzle-orm";
import { logger } from "@sellbridge/shared/logger";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createTokenRefreshProcessor } from "./token-refresh.ts";

const environment = createWorkerTestEnvironment();
const { database, connectors, cipher } = environment;

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantIds: string[] = [];

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  tenantIds = tenants.ids;
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("token-refresh processor", () => {
  it("refreshes expiring tokens and expires revoked ones", async () => {
    const [tenantId] = tenantIds;
    if (!tenantId) {
      throw new Error("tenant ausente");
    }
    const soon = new Date(Date.now() + 60_000);
    const healthy = await createTestStore(environment, tenantId, "connected");
    await database
      .update(schema.storeConnections)
      .set({ expiresAt: soon })
      .where(eq(schema.storeConnections.id, healthy.id));
    const revoked = await createTestStore(environment, tenantId, "connected");
    await database
      .update(schema.storeConnections)
      .set({ expiresAt: soon, refreshTokenEnc: cipher.encrypt(MOCK_REVOKED_REFRESH_TOKEN) })
      .where(eq(schema.storeConnections.id, revoked.id));

    const summary = await createTokenRefreshProcessor({ database, connectors, cipher })();
    expect(summary.refreshed).toBeGreaterThanOrEqual(1);
    expect(summary.expired).toBeGreaterThanOrEqual(1);

    const refreshedRow = await database.query.storeConnections.findFirst({
      where: eq(schema.storeConnections.id, healthy.id),
    });
    expect(refreshedRow?.status).toBe("connected");
    expect(refreshedRow?.expiresAt?.getTime()).toBeGreaterThan(soon.getTime());

    const revokedRow = await database.query.storeConnections.findFirst({
      where: eq(schema.storeConnections.id, revoked.id),
    });
    expect(revokedRow?.status).toBe("expired");
  });
});

describe("token-refresh on a marketplace outage", () => {
  it("keeps the store connected with the error when the refresh gets a 503", async () => {
    const [tenantId] = tenantIds;
    if (!tenantId) {
      throw new Error("tenant ausente");
    }
    const store = await createTestStore(environment, tenantId, "connected");
    const alreadyExpired = new Date(Date.now() - 60_000);
    await database
      .update(schema.storeConnections)
      .set({ expiresAt: alreadyExpired })
      .where(eq(schema.storeConnections.id, store.id));
    const unavailable = {
      ...connectors,
      mock: {
        ...connectors.mock,
        refreshTokens: async () => {
          throw marketplaceError("Mercado Livre indisponível", { retryable: true, status: 503 });
        },
      },
    };

    const summary = await createTokenRefreshProcessor({
      database,
      connectors: unavailable,
      cipher,
    })();
    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const row = await database.query.storeConnections.findFirst({
      where: eq(schema.storeConnections.id, store.id),
    });
    expect(row).toMatchObject({ status: "connected", lastError: "Mercado Livre indisponível" });
  });
});

describe("token-refresh per shop", () => {
  it("names the store's shop to the connector, which Shopee needs to refresh", async () => {
    const [tenantId] = tenantIds;
    if (!tenantId) {
      throw new Error("tenant ausente");
    }
    const store = await createTestStore(environment, tenantId, "connected");
    await database
      .update(schema.storeConnections)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.storeConnections.id, store.id));
    const shopIds: string[] = [];
    const recording = {
      ...connectors,
      mock: {
        ...connectors.mock,
        refreshTokens: async (_refreshToken: string, shop: { externalShopId: string }) => {
          shopIds.push(shop.externalShopId);
          return {
            accessToken: "novo-acesso",
            refreshToken: "nova-renovacao",
            expiresAt: new Date(Date.now() + 4 * 60 * 60_000),
          };
        },
      },
    };

    await createTokenRefreshProcessor({ database, connectors: recording, cipher })();

    expect(shopIds).toContain(store.externalShopId);
  });
});

/** The test database, whose next `failures` updates fail as a dropped connection would. */
function failingUpdates(failures: number): typeof database {
  let left = failures;
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === "update" && left > 0) {
        left -= 1;
        return () => {
          throw new Error("connection lost");
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function expiringStore() {
  const [tenantId] = tenantIds;
  if (!tenantId) {
    throw new Error("tenant ausente");
  }
  const store = await createTestStore(environment, tenantId, "connected");
  await database
    .update(schema.storeConnections)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(schema.storeConnections.id, store.id));
  return store;
}

const rotating = {
  ...connectors,
  mock: {
    ...connectors.mock,
    refreshTokens: async () => ({
      accessToken: "acesso-rotacionado",
      refreshToken: "renovacao-rotacionada",
      expiresAt: new Date(Date.now() + 4 * 60 * 60_000),
    }),
  },
};

describe("token-refresh when saving the new pair fails", () => {
  it("saves the rotated refresh token after a failed first save", async () => {
    const store = await expiringStore();

    await createTokenRefreshProcessor({
      database: failingUpdates(1),
      connectors: rotating,
      cipher,
    })();

    const row = await database.query.storeConnections.findFirst({
      where: eq(schema.storeConnections.id, store.id),
    });
    expect(row?.refreshTokenEnc && cipher.decrypt(row.refreshTokenEnc)).toBe(
      "renovacao-rotacionada",
    );
  });

  it("reports a lost pair clearly when every save fails", async () => {
    const store = await expiringStore();
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    const summary = await createTokenRefreshProcessor({
      database: failingUpdates(Number.MAX_SAFE_INTEGER),
      connectors: rotating,
      cipher,
    })();

    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(error).toHaveBeenCalledWith(
      "store.token_save_failed",
      expect.objectContaining({ storeConnectionId: store.id }),
    );
    error.mockRestore();
  });
});
