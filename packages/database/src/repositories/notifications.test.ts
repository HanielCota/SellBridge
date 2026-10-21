import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, ticketMessages, tickets, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import {
  clearNotifications,
  listNotificationEvents,
  markNotificationsSeen,
} from "./notifications.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantA = "";
let tenantB = "";
const userId = `test-${randomUUID()}`;
const agentId = `test-${randomUUID()}`;

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  [tenantA = "", tenantB = ""] = tenants.ids;
  await database.insert(user).values([
    { id: userId, name: "Leitor", email: `${userId}@sellbridge.test` },
    { id: agentId, name: "Suporte", email: `${agentId}@sellbridge.test`, role: "agent" },
  ]);
  const store = await upsertStoreConnection(database, {
    tenantId: tenantA,
    marketplace: "mock",
    externalShopId: `notif-${tenantA}`,
    shopName: "Loja Avisos",
    accessTokenEnc: "enc",
    refreshTokenEnc: "enc",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenantA,
      storeConnectionId: store.id,
      externalOrderId: "AV-1",
      status: "paid",
      totalCents: 4990,
      marketplaceFeeCents: 600,
      orderedAt: new Date(Date.now() - 60_000),
    })
    .returning({ id: orders.id });
  const item = { tenantId: tenantA, orderId: order?.id ?? "", quantity: 1, unitCostCents: 1000 };
  await database.insert(orderItems).values([
    { ...item, title: "Vestido floral", unitPriceCents: 2990 },
    { ...item, title: "Bolsa de palha", unitPriceCents: 2000 },
  ]);
  const [ticket] = await database
    .insert(tickets)
    .values({
      tenantId: tenantA,
      createdById: userId,
      subject: "Dúvida de frete",
      status: "answered",
    })
    .returning({ id: tickets.id });
  // The reply the reader has not opened yet is what shows up as a notification.
  await database.insert(ticketMessages).values({
    ticketId: ticket?.id ?? "",
    authorId: agentId,
    isAdmin: true,
    body: "O frete sai amanhã.",
    createdAt: new Date(Date.now() - 30_000),
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(user).where(inArray(user.id, [userId, agentId]));
  await database.$client.end();
});

describe("notifications", () => {
  it("lists the tenant's sales and support replies with when the user last looked", async () => {
    const first = await listNotificationEvents(database, {
      tenantId: tenantA,
      userId,
      reviewableSince: new Date(),
    });
    expect(first.events.map((event) => event.kind).toSorted()).toEqual(["sale", "support_reply"]);
    expect(first.seenAt).toBeNull();
    expect(first.events.find((event) => event.kind === "sale")).toMatchObject({
      externalOrderId: "AV-1",
      totalCents: 4990,
      storeName: "Loja Avisos",
      // The first item alphabetically, as on the financial statement; no supplier, no picture.
      product: { title: "Bolsa de palha", imageUrl: null, categoryName: null },
    });

    await markNotificationsSeen(database, { userId, tenantId: tenantA });
    const after = await listNotificationEvents(database, {
      tenantId: tenantA,
      userId,
      reviewableSince: new Date(),
    });
    expect(after.seenAt).toBeInstanceOf(Date);
    expect(after.events.every((event) => after.seenAt !== null && event.at <= after.seenAt)).toBe(
      true,
    );
  });

  it("stops listing everything that happened before the user cleared the list", async () => {
    await clearNotifications(database, { userId, tenantId: tenantA });
    const cleared = await listNotificationEvents(database, {
      tenantId: tenantA,
      userId,
      reviewableSince: new Date(),
    });
    expect(cleared.events).toEqual([]);
    expect(cleared.seenAt).toBeInstanceOf(Date);
  });

  it("shows a sale that arrives after the list was cleared, even if it was made before", async () => {
    // The list was cleared by the previous test; a webhook delivers two orders now.
    const [store] = await database
      .select({ id: orders.storeConnectionId })
      .from(orders)
      .where(inArray(orders.tenantId, [tenantA]));
    const arriving = (externalOrderId: string, minutesAgo: number) => ({
      tenantId: tenantA,
      storeConnectionId: store?.id ?? "",
      externalOrderId,
      status: "paid" as const,
      totalCents: 1000,
      orderedAt: new Date(Date.now() - minutesAgo * 60_000),
    });
    // Made 5 minutes ago, delivered late by the webhook: new to the reader.
    // Made 3 days ago, brought by a first sync of past orders: not news.
    await database
      .insert(orders)
      .values([arriving("AV-LATE", 5), arriving("AV-PAST", 3 * 24 * 60)]);
    const listed = await listNotificationEvents(database, {
      tenantId: tenantA,
      userId,
      reviewableSince: new Date(),
    });
    const sales = listed.events.flatMap((event) =>
      event.kind === "sale" ? [event.externalOrderId] : [],
    );
    expect(sales).toEqual(["AV-LATE"]);
  });

  it("never shows another tenant's events", async () => {
    const other = await listNotificationEvents(database, {
      tenantId: tenantB,
      userId,
      reviewableSince: new Date(),
    });
    expect(other.events).toEqual([]);
  });

  it("keeps what the user saw and cleared per organization", async () => {
    const other = await listNotificationEvents(database, {
      tenantId: tenantB,
      userId,
      reviewableSince: new Date(),
    });
    expect(other.seenAt).toBeNull();
  });
});
