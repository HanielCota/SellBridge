import type { AdminReportRows } from "@sellbridge/database/repositories";
import type {
  OpenedTicketRow,
  RatingRow,
  ResolutionRow,
  StaffRow,
  TeamReplyRow,
} from "@sellbridge/shared/support-performance";

/*
 * Test rows for the admin report and its spreadsheets: September 2026 (closed) seen on
 * 2026-10-27, with two current team members and one who left in September.
 */

export const NOW = new Date("2026-10-27T15:00:00.000Z");
const HOUR = 3_600_000;

export const ANA: StaffRow = {
  id: "ana",
  name: "Ana Souza",
  role: "agent",
  joinedAt: new Date("2025-01-01T12:00:00.000Z"),
  banned: false,
};
export const BIA: StaffRow = { ...ANA, id: "bia", name: "Bia Lima", role: "supervisor" };
/** Left the team in late September: `getAdminReportRows` adds her as a blocked agent. */
export const CARLA: StaffRow = { ...ANA, id: "carla", name: "Carla Dias", banned: true };
/** On the team, but did nothing in September. */
export const DANI: StaffRow = { ...ANA, id: "dani", name: "Dani Reis" };

function at(iso: string): Date {
  return new Date(iso);
}

export function opened(
  id: string,
  iso: string,
  overrides: Partial<OpenedTicketRow> = {},
): OpenedTicketRow {
  const createdAt = at(iso);
  return {
    ticketId: `${id}-0000-0000-0000-000000000000`,
    tenantId: "tenant",
    origin: "seller",
    category: "order",
    situationId: null,
    priority: "normal",
    createdAt,
    firstResponseAt: new Date(createdAt.getTime() + HOUR),
    firstResponderId: ANA.id,
    ...overrides,
  };
}

export function resolution(
  id: string,
  iso: string,
  overrides: Partial<ResolutionRow> = {},
): ResolutionRow {
  return {
    ticketId: `${id}-0000-0000-0000-000000000000`,
    origin: "seller",
    category: "order",
    situationId: null,
    openedAt: at("2026-09-01T12:00:00.000Z"),
    closedAt: at(iso),
    resolverId: ANA.id,
    cameBack: false,
    ...overrides,
  };
}

export function rating(id: string, iso: string, overrides: Partial<RatingRow> = {}): RatingRow {
  return {
    ticketId: `${id}-0000-0000-0000-000000000000`,
    origin: "seller",
    category: "order",
    situationId: null,
    ratedAt: at(iso),
    rating: 5,
    comment: null,
    resolverId: ANA.id,
    ratedCloseAt: at(iso),
    ...overrides,
  };
}

export function reply(authorId: string, iso: string): TeamReplyRow {
  return { authorId, origin: "seller", createdAt: at(iso) };
}

/** Tickets opened, closed and rated around September 2026. */
function sampleTickets(): Pick<
  AdminReportRows["performance"],
  "opened" | "resolutions" | "ratings"
> {
  return {
    opened: [
      opened("aaaaaaaa", "2026-09-02T13:00:00.000Z"),
      opened("bbbbbbbb", "2026-09-03T13:00:00.000Z", {
        category: "payment",
        priority: "urgent",
        firstResponseAt: at("2026-09-03T18:00:00.000Z"),
        firstResponderId: BIA.id,
      }),
      opened("cccccccc", "2026-09-20T23:30:00.000Z", {
        firstResponseAt: null,
        firstResponderId: null,
      }),
      opened("dddddddd", "2026-08-10T13:00:00.000Z"),
      opened("eeeeeeee", "2026-10-02T13:00:00.000Z"),
    ],
    resolutions: [
      resolution("aaaaaaaa", "2026-09-04T13:00:00.000Z", {
        openedAt: at("2026-08-30T12:00:00.000Z"),
      }),
      resolution("bbbbbbbb", "2026-09-05T13:00:00.000Z", {
        resolverId: BIA.id,
        cameBack: true,
        category: "payment",
      }),
      resolution("ffffffff", "2026-09-10T13:00:00.000Z", { resolverId: CARLA.id }),
      resolution("dddddddd", "2026-08-12T13:00:00.000Z"),
    ],
    ratings: [
      rating("aaaaaaaa", "2026-09-04T15:00:00.000Z"),
      rating("bbbbbbbb", "2026-09-05T15:00:00.000Z", {
        rating: 2,
        comment: "Demorou demais",
        resolverId: BIA.id,
      }),
    ],
  };
}

/** Replies, the queue right now and the team (Carla has left). */
function sampleActivity(): Pick<AdminReportRows["performance"], "replies" | "queue" | "staff"> {
  return {
    replies: [
      reply(ANA.id, "2026-09-02T14:00:00.000Z"),
      reply(ANA.id, "2026-09-04T13:00:00.000Z"),
      reply(BIA.id, "2026-09-03T18:00:00.000Z"),
      reply(CARLA.id, "2026-09-10T12:00:00.000Z"),
      reply(ANA.id, "2026-10-02T14:00:00.000Z"),
    ],
    queue: [
      {
        ticketId: "q1",
        origin: "seller",
        assigneeId: ANA.id,
        awaitingSince: at("2026-10-26T12:00:00.000Z"),
        overdue: true,
      },
      {
        ticketId: "q2",
        origin: "supplier",
        assigneeId: null,
        awaitingSince: null,
        overdue: false,
      },
    ],
    staff: [ANA, BIA, DANI, CARLA],
  };
}

export function adminRows(
  overrides: Partial<AdminReportRows["performance"]> = {},
): AdminReportRows {
  return {
    performance: {
      ...sampleTickets(),
      ...sampleActivity(),
      ...overrides,
    },
    formerStaff: [{ id: CARLA.id, name: CARLA.name, joinedAt: CARLA.joinedAt }],
    platform: {
      current: { newSellers: 4, newSuppliers: 1, sellersWithOrders: 12 },
      previous: { newSellers: 2, newSuppliers: 0, sellersWithOrders: 10 },
    },
  };
}
