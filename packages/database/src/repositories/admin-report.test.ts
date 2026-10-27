import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { organization, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import { getAdminReportRows } from "./admin-report.ts";
import { addTicketMessage } from "./support.ts";
import { createTicket } from "./support-create.ts";

/*
 * The admin report's rows: the support rows of "Desempenho", plus people who left the team but
 * replied in the period, and the platform's new accounts. A clock no other suite uses.
 */
const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let reseller = "";
let current = "";
let former = "";

const HOUR = 3_600_000;
const PERIOD = { from: new Date("2003-03-01T03:00:00Z"), to: new Date("2003-04-01T03:00:00Z") };
const PREVIOUS = { from: new Date("2003-02-01T03:00:00Z"), to: PERIOD.from };
const NOW = new Date("2003-04-15T12:00:00Z");

async function reply(ticketId: string, authorId: string, now: Date) {
  await addTicketMessage(database, {
    ticketId,
    tenantId: null,
    authorId,
    kind: "reply",
    body: "Resposta do suporte.",
    attachments: [],
    now,
  });
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 3);
  [reseller = "", current = "", former = ""] = users.ids;
  await database.update(user).set({ role: "agent" }).where(eq(user.id, current));
  await database
    .update(organization)
    .set({ createdAt: new Date("2003-03-10T12:00:00Z") })
    .where(eq(organization.id, tenants.tenantA));
  const opened = new Date("2003-03-05T12:00:00Z");
  const { ticketId } = await createTicket(database, {
    tenantId: tenants.tenantA,
    userId: reseller,
    category: "order",
    situationId: null,
    subject: "Pedido atrasado",
    body: "O pedido ainda não chegou na casa do cliente.",
    attachments: [],
    now: opened,
  });
  await database.update(user).set({ role: "agent" }).where(eq(user.id, former));
  await reply(ticketId, former, new Date(opened.getTime() + HOUR));
  await reply(ticketId, current, new Date(opened.getTime() + 2 * HOUR));
  // Replied in March as an agent, then left the team: the role went back to a customer's.
  await database.update(user).set({ role: "user" }).where(eq(user.id, former));
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("admin report rows", () => {
  it("keeps whoever replied in the period after they left the team", async () => {
    const rows = await getAdminReportRows(database, {
      period: PERIOD,
      previous: PREVIOUS,
      trendSince: new Date("2002-10-01T03:00:00Z"),
      now: NOW,
    });
    expect(rows.formerStaff.map((member) => member.id)).toEqual([former]);
    const staffIds = rows.performance.staff.map((member) => member.id);
    expect(staffIds).toEqual(expect.arrayContaining([current, former]));
    expect(rows.performance.staff.find((member) => member.id === former)?.banned).toBe(true);
    const mine = rows.performance.opened.filter((row) => row.tenantId === tenants.tenantA);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.firstResponderId).toBe(former);
  });

  it("counts the profiles created in the period and nobody outside it", async () => {
    const rows = await getAdminReportRows(database, {
      period: PERIOD,
      previous: PREVIOUS,
      trendSince: PREVIOUS.from,
      now: NOW,
    });
    expect(rows.platform.current.newSellers).toBeGreaterThanOrEqual(1);
    const before = await getAdminReportRows(database, {
      period: PREVIOUS,
      previous: { from: new Date("2003-01-01T03:00:00Z"), to: PREVIOUS.from },
      trendSince: PREVIOUS.from,
      now: NOW,
    });
    expect(before.formerStaff.map((member) => member.id)).not.toContain(former);
  });
});
