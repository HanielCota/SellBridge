import { marketplaceError } from "@sellbridge/marketplaces";
import { MOCK_REVOKED_REFRESH_TOKEN } from "@sellbridge/marketplaces/testing";
import { schema } from "@sellbridge/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
