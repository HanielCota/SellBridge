import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { storeConnections, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, testStoreInput } from "../testing/fixtures.ts";
import { hasLiveStoreConnection, isUserEmailVerified } from "./email-verification.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  await upsertStoreConnection(database, testStoreInput(tenants.tenantA, "verified-shop"));
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

// Item 26.b (L1): connecting a new store waits for a confirmed e-mail.
describe("e-mail verification before a store", () => {
  it("reads whether the user confirmed the e-mail", async () => {
    const [created] = await database
      .insert(user)
      .values({
        id: crypto.randomUUID(),
        name: "Verificação",
        email: `verificacao-${crypto.randomUUID()}@sellbridge.test`,
        emailVerified: false,
      })
      .returning({ id: user.id });
    if (created === undefined) throw new Error("missing user");
    expect(await isUserEmailVerified(database, created.id)).toBe(false);
    await database.update(user).set({ emailVerified: true }).where(eq(user.id, created.id));
    expect(await isUserEmailVerified(database, created.id)).toBe(true);
    expect(await isUserEmailVerified(database, crypto.randomUUID())).toBe(false);
    await database.delete(user).where(eq(user.id, created.id));
  });

  it("finds a live shop of the same account only", async () => {
    const shop = { marketplace: "mock" as const, externalShopId: "verified-shop" };
    expect(await hasLiveStoreConnection(database, { tenantId: tenants.tenantA, ...shop })).toBe(
      true,
    );
    expect(await hasLiveStoreConnection(database, { tenantId: tenants.tenantB, ...shop })).toBe(
      false,
    );
  });

  it("treats a disconnected shop as new", async () => {
    await database
      .update(storeConnections)
      .set({ status: "disconnected" })
      .where(eq(storeConnections.tenantId, tenants.tenantA));
    const shop = { marketplace: "mock" as const, externalShopId: "verified-shop" };
    expect(await hasLiveStoreConnection(database, { tenantId: tenants.tenantA, ...shop })).toBe(
      false,
    );
  });
});
