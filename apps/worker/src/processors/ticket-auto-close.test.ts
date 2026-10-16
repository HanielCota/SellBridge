import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestTenants, createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { createTicketAutoCloseProcessor } from "./ticket-auto-close.ts";

const { database } = createWorkerTestEnvironment();
const DAY = 86_400_000;
/** A clock far in the past, so only this test's tickets fall inside the window. */
const NOW = new Date("2001-06-01T12:00:00Z");
const userId = `test-${randomUUID()}`;

let tenants: Awaited<ReturnType<typeof createTestTenants>>;

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  await database
    .insert(schema.user)
    .values({ id: userId, name: "Revendedor", email: `${userId}@sellbridge.test` });
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(schema.user).where(inArray(schema.user.id, [userId]));
  await database.$client.end();
});

async function answeredTicket(daysAgo: number) {
  const [ticket] = await database
    .insert(schema.tickets)
    .values({
      tenantId: tenants.ids[0] ?? "",
      createdById: userId,
      subject: `Respondido há ${daysAgo} dias`,
      status: "answered",
      updatedAt: new Date(NOW.getTime() - daysAgo * DAY),
    })
    .returning({ id: schema.tickets.id });
  return ticket?.id ?? "";
}

describe("ticket-auto-close processor", () => {
  it("closes answered tickets idle for a week and keeps the recent ones", async () => {
    const idle = await answeredTicket(8);
    const recent = await answeredTicket(6);

    const result = await createTicketAutoCloseProcessor({ database, now: () => NOW })();
    // Other suites may leave old tickets in the shared database, so only ours are checked.
    expect(result.closed).toBeGreaterThanOrEqual(1);

    const rows = await database
      .select({ id: schema.tickets.id, status: schema.tickets.status })
      .from(schema.tickets)
      .where(inArray(schema.tickets.id, [idle, recent]));
    expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toEqual({
      [idle]: "closed",
      [recent]: "answered",
    });
    const events = await database
      .select({
        actorId: schema.ticketEvents.actorId,
        automatic: schema.ticketEvents.automatic,
        toValue: schema.ticketEvents.toValue,
      })
      .from(schema.ticketEvents)
      .where(eq(schema.ticketEvents.ticketId, idle));
    expect(events).toEqual([{ actorId: null, automatic: true, toValue: "closed" }]);
  });
});
