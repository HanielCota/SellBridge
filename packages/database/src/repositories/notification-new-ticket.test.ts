import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notificationDeliveries, notificationPreferences, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair } from "../testing/fixtures.ts";
import { queueNewTicketNotices } from "./notification-producers.ts";
import { createTicket } from "./support.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
const people = {
  reseller: `reseller-${randomUUID()}`,
  agent: `agent-${randomUUID()}`,
  admin: `admin-${randomUUID()}`,
  banned: `banned-${randomUUID()}`,
  muted: `muted-${randomUUID()}`,
};

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  await database.insert(user).values([
    { id: people.reseller, name: "Revendedora", email: `${people.reseller}@sellbridge.test` },
    {
      id: people.agent,
      name: "Atendente",
      email: `${people.agent}@sellbridge.test`,
      role: "agent",
    },
    { id: people.admin, name: "Admin", email: `${people.admin}@sellbridge.test`, role: "admin" },
    {
      id: people.banned,
      name: "Ex-atendente",
      email: `${people.banned}@sellbridge.test`,
      role: "agent",
      banned: true,
    },
    { id: people.muted, name: "Calada", email: `${people.muted}@sellbridge.test`, role: "agent" },
  ]);
  await database
    .insert(notificationPreferences)
    .values({ userId: people.muted, event: "ticket_created", channel: "email", enabled: false });
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(user).where(inArray(user.id, Object.values(people)));
  await database.$client.end();
});

async function emailsOf(userId: string, ticketId: string) {
  return database
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, userId),
        eq(notificationDeliveries.dedupeKey, `ticket:${ticketId}:created`),
        eq(notificationDeliveries.channel, "email"),
      ),
    );
}

describe("queueNewTicketNotices", () => {
  it("e-mails the active support team, never the store, with a link to the team's inbox", async () => {
    const { ticketId } = await createTicket(database, {
      tenantId: tenants.tenantA,
      userId: people.reseller,
      category: "payment",
      subject: "Repasse não caiu",
      body: "Meu CPF e a conta 1234-5 estão no anexo.",
      attachments: [],
    });
    await queueNewTicketNotices(database, ticketId);
    await queueNewTicketNotices(database, ticketId);

    const [toAgent] = await emailsOf(people.agent, ticketId);
    expect(toAgent?.tenantId).toBeNull();
    expect(toAgent?.content).toMatchObject({
      subject: "Chamado novo: Repasse não caiu",
      actionPath: `/admin/chamados/${ticketId}`,
    });
    expect(JSON.stringify(toAgent?.content)).not.toContain("1234-5");
    expect(await emailsOf(people.agent, ticketId)).toHaveLength(1);
    expect(await emailsOf(people.admin, ticketId)).toHaveLength(1);
    expect(await emailsOf(people.reseller, ticketId)).toEqual([]);
    expect(await emailsOf(people.banned, ticketId)).toEqual([]);
    expect(await emailsOf(people.muted, ticketId)).toEqual([]);
  });
});
