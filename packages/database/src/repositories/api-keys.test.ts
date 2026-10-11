import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createTestTenantPair } from "../testing/fixtures.ts";
import { completeIdempotencyKey, reserveIdempotencyKey } from "./api-idempotency.ts";
import {
  countApiRequest,
  createApiKey,
  findActiveApiKey,
  getApiKeyIdentity,
  listApiKeys,
  revokeApiKey,
} from "./api-keys.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let tenantA = "";
let tenantB = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

function newKey(tenantId: string, overrides: { secretHash?: string; expiresAt?: Date } = {}) {
  return createApiKey(database, {
    tenantId,
    name: "ERP",
    prefix: "sb_live_abc123",
    secretHash: overrides.secretHash ?? randomUUID(),
    scopes: ["orders:read"],
    createdByUserId: null,
    expiresAt: overrides.expiresAt ?? null,
  });
}

describe("api keys", () => {
  it("finds a key by its hash until it is revoked, only in its own tenant", async () => {
    const secretHash = randomUUID();
    const key = await newKey(tenantA, { secretHash });
    const now = new Date();
    expect(await findActiveApiKey(database, secretHash, now)).toEqual({
      id: key.id,
      tenantId: tenantA,
      scopes: ["orders:read"],
    });
    expect((await getApiKeyIdentity(database, key.id)).organizationId).toBe(tenantA);

    await expect(revokeApiKey(database, tenantB, key.id)).rejects.toThrow("não encontrada");
    await revokeApiKey(database, tenantA, key.id);
    expect(await findActiveApiKey(database, secretHash, now)).toBeNull();
    expect(
      (await listApiKeys(database, tenantA)).find((item) => item.id === key.id)?.revokedAt,
    ).toBeInstanceOf(Date);
  });

  it("ignores expired keys", async () => {
    const secretHash = randomUUID();
    const now = new Date();
    await newKey(tenantA, { secretHash, expiresAt: new Date(now.getTime() + 60_000) });
    expect(await findActiveApiKey(database, secretHash, now)).not.toBeNull();
    expect(
      await findActiveApiKey(database, secretHash, new Date(now.getTime() + 120_000)),
    ).toBeNull();
  });

  it("counts requests per window", async () => {
    const key = await newKey(tenantA);
    const window = new Date("2026-10-11T12:00:00Z");
    expect(await countApiRequest(database, key.id, window)).toBe(1);
    expect(await countApiRequest(database, key.id, window)).toBe(2);
    const next = new Date("2026-10-11T12:01:00Z");
    expect(await countApiRequest(database, key.id, next)).toBe(1);
  });
});

describe("idempotency keys", () => {
  it("reserves once, then replays, refuses another request, and frees abandoned keys", async () => {
    const now = new Date();
    const target = { tenantId: tenantA, key: `key-${randomUUID()}`, requestHash: "a", now };
    expect(await reserveIdempotencyKey(database, target)).toEqual({ status: "reserved" });
    expect(await reserveIdempotencyKey(database, target)).toEqual({ status: "in_progress" });
    expect(await reserveIdempotencyKey(database, { ...target, requestHash: "b" })).toEqual({
      status: "mismatch",
    });

    await completeIdempotencyKey(database, {
      tenantId: tenantA,
      key: target.key,
      responseStatus: 202,
      responseBody: { id: 1 },
    });
    expect(await reserveIdempotencyKey(database, target)).toEqual({
      status: "replay",
      responseStatus: 202,
      responseBody: { id: 1 },
    });
    expect(await reserveIdempotencyKey(database, { ...target, tenantId: tenantB })).toEqual({
      status: "reserved",
    });

    const abandoned = { ...target, key: `key-${randomUUID()}` };
    expect(await reserveIdempotencyKey(database, abandoned)).toEqual({ status: "reserved" });
    const later = new Date(now.getTime() + 6 * 60 * 1000);
    expect(await reserveIdempotencyKey(database, { ...abandoned, now: later })).toEqual({
      status: "reserved",
    });
  });
});
