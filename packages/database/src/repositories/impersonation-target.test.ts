import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, organization, ticketEvents, tickets, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import { findImpersonationTarget } from "./impersonation-target.ts";
import { createTicket } from "./support-create.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let owner = "";
let colleague = "";
let stranger = "";
let staffMember = "";

async function openTicket(tenantId: string, userId: string) {
  return createTicket(database, {
    tenantId,
    userId,
    category: "order",
    subject: "Pedido atrasado: teste",
    body: "O pedido de teste não chegou ao comprador.",
    attachments: [],
  });
}

/** A ticket of profile A, closed and then reopened by `actorId`, the newest one of the profile. */
async function reopenedTicket(actorId: string) {
  const created = await openTicket(tenants.tenantA, owner);
  await database.update(tickets).set({ status: "closed" }).where(eq(tickets.id, created.ticketId));
  await database.insert(ticketEvents).values({
    ticketId: created.ticketId,
    actorId,
    type: "status_changed",
    fromValue: "closed",
    toValue: "open",
  });
  await database
    .update(tickets)
    .set({ status: "open", updatedAt: new Date(Date.now() + 60_000) })
    .where(eq(tickets.id, created.ticketId));
  return created;
}

async function join(organizationId: string, userId: string) {
  await database.insert(member).values({
    id: randomUUID(),
    organizationId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 4);
  [owner = "", colleague = "", stranger = "", staffMember = ""] = users.ids;
  await database.update(user).set({ role: "agent" }).where(eq(user.id, staffMember));
  await database
    .update(organization)
    .set({ kind: "supplier" })
    .where(eq(organization.id, tenants.tenantB));
  await join(tenants.tenantA, owner);
  await join(tenants.tenantA, colleague);
  await join(tenants.tenantB, stranger);
});

afterAll(async () => {
  await users.cleanup();
  await tenants.cleanup();
  await database.$client.end();
});

describe("findImpersonationTarget", () => {
  it("finds no open ticket for a customer who never opened one", async () => {
    expect(await findImpersonationTarget(database, stranger)).toEqual({
      openTicketId: null,
      profileKind: "supplier",
    });
  });

  it("counts a ticket opened by a colleague of the same profile", async () => {
    const { ticketId } = await openTicket(tenants.tenantA, owner);
    const target = await findImpersonationTarget(database, colleague);
    expect(target).toEqual({ openTicketId: ticketId, profileKind: "seller" });
  });

  it("ignores tickets that are closed", async () => {
    const { ticketId } = await openTicket(tenants.tenantB, stranger);
    await database.update(tickets).set({ status: "closed" }).where(eq(tickets.id, ticketId));
    expect((await findImpersonationTarget(database, stranger)).openTicketId).toBeNull();
  });

  it("treats an answered ticket as still open", async () => {
    const { ticketId } = await openTicket(tenants.tenantB, stranger);
    await database.update(tickets).set({ status: "answered" }).where(eq(tickets.id, ticketId));
    expect((await findImpersonationTarget(database, stranger)).openTicketId).toBe(ticketId);
  });

  it("ignores a ticket the team reopened, so the team cannot open the door itself", async () => {
    const { ticketId } = await reopenedTicket(staffMember);
    expect((await findImpersonationTarget(database, owner)).openTicketId).not.toBe(ticketId);
  });

  it("counts a ticket the customer reopened by writing again", async () => {
    const { ticketId } = await reopenedTicket(owner);
    expect((await findImpersonationTarget(database, owner)).openTicketId).toBe(ticketId);
  });

  it("knows nothing about an account without a profile", async () => {
    expect(await findImpersonationTarget(database, randomUUID())).toEqual({
      openTicketId: null,
      profileKind: null,
    });
  });
});
