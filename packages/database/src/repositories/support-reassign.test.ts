import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tickets, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import { assignTicket } from "./support.ts";
import { createTicket } from "./support-create.ts";
import { reassignOverdueTickets } from "./support-reassign.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let reseller = "";
let behind = "";
let colleague = "";
let supervisor = "";

const HOUR = 3_600_000;
/** Far in the past, so these tickets are long overdue at `LATER`. */
const OPENED_AT = new Date("2001-03-05T12:00:00Z");
const LATER = new Date(OPENED_AT.getTime() + 1_000 * HOUR);
const LOCK_WAIT_POLL_MILLISECONDS = 20;
const LOCK_WAIT_MAX_POLLS = 250;

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 4);
  const [first, second, third, fourth] = users.ids;
  if (!first || !second || !third || !fourth) {
    throw new Error("usuários");
  }
  reseller = first;
  behind = second;
  colleague = third;
  supervisor = fourth;
  await database
    .update(user)
    .set({ role: "agent" })
    .where(inArray(user.id, [behind, colleague]));
  await database.update(user).set({ role: "supervisor" }).where(eq(user.id, supervisor));
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

async function overdueTicketOf(assigneeId: string): Promise<string> {
  const { ticketId } = await createTicket(database, {
    tenantId: tenants.tenantA,
    userId: reseller,
    category: "order",
    subject: "Chamado atrasado para repassar",
    body: "Descrição do problema com detalhes suficientes.",
    attachments: [],
    now: OPENED_AT,
  });
  await assignTicket(database, {
    ticketId,
    assigneeId,
    actorId: supervisor,
    mayAssignOthers: true,
    now: OPENED_AT,
  });
  return ticketId;
}

async function assigneeOf(ticketId: string): Promise<string | null> {
  const [row] = await database
    .select({ assigneeId: tickets.assigneeId })
    .from(tickets)
    .where(eq(tickets.id, ticketId));
  return row?.assigneeId ?? null;
}

describe("reassignOverdueTickets", () => {
  it("hands every late ticket of the person to the colleague", async () => {
    const first = await overdueTicketOf(behind);
    const second = await overdueTicketOf(behind);
    const moved = await reassignOverdueTickets(database, {
      fromId: behind,
      toId: colleague,
      actorId: supervisor,
      now: LATER,
    });
    expect(moved).toBe(2);
    expect(await assigneeOf(first)).toBe(colleague);
    expect(await assigneeOf(second)).toBe(colleague);
  });

  it("refuses a colleague outside the support team and moves nothing", async () => {
    const ticketId = await overdueTicketOf(behind);
    await expect(
      reassignOverdueTickets(database, {
        fromId: behind,
        toId: reseller,
        actorId: supervisor,
        now: LATER,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await assigneeOf(ticketId)).toBe(behind);
  });

  it("leaves a ticket that changed hands while the move waited for it", async () => {
    await database.update(tickets).set({ assigneeId: null }).where(eq(tickets.assigneeId, behind));
    const kept = await overdueTicketOf(behind);
    const takenElsewhere = await overdueTicketOf(behind);

    let move: Promise<number> | undefined;
    await database.transaction(async (transaction) => {
      // Another supervisor gives one ticket to someone else and has not committed yet.
      await transaction
        .update(tickets)
        .set({ assigneeId: supervisor })
        .where(eq(tickets.id, takenElsewhere));
      move = reassignOverdueTickets(database, {
        fromId: behind,
        toId: colleague,
        actorId: supervisor,
        now: LATER,
      });
      await waitForLockWait(transaction);
    });
    if (move === undefined) {
      throw new Error("move did not start");
    }

    expect(await move).toBe(1);
    expect(await assigneeOf(kept)).toBe(colleague);
    expect(await assigneeOf(takenElsewhere)).toBe(supervisor);
  });
});

/** Waits until another session is blocked by this one (the move reaching the locked ticket). */
async function waitForLockWait(executor: Pick<typeof database, "execute">): Promise<void> {
  for (let poll = 0; poll < LOCK_WAIT_MAX_POLLS; poll += 1) {
    // pg_stat_activity is frozen for the rest of a transaction once read: clear it every poll.
    await executor.execute(sql`select pg_stat_clear_snapshot()`);
    const result = await executor.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where pg_backend_pid() = any(pg_blocking_pids(pid))`,
    );
    if ((result[0]?.waiting ?? 0) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MILLISECONDS));
  }
  throw new Error("the move never waited for the locked ticket");
}
