import { defaultResellerBlingSettings } from "@sellbridge/shared/reseller-bling";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resellerErpConnections } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import { consumeErpOAuthState } from "./erp-connections.ts";
import {
  createResellerErpOAuthState,
  deleteResellerErpConnection,
  findResellerErpConnection,
  findResellerErpConnectionsExpiringBefore,
  recordResellerErpRefreshFailure,
  rotateResellerErpTokens,
  saveResellerSaleNoteSettings,
  upsertResellerErpConnection,
} from "./reseller-erp-connections.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let userId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 1);
  userId = users.ids[0] ?? "";
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

function tokens(suffix: string, expiresAt = new Date(Date.now() + 60_000)) {
  return { accessTokenEnc: `access-${suffix}`, refreshTokenEnc: `refresh-${suffix}`, expiresAt };
}

describe("reseller ERP OAuth state", () => {
  it("is consumed once and names the reseller", async () => {
    const state = `state-${crypto.randomUUID()}`;
    await createResellerErpOAuthState(database, {
      state,
      tenantId: tenants.tenantA,
      userId,
      provider: "bling",
      ttlMilliseconds: 60_000,
    });

    const consumed = await consumeErpOAuthState(database, { state, userId, provider: "bling" });
    const again = await consumeErpOAuthState(database, { state, userId, provider: "bling" });

    expect(consumed).toEqual({ kind: "reseller", tenantId: tenants.tenantA });
    expect(again).toBeNull();
  });
});

describe("reseller ERP connection", () => {
  it("turns issuing on once and keeps the first moment it was on", async () => {
    await upsertResellerErpConnection(database, {
      tenantId: tenants.tenantA,
      provider: "bling",
      userId,
      tokens: tokens("a"),
      accountName: "Revenda A Ltda",
    });
    const settings = { ...defaultResellerBlingSettings(), operationId: 77 };
    const firstOn = new Date("2026-11-20T10:00:00Z");

    await saveResellerSaleNoteSettings(database, {
      tenantId: tenants.tenantA,
      provider: "bling",
      settings,
      issueFromErp: true,
      now: firstOn,
    });
    await saveResellerSaleNoteSettings(database, {
      tenantId: tenants.tenantA,
      provider: "bling",
      settings,
      issueFromErp: true,
      now: new Date("2026-11-21T10:00:00Z"),
    });
    const saved = await findResellerErpConnection(database, {
      tenantId: tenants.tenantA,
      provider: "bling",
    });

    expect(saved?.saleNotesEnabledAt?.toISOString()).toBe(firstOn.toISOString());
    expect(saved?.saleNoteSettings?.operationId).toBe(77);
    expect(saved?.accountName).toBe("Revenda A Ltda");
  });

  it("clears the settings and stops issuing when the reseller connects again", async () => {
    await upsertResellerErpConnection(database, {
      tenantId: tenants.tenantA,
      provider: "bling",
      userId,
      tokens: tokens("a2"),
    });

    const saved = await findResellerErpConnection(database, {
      tenantId: tenants.tenantA,
      provider: "bling",
    });

    expect(saved?.saleNotesEnabledAt).toBeNull();
    expect(saved?.saleNoteSettings).toBeNull();
  });

  it("does not save settings for a reseller without a connected account", async () => {
    const saved = await saveResellerSaleNoteSettings(database, {
      tenantId: tenants.tenantB,
      provider: "bling",
      settings: defaultResellerBlingSettings(),
      issueFromErp: true,
      now: new Date(),
    });

    expect(saved).toBe(false);
  });

  it("rotates tokens only from the saved refresh token, then marks the account expired", async () => {
    const connection = await upsertResellerErpConnection(database, {
      tenantId: tenants.tenantB,
      provider: "bling",
      userId,
      tokens: tokens("b", new Date(Date.now() + 1_000)),
    });

    const stale = await rotateResellerErpTokens(database, {
      connectionId: connection.id,
      previousRefreshTokenEnc: "refresh-other",
      tokens: tokens("c"),
    });
    const expiring = await findResellerErpConnectionsExpiringBefore(
      database,
      new Date(Date.now() + 60_000),
    );
    const expired = await recordResellerErpRefreshFailure(database, {
      connectionId: connection.id,
      refreshTokenEnc: "refresh-b",
      lastError: "Conecte o Bling de novo para continuar.",
      expired: true,
    });

    expect(stale).toBe(false);
    expect(expiring.map((row) => row.id)).toContain(connection.id);
    expect(expired).toBe(true);
    const [row] = await database
      .select({ status: resellerErpConnections.status })
      .from(resellerErpConnections)
      .where(eq(resellerErpConnections.id, connection.id));
    expect(row?.status).toBe("expired");
  });

  it("forgets the account on disconnection", async () => {
    await deleteResellerErpConnection(database, { tenantId: tenants.tenantB, provider: "bling" });

    const saved = await findResellerErpConnection(database, {
      tenantId: tenants.tenantB,
      provider: "bling",
    });

    expect(saved).toBeNull();
  });
});
