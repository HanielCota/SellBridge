import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tickets, user } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenantPair,
  createTestUsers,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  addTicketMessage,
  autoCloseIdleTickets,
  closeTicketForCustomer,
  listStaffTickets,
  rateTicket,
  setTicketCategory,
  setTicketStatus,
} from "./support.ts";
import { createTicket } from "./support-create.ts";
import { getSupportPerformanceRows } from "./support-performance.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantA = "";
let reseller = "";
let ana = "";
let bia = "";

const HOUR = 3_600_000;
/** A clock no other suite uses, so the period only sees this file's tickets. */
const T0 = new Date("2002-07-01T12:00:00Z");

function ids(items: readonly { id: string }[]): string[] {
  return items.map((item) => item.id);
}

function at(hours: number): Date {
  return new Date(T0.getTime() + hours * HOUR);
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  tenantA = tenants.tenantA;
  users = await createTestUsers(database, 3);
  const [first, second, third] = users.ids;
  if (!first || !second || !third) {
    throw new Error("usuários");
  }
  reseller = first;
  ana = second;
  bia = third;
  await database
    .update(user)
    .set({ role: "agent" })
    .where(inArray(user.id, [ana, bia]));
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

async function openTicket(now: Date, situationId: string | null = "order-late") {
  const { ticketId } = await createTicket(database, {
    tenantId: tenantA,
    userId: reseller,
    category: "order",
    situationId,
    subject: "O pedido atrasou: Pedido 1",
    body: "O pedido não chegou e o prazo já passou.",
    attachments: [],
    now,
  });
  return ticketId;
}

async function teamReply(ticketId: string, authorId: string, now: Date) {
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

async function customerClose(ticketId: string, now: Date) {
  await closeTicketForCustomer(database, { ticketId, tenantId: tenantA, userId: reseller, now });
}

async function rowsFor(ticketIds: readonly string[], now: Date) {
  const rows = await getSupportPerformanceRows(database, {
    previousSince: at(-1),
    since: at(-1),
    now,
  });
  const ours = new Set(ticketIds);
  return {
    opened: rows.opened.filter((row) => ours.has(row.ticketId)),
    resolutions: rows.resolutions.filter((row) => ours.has(row.ticketId)),
    ratings: rows.ratings.filter((row) => ours.has(row.ticketId)),
    staff: rows.staff,
    replies: rows.replies,
  };
}

describe("support performance rows", () => {
  it("stores the situation and credits the first response to whoever answered first", async () => {
    const ticketId = await openTicket(at(0));
    await teamReply(ticketId, bia, at(1));
    await teamReply(ticketId, ana, at(2));

    const { opened } = await rowsFor([ticketId], at(3));
    expect(opened).toEqual([
      expect.objectContaining({
        situationId: "order-late",
        origin: "seller",
        firstResponderId: bia,
        firstResponseAt: at(1),
      }),
    ]);
  });

  it("credits a resolution to the last team reply before the close, even when closed automatically", async () => {
    const byCustomer = await openTicket(at(10));
    await teamReply(byCustomer, bia, at(11));
    await teamReply(byCustomer, ana, at(12));
    await customerClose(byCustomer, at(13));
    const idle = await openTicket(at(10));
    await teamReply(idle, bia, at(11));
    await autoCloseIdleTickets(database, { before: at(12), now: at(14) });

    const { resolutions } = await rowsFor([byCustomer, idle], at(15));
    const resolverOf = (ticketId: string) =>
      resolutions.find((row) => row.ticketId === ticketId)?.resolverId;
    expect(resolverOf(byCustomer)).toBe(ana);
    expect(resolverOf(idle)).toBe(bia);
  });

  it("marks a close as came back when reopened within the window, and not after it", async () => {
    const reopened = await openTicket(at(20), null);
    await teamReply(reopened, ana, at(21));
    await customerClose(reopened, at(22));
    await setTicketStatus(database, {
      ticketId: reopened,
      status: "open",
      actorId: ana,
      now: at(30),
    });
    const lateReopen = await openTicket(at(20), null);
    await teamReply(lateReopen, ana, at(21));
    await customerClose(lateReopen, at(22));
    await setTicketStatus(database, {
      ticketId: lateReopen,
      status: "open",
      actorId: ana,
      now: at(22 + 8 * 24),
    });

    const { resolutions } = await rowsFor([reopened, lateReopen], at(22 + 9 * 24));
    expect(resolutions.find((row) => row.ticketId === reopened)?.cameBack).toBe(true);
    expect(resolutions.find((row) => row.ticketId === lateReopen)?.cameBack).toBe(false);
  });

  it("marks a close as came back when the customer opens the same complaint about the same store", async () => {
    const store = await upsertStoreConnection(database, testStoreInput(tenantA, `perf-${tenantA}`));
    const first = await openTicket(at(400), "store-disconnected");
    const again = await openTicket(at(450), "store-disconnected");
    const otherStoreless = await openTicket(at(400), "tracking-stuck");
    const repeatWithoutReference = await openTicket(at(450), "tracking-stuck");
    await database
      .update(tickets)
      .set({ storeConnectionId: store.id, category: "store" })
      .where(inArray(tickets.id, [first, again]));
    for (const ticketId of [first, otherStoreless]) {
      await teamReply(ticketId, ana, at(401));
      await customerClose(ticketId, at(402));
    }

    const { resolutions } = await rowsFor(
      [first, again, otherStoreless, repeatWithoutReference],
      at(451),
    );
    expect(resolutions.find((row) => row.ticketId === first)?.cameBack).toBe(true);
    // Another "rastreio parou" with nothing in common may be a different order.
    expect(resolutions.find((row) => row.ticketId === otherStoreless)?.cameBack).toBe(false);
  });

  it("keeps a rating credited to the resolver after the ticket is reopened and closed by someone else", async () => {
    const ticketId = await openTicket(at(600));
    await teamReply(ticketId, bia, at(601));
    await customerClose(ticketId, at(602));
    await rateTicket(database, {
      ticketId,
      tenantId: tenantA,
      userId: reseller,
      rating: 2,
      comment: "Demorou",
      now: at(603),
    });
    await setTicketStatus(database, { ticketId, status: "open", actorId: ana, now: at(604) });
    await teamReply(ticketId, ana, at(605));
    await setTicketStatus(database, { ticketId, status: "closed", actorId: ana, now: at(606) });

    const { ratings, resolutions } = await rowsFor([ticketId], at(607));
    expect(ratings).toEqual([
      expect.objectContaining({ rating: 2, resolverId: bia, ratedCloseAt: at(602) }),
    ]);
    expect(new Set(resolutions.map((row) => row.resolverId))).toEqual(new Set([ana, bia]));
  });

  it("lists the team with its roles", async () => {
    const { staff } = await rowsFor([], at(0));
    expect(staff.filter((member) => member.id === ana || member.id === bia)).toHaveLength(2);
    expect(staff.find((member) => member.id === ana)?.role).toBe("agent");
  });

  it("credits nobody when a reopened ticket is closed again without a new team reply", async () => {
    const ticketId = await openTicket(at(700));
    await teamReply(ticketId, ana, at(701));
    await customerClose(ticketId, at(702));
    await setTicketStatus(database, { ticketId, status: "open", actorId: bia, now: at(703) });
    await setTicketStatus(database, { ticketId, status: "closed", actorId: bia, now: at(704) });

    const { resolutions } = await rowsFor([ticketId], at(705));
    const byClose = resolutions.toSorted(
      (first, second) => first.closedAt.getTime() - second.closedAt.getTime(),
    );
    expect(byClose.map((row) => row.resolverId)).toEqual([ana, null]);
  });

  it("forgets the situation when the team moves the ticket to another topic", async () => {
    const ticketId = await openTicket(at(800));
    await setTicketCategory(database, {
      ticketId,
      category: "payment",
      actorId: ana,
      now: at(801),
    });

    const { opened } = await rowsFor([ticketId], at(802));
    expect(opened[0]).toMatchObject({ category: "payment", situationId: null });
  });

  it("filters the team queue by situation and by person", async () => {
    const late = await openTicket(at(900), "order-late");
    const stuck = await openTicket(at(900), "tracking-stuck");
    await teamReply(stuck, bia, at(901));
    const page = { page: 1, pageSize: 50 } as const;

    const bySituation = await listStaffTickets(
      database,
      { queue: "all", situationId: "order-late", viewerId: ana, now: at(902) },
      page,
    );
    const byPerson = await listStaffTickets(
      database,
      { queue: "all", assigneeId: bia, viewerId: ana, now: at(902) },
      page,
    );
    expect(ids(bySituation.items)).toContain(late);
    expect(ids(bySituation.items)).not.toContain(stuck);
    expect(ids(byPerson.items)).toContain(stuck);
    expect(ids(byPerson.items)).not.toContain(late);
  });
});
