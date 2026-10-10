import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orders, tickets, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { listNotificationEvents, markNotificationsSeen } from "./notifications.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantA = "";
let tenantB = "";
const userId = `test-${randomUUID()}`;

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  [tenantA = "", tenantB = ""] = tenants.ids;
  await database
    .insert(user)
    .values({ id: userId, name: "Leitor", email: `${userId}@sellbridge.test` });
  const store = await upsertStoreConnection(database, {
    tenantId: tenantA,
    marketplace: "mock",
    externalShopId: `notif-${tenantA}`,
    shopName: "Loja Avisos",
    accessTokenEnc: "enc",
    refreshTokenEnc: "enc",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await database.insert(orders).values({
    tenantId: tenantA,
    storeConnectionId: store.id,
    externalOrderId: "AV-1",
    status: "paid",
    totalCents: 4990,
    marketplaceFeeCents: 600,
    orderedAt: new Date(Date.now() - 60_000),
  });
  await database.insert(tickets).values({
    tenantId: tenantA,
    createdById: userId,
    subject: "Dúvida de frete",
    status: "answered",
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(user).where(eq(user.id, userId));
  await database.$client.end();
});

describe("notifications", () => {
  it("lists the tenant's sales and support replies with when the user last looked", async () => {
    const first = await listNotificationEvents(database, { tenantId: tenantA, userId });
    expect(first.events.map((event) => event.kind).toSorted()).toEqual(["sale", "support_reply"]);
    expect(first.seenAt).toBeNull();
    expect(first.events.find((event) => event.kind === "sale")).toMatchObject({
      externalOrderId: "AV-1",
      totalCents: 4990,
      storeName: "Loja Avisos",
    });

    await markNotificationsSeen(database, userId);
    const after = await listNotificationEvents(database, { tenantId: tenantA, userId });
    expect(after.seenAt).toBeInstanceOf(Date);
    expect(after.events.every((event) => after.seenAt !== null && event.at <= after.seenAt)).toBe(
      true,
    );
  });

  it("never shows another tenant's events", async () => {
    const other = await listNotificationEvents(database, { tenantId: tenantB, userId });
    expect(other.events).toEqual([]);
  });
});
