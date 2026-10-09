import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orders, tickets, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { listNotifications, markNotificationsSeen } from "./notifications.ts";
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
  it("lists the tenant's sales and support replies as unread until seen", async () => {
    const first = await listNotifications(database, { tenantId: tenantA, userId });
    expect(first.items.map((item) => item.kind).toSorted()).toEqual(["sale", "support_reply"]);
    expect(first.unread).toBe(2);
    // Currency formatting puts a no-break space after "R$".
    expect(first.items.find((item) => item.kind === "sale")?.title).toMatch(/R\$\s49,90/);

    await markNotificationsSeen(database, userId);
    const after = await listNotifications(database, { tenantId: tenantA, userId });
    expect(after.unread).toBe(0);
  });

  it("never shows another tenant's events", async () => {
    const other = await listNotifications(database, { tenantId: tenantB, userId });
    expect(other.items).toEqual([]);
  });
});
