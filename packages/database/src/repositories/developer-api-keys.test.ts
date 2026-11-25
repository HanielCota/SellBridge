import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { developerApiKeys, developerApiRequests, user } from "../schema/index.ts";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import {
  countDeveloperApiRequest,
  countDeveloperRequestsByCreator,
  createDeveloperApiKey,
  recordDeveloperApiRequest,
} from "./developer-api-keys.ts";

const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;

beforeAll(async () => {
  users = await createTestUsers(database, 2);
});

afterAll(async () => {
  await users.cleanup();
  await database.$client.end();
});

async function createKey(createdByUserId: string) {
  return createDeveloperApiKey(database, {
    name: "Integração",
    prefix: `sb_dev_${randomUUID().slice(0, 8)}`,
    secretHash: randomUUID(),
    scopes: ["orders:read", "buyers:personal"],
    createdByUserId,
    expiresAt: new Date("2027-11-25T00:00:00Z"),
  });
}

async function usageOf(keyPrefix: string) {
  return database
    .select()
    .from(developerApiRequests)
    .where(eq(developerApiRequests.keyPrefix, keyPrefix));
}

describe("developer api usage trail", () => {
  it("records which organization, order and personal data an order read touched", async () => {
    const key = await createKey(users.ids[0] ?? "");
    const organizationId = randomUUID();
    const orderId = randomUUID();

    await recordDeveloperApiRequest(database, {
      developerApiKeyId: key.id,
      keyPrefix: key.prefix,
      operation: "getOrder",
      status: 200,
      durationMilliseconds: 12,
      organizationId,
      resourceId: orderId,
      personalData: true,
    });

    const [row] = await usageOf(key.prefix);
    expect(row).toMatchObject({
      keyId: key.id,
      organizationId,
      resourceId: orderId,
      personalData: true,
    });
    await database
      .delete(developerApiRequests)
      .where(eq(developerApiRequests.keyPrefix, key.prefix));
  });

  it("keeps the trail with the key prefix after the developer account is deleted", async () => {
    const [extra] = await database
      .insert(user)
      .values({
        id: randomUUID(),
        name: "Dev",
        email: `dev-${randomUUID()}@sellbridge.test`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: user.id });
    const key = await createKey(extra?.id ?? "");
    await recordDeveloperApiRequest(database, {
      developerApiKeyId: key.id,
      keyPrefix: key.prefix,
      operation: "listOrders",
      status: 403,
      durationMilliseconds: 3,
      organizationId: null,
      resourceId: null,
      personalData: false,
    });

    await database.delete(user).where(eq(user.id, extra?.id ?? ""));

    const rows = await usageOf(key.prefix);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ keyId: null, keyPrefix: key.prefix, status: 403 });
    await database
      .delete(developerApiRequests)
      .where(eq(developerApiRequests.keyPrefix, key.prefix));
  });
});

describe("developer rate limit per creator", () => {
  it("adds up the requests of every key the developer made in the window", async () => {
    const creator = users.ids[1] ?? "";
    const first = await createKey(creator);
    const second = await createKey(creator);
    const windowStart = new Date("2026-11-25T12:00:00Z");
    await countDeveloperApiRequest(database, first.id, windowStart);
    await countDeveloperApiRequest(database, first.id, windowStart);
    await countDeveloperApiRequest(database, second.id, windowStart);

    const total = await countDeveloperRequestsByCreator(database, creator, windowStart);

    expect(total).toBe(3);
    await database.delete(developerApiKeys).where(eq(developerApiKeys.createdByUserId, creator));
  });
});
