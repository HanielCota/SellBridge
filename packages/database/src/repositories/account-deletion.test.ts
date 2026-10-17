import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminAuditEvents,
  billingAccounts,
  member,
  user,
  organization,
  orders,
  storeConnections,
  ticketAttachments,
  ticketMessages,
  tickets,
} from "../schema/index.ts";
import { createTestDatabase, createTestUsers, testStoreInput } from "../testing/fixtures.ts";
import {
  accountFileKeys,
  deleteTenantData,
  findSoleOwnedTenants,
  forgetBillingCustomer,
} from "./account-deletion.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;
const organizationIds: string[] = [];
let leaving = "";
let partner = "";

async function createOrganization(): Promise<string> {
  const id = randomUUID();
  await database
    .insert(organization)
    .values({ id, name: "Org teste", slug: `org-${id}`, createdAt: new Date() });
  organizationIds.push(id);
  return id;
}

async function addMember(organizationId: string, userId: string, role: string) {
  await database
    .insert(member)
    .values({ id: randomUUID(), organizationId, userId, role, createdAt: new Date() });
}

beforeAll(async () => {
  users = await createTestUsers(database, 2);
  [leaving = "", partner = ""] = users.ids;
});

afterAll(async () => {
  await database.delete(organization).where(inArray(organization.id, organizationIds));
  await users.cleanup();
  await database.$client.end();
});

describe("account deletion", () => {
  it("finds only the workspaces the leaving user owns alone", async () => {
    const alone = await createOrganization();
    await addMember(alone, leaving, "owner");
    const shared = await createOrganization();
    await addMember(shared, leaving, "owner");
    await addMember(shared, partner, "owner");
    const asMember = await createOrganization();
    await addMember(asMember, leaving, "member");
    expect(await findSoleOwnedTenants(database, leaving)).toEqual([alone]);
  });

  it("lists the files to remove: the workspace's attachments and the user's own", async () => {
    const tenantId = await createOrganization();
    const [ticket] = await database
      .insert(tickets)
      .values({ tenantId, createdById: partner, subject: "Anexo" })
      .returning({ id: tickets.id });
    if (ticket === undefined) {
      throw new Error("chamado não criado");
    }
    const [message] = await database
      .insert(ticketMessages)
      .values({ ticketId: ticket.id, authorId: partner, isAdmin: false, body: "Segue" })
      .returning({ id: ticketMessages.id });
    await database.insert(ticketAttachments).values({
      ticketId: ticket.id,
      messageId: message?.id ?? "",
      storageKey: `tickets/${ticket.id}/nota.pdf`,
      fileName: "nota.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(await accountFileKeys(database, { userId: leaving, tenantIds: [tenantId] })).toEqual([
      `tickets/${ticket.id}/nota.pdf`,
    ]);
  });

  it("deletes a workspace with its stores and sales", async () => {
    const tenantId = await createOrganization();
    const store = await upsertStoreConnection(
      database,
      testStoreInput(tenantId, `del-${tenantId}`),
    );
    await database.insert(orders).values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: `DEL-${tenantId}`,
      status: "paid",
      totalCents: 1000,
      marketplaceFeeCents: 100,
      orderedAt: new Date(),
    });
    await deleteTenantData(database, tenantId);
    expect(await database.select().from(organization).where(eq(organization.id, tenantId))).toEqual(
      [],
    );
    expect(
      await database.select().from(storeConnections).where(eq(storeConnections.tenantId, tenantId)),
    ).toEqual([]);
  });

  it("also lists attachments of messages the user wrote in another workspace's ticket", async () => {
    const tenantId = await createOrganization();
    const [ticket] = await database
      .insert(tickets)
      .values({ tenantId, createdById: partner, subject: "Conversa" })
      .returning({ id: tickets.id });
    if (ticket === undefined) {
      throw new Error("chamado não criado");
    }
    const [message] = await database
      .insert(ticketMessages)
      .values({ ticketId: ticket.id, authorId: leaving, isAdmin: false, body: "Anexo meu" })
      .returning({ id: ticketMessages.id });
    await database.insert(ticketAttachments).values({
      ticketId: ticket.id,
      messageId: message?.id ?? "",
      storageKey: `tickets/${ticket.id}/meu.pdf`,
      fileName: "meu.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(await accountFileKeys(database, { userId: leaving, tenantIds: [] })).toContain(
      `tickets/${ticket.id}/meu.pdf`,
    );
  });

  it("forgets the Stripe customer, so a retried deletion does not ask Stripe again", async () => {
    const tenantId = await createOrganization();
    await database
      .insert(billingAccounts)
      .values({ tenantId, customerId: `cus_${tenantId}`, subscriptionId: `sub_${tenantId}` });
    await forgetBillingCustomer(database, tenantId);
    const [row] = await database
      .select({
        customerId: billingAccounts.customerId,
        subscriptionId: billingAccounts.subscriptionId,
      })
      .from(billingAccounts)
      .where(eq(billingAccounts.tenantId, tenantId));
    expect(row).toEqual({ customerId: null, subscriptionId: null });
  });

  it("keeps the team's audit trail about a deleted account, with no link to the person", async () => {
    const goneId = randomUUID();
    await database.insert(user).values({
      id: goneId,
      name: "Conta excluída",
      email: `gone-${goneId}@sellbridge.test`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [event] = await database
      .insert(adminAuditEvents)
      .values({
        adminId: partner,
        userId: goneId,
        action: "ban_changed",
        details: { banned: true },
      })
      .returning({ id: adminAuditEvents.id });
    await database.delete(user).where(eq(user.id, goneId));
    const [row] = await database
      .select({ userId: adminAuditEvents.userId, details: adminAuditEvents.details })
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.id, event?.id ?? ""));
    expect(row).toEqual({ userId: null, details: { banned: true } });
    await database.delete(adminAuditEvents).where(eq(adminAuditEvents.id, event?.id ?? ""));
  });
});
