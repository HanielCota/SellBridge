import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminAuditEvents, billingAccounts, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import { listAuditEntries } from "./admin-audit.ts";
import {
  listProfileExportFacts,
  listTicketsForExport,
  recordReportExport,
} from "./admin-exports.ts";
import { addTicketMessage, assignTicket, setTicketStatus } from "./support.ts";
import { createTicket } from "./support-create.ts";

/* The admin spreadsheets' reads, on a clock no other suite uses. */
const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let reseller = "";
let agent = "";
const ticketIds: string[] = [];

const WINDOW = { from: new Date("2003-06-01T03:00:00Z"), to: new Date("2003-07-01T03:00:00Z") };

async function open(now: Date) {
  const { ticketId } = await createTicket(database, {
    tenantId: tenants.tenantA,
    userId: reseller,
    category: "payment",
    situationId: null,
    subject: "Repasse não caiu",
    body: "O repasse da semana passada não caiu na conta.",
    attachments: [],
    now,
  });
  ticketIds.push(ticketId);
  return ticketId;
}

async function answerCloseAndReopen(ticketId: string) {
  await assignTicket(database, {
    ticketId,
    assigneeId: agent,
    actorId: agent,
    mayAssignOthers: false,
    now: new Date("2003-06-10T13:00:00Z"),
  });
  await addTicketMessage(database, {
    ticketId,
    tenantId: null,
    authorId: agent,
    kind: "reply",
    body: "Já verificamos o repasse.",
    attachments: [],
    now: new Date("2003-06-10T14:00:00Z"),
  });
  const close = { ticketId, actorId: agent };
  await setTicketStatus(database, {
    ...close,
    status: "closed",
    now: new Date("2003-06-11T12:00:00Z"),
  });
  await setTicketStatus(database, {
    ...close,
    status: "open",
    now: new Date("2003-06-12T12:00:00Z"),
  });
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 2);
  [reseller = "", agent = ""] = users.ids;
  await database.update(user).set({ role: "agent" }).where(eq(user.id, agent));
  const inside = await open(new Date("2003-06-10T12:00:00Z"));
  await open(new Date("2003-07-02T12:00:00Z"));
  await answerCloseAndReopen(inside);
  await database
    .insert(billingAccounts)
    .values({ tenantId: tenants.tenantA, plan: "pro", status: "active" });
});

afterAll(async () => {
  await database.delete(adminAuditEvents).where(eq(adminAuditEvents.adminId, agent));
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("admin exports", () => {
  it("lists the tickets opened in the window with assignee, first reply and reopening", async () => {
    const rows = await listTicketsForExport(database, { window: WINDOW, limit: 1000 });
    const mine = rows.filter((row) => ticketIds.includes(row.id));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      assigneeId: agent,
      assigneeName: "Usuário 1",
      reopened: true,
      origin: "seller",
      category: "payment",
    });
    expect(mine[0]?.firstResponseAt).not.toBeNull();
    expect(Object.keys(mine[0] ?? {}).filter((key) => /mail|phone|cpf/i.test(key))).toEqual([]);
  });

  it("reads one row past the limit, so the route can refuse a cut file", async () => {
    const rows = await listTicketsForExport(database, { window: WINDOW, limit: 0 });
    expect(rows).toHaveLength(1);
  });

  it("gives each profile its name, kind and plan", async () => {
    const facts = await listProfileExportFacts(database, {
      tenantIds: [tenants.tenantA],
      window: WINDOW,
    });
    expect(facts).toEqual([
      expect.objectContaining({
        tenantId: tenants.tenantA,
        kind: "seller",
        plan: "pro",
        billingStatus: "active",
        ordersInWindow: 0,
      }),
    ]);
    expect(await listProfileExportFacts(database, { tenantIds: [], window: WINDOW })).toEqual([]);
  });

  it("records every download in the audit trail, found by its date window", async () => {
    await recordReportExport(database, {
      adminId: agent,
      kind: "equipe",
      period: "2003-06",
      names: false,
    });
    const page = await listAuditEntries(database, {
      page: 1,
      pageSize: 10,
      actorId: agent,
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
    });
    const exported = page.items.find((entry) => entry.action === "report.exported");
    expect(exported).toMatchObject({
      source: "account",
      details: { kind: "equipe", period: "2003-06", names: false },
    });
    const before = await listAuditEntries(database, {
      page: 1,
      pageSize: 10,
      actorId: agent,
      to: WINDOW.to,
    });
    expect(before.items.some((entry) => entry.action === "report.exported")).toBe(false);
  });
});
