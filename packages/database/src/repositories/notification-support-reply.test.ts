import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, notificationDeliveries, notificationPreferences } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import { queueSupportReplyNotices } from "./notification-producers.ts";
import { createTicket } from "./support.ts";
import { addTicketFollower, setTicketNotifications } from "./ticket-links.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let requester = "";
let colleague = "";
let outsider = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 3);
  [requester = "", colleague = "", outsider = ""] = users.ids;
  await database.insert(member).values(
    [
      [tenants.tenantA, requester],
      [tenants.tenantA, colleague],
      [tenants.tenantB, outsider],
    ].map(([organizationId = "", userId = ""]) => ({
      id: randomUUID(),
      organizationId,
      userId,
      role: "member",
      createdAt: new Date(),
    })),
  );
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

async function newTicket() {
  const { ticketId } = await createTicket(database, {
    tenantId: tenants.tenantA,
    userId: requester,
    category: "order",
    subject: "Pedido atrasado",
    body: "O pedido 123 não chegou.",
    attachments: [],
  });
  return ticketId;
}

async function emailsFor(userId: string, ticketId: string) {
  const rows = await database
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, userId),
        eq(notificationDeliveries.event, "support_reply"),
        eq(notificationDeliveries.channel, "email"),
      ),
    );
  return rows.filter((row) => row.dedupeKey.startsWith(`ticket:${ticketId}:`));
}

describe("queueSupportReplyNotices", () => {
  it("queues the reply e-mail to the requester, linking to the ticket without the reply", async () => {
    const ticketId = await newTicket();
    await queueSupportReplyNotices(database, { ticketId, at: new Date() });
    const [email] = await emailsFor(requester, ticketId);
    expect(email?.tenantId).toBe(tenants.tenantA);
    expect(email?.content).toMatchObject({
      subject: "Nova resposta no seu chamado: Pedido atrasado",
      actionPath: `/suporte/${ticketId}`,
    });
    expect(JSON.stringify(email?.content)).not.toContain("não chegou");
    expect(await emailsFor(outsider, ticketId)).toEqual([]);
  });

  it("reaches colleagues who follow the ticket, minus who muted it or turned e-mails off", async () => {
    const ticketId = await newTicket();
    await addTicketFollower(database, {
      ticketId,
      tenantId: tenants.tenantA,
      userId: colleague,
      actorId: requester,
    });
    await queueSupportReplyNotices(database, { ticketId, at: new Date() });
    expect(await emailsFor(colleague, ticketId)).toHaveLength(1);

    await setTicketNotifications(database, {
      ticketId,
      tenantId: tenants.tenantA,
      userId: colleague,
      notify: false,
    });
    await database
      .insert(notificationPreferences)
      .values({ userId: requester, event: "support_reply", channel: "email", enabled: false });
    await queueSupportReplyNotices(database, { ticketId, at: new Date(Date.now() + 1000) });
    expect(await emailsFor(colleague, ticketId)).toHaveLength(1);
    expect(await emailsFor(requester, ticketId)).toHaveLength(1);
  });
});
