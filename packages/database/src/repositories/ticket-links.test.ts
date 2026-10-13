import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, orders, storeConnections, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import { createTicket, getTicketThread } from "./support.ts";
import {
  addTicketFollower,
  findTicketEmailRecipients,
  linkTicketOrder,
  listLinkableOrders,
  listTenantColleagues,
  listTicketFollowers,
  listTicketOrders,
  setTicketNotifications,
  unlinkTicketOrder,
} from "./ticket-links.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantA = "";
let tenantB = "";
let reseller = "";
let colleague = "";
let outsider = "";
let orderA = "";
let olderOrderA = "";
let orderB = "";

async function insertOrder(tenantId: string, externalOrderId: string, orderedAt: string) {
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "mock",
      externalShopId: `${externalOrderId}-${tenantId}`,
      shopName: `Loja ${externalOrderId}`,
    })
    .returning({ id: storeConnections.id });
  if (!store) {
    throw new Error("loja não criada");
  }
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId,
      status: "paid",
      totalCents: 18_990,
      buyerName: "Ana Compradora",
      orderedAt: new Date(orderedAt),
    })
    .returning({ id: orders.id });
  if (!order) {
    throw new Error("pedido não criado");
  }
  return order.id;
}

async function openTicket(): Promise<string> {
  const { ticketId } = await createTicket(database, {
    tenantId: tenantA,
    userId: reseller,
    category: "payment",
    subject: "Repasse da semana",
    body: "As vendas de segunda não entraram no Financeiro.",
    attachments: [],
  });
  return ticketId;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  users = await createTestUsers(database, 3);
  const [first, second, third] = users.ids;
  if (!first || !second || !third) {
    throw new Error("usuários");
  }
  reseller = first;
  colleague = second;
  outsider = third;
  await database.insert(member).values([
    { id: randomUUID(), organizationId: tenantA, userId: reseller, createdAt: new Date() },
    { id: randomUUID(), organizationId: tenantA, userId: colleague, createdAt: new Date() },
    { id: randomUUID(), organizationId: tenantB, userId: outsider, createdAt: new Date() },
  ]);
  orderA = await insertOrder(tenantA, "ML-8812", "2026-10-07T12:00:00Z");
  olderOrderA = await insertOrder(tenantA, "ML-7001", "2026-09-01T12:00:00Z");
  orderB = await insertOrder(tenantB, "ML-9999", "2026-10-08T12:00:00Z");
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
});

describe("ticket orders", () => {
  it("links an order of the same store once and records it in the history", async () => {
    const ticketId = await openTicket();
    await linkTicketOrder(database, {
      ticketId,
      tenantId: tenantA,
      orderId: orderA,
      actorId: reseller,
    });
    await linkTicketOrder(database, {
      ticketId,
      tenantId: tenantA,
      orderId: orderA,
      actorId: reseller,
    });

    const linked = await listTicketOrders(database, ticketId);
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ externalOrderId: "ML-8812", storeName: "Loja ML-8812" });

    const thread = await getTicketThread(database, ticketId, tenantA);
    expect(thread.events.map((event) => [event.type, event.toValue])).toEqual([
      ["order_linked", "ML-8812"],
    ]);
  });

  it("offers only the store's orders that are not linked yet, newest first", async () => {
    const ticketId = await openTicket();
    const before = await listLinkableOrders(database, { tenantId: tenantA, ticketId, limit: 10 });
    expect(before.map((order) => order.orderId)).toEqual([orderA, olderOrderA]);

    await linkTicketOrder(database, {
      ticketId,
      tenantId: tenantA,
      orderId: orderA,
      actorId: reseller,
    });
    const after = await listLinkableOrders(database, { tenantId: tenantA, ticketId, limit: 10 });
    expect(after.map((order) => order.orderId)).toEqual([olderOrderA]);

    const searched = await listLinkableOrders(database, {
      tenantId: tenantA,
      ticketId,
      search: "7001",
      limit: 10,
    });
    expect(searched.map((order) => order.externalOrderId)).toEqual(["ML-7001"]);

    const byBuyer = await listLinkableOrders(database, {
      tenantId: tenantA,
      ticketId,
      search: "comprádora ÂNA",
      limit: 10,
    });
    expect(byBuyer.map((order) => order.externalOrderId)).toEqual(["ML-7001"]);
  });

  it("refuses another store's order or ticket", async () => {
    const ticketId = await openTicket();
    await expect(
      linkTicketOrder(database, {
        ticketId,
        tenantId: tenantA,
        orderId: orderB,
        actorId: reseller,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      linkTicketOrder(database, {
        ticketId,
        tenantId: tenantB,
        orderId: orderB,
        actorId: outsider,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("unlinks an order and says so in the history", async () => {
    const ticketId = await openTicket();
    await linkTicketOrder(database, {
      ticketId,
      tenantId: tenantA,
      orderId: orderA,
      actorId: reseller,
    });
    await unlinkTicketOrder(database, {
      ticketId,
      tenantId: tenantA,
      orderId: orderA,
      actorId: reseller,
    });

    expect(await listTicketOrders(database, ticketId)).toEqual([]);
    const thread = await getTicketThread(database, ticketId, tenantA);
    expect(thread.events.map((event) => event.type)).toEqual(["order_linked", "order_unlinked"]);
  });
});

describe("ticket followers", () => {
  it("e-mails the requester until they turn it off", async () => {
    const ticketId = await openTicket();
    const requesterEmail = (await listTicketFollowers(database, ticketId))[0]?.email;
    expect(await findTicketEmailRecipients(database, ticketId)).toEqual([
      expect.objectContaining({ email: requesterEmail }),
    ]);

    await setTicketNotifications(database, {
      ticketId,
      tenantId: tenantA,
      userId: reseller,
      notify: false,
    });
    expect(await findTicketEmailRecipients(database, ticketId)).toEqual([]);
    const [requester] = await listTicketFollowers(database, ticketId);
    expect(requester).toMatchObject({ isRequester: true, notify: false });
  });

  it("adds a colleague of the store once and names them in the history", async () => {
    const ticketId = await openTicket();
    await addTicketFollower(database, {
      ticketId,
      tenantId: tenantA,
      userId: colleague,
      actorId: reseller,
    });
    await addTicketFollower(database, {
      ticketId,
      tenantId: tenantA,
      userId: colleague,
      actorId: reseller,
    });

    const followers = await listTicketFollowers(database, ticketId);
    expect(followers.map((follower) => [follower.userId, follower.isRequester])).toEqual([
      [reseller, true],
      [colleague, false],
    ]);
    expect(await findTicketEmailRecipients(database, ticketId)).toHaveLength(2);

    const thread = await getTicketThread(database, ticketId, tenantA);
    expect(thread.events.map((event) => [event.type, event.toValue])).toEqual([
      ["follower_added", "Usuário 1"],
    ]);
  });

  it("stops e-mailing a follower who was banned or left the store", async () => {
    const leaver = await createTestUsers(database, 1);
    const leaverId = leaver.ids[0];
    if (!leaverId) {
      throw new Error("usuário");
    }
    await database.insert(member).values({
      id: randomUUID(),
      organizationId: tenantA,
      userId: leaverId,
      createdAt: new Date(),
    });
    const ticketId = await openTicket();
    await addTicketFollower(database, {
      ticketId,
      tenantId: tenantA,
      userId: leaverId,
      actorId: reseller,
    });
    expect(await findTicketEmailRecipients(database, ticketId)).toHaveLength(2);

    await database.update(user).set({ banned: true }).where(eq(user.id, leaverId));
    expect(await findTicketEmailRecipients(database, ticketId)).toHaveLength(1);

    await database.update(user).set({ banned: false }).where(eq(user.id, leaverId));
    await database
      .delete(member)
      .where(and(eq(member.organizationId, tenantA), eq(member.userId, leaverId)));
    expect(await findTicketEmailRecipients(database, ticketId)).toHaveLength(1);
    await leaver.cleanup();
  });

  it("refuses someone from another store", async () => {
    const ticketId = await openTicket();
    await expect(
      addTicketFollower(database, {
        ticketId,
        tenantId: tenantA,
        userId: outsider,
        actorId: reseller,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lists the people of the store", async () => {
    const colleagues = await listTenantColleagues(database, tenantA);
    expect(colleagues.map((person) => person.userId).toSorted()).toEqual(
      [reseller, colleague].toSorted(),
    );
  });
});
