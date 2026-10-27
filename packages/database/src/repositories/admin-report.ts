import { STAFF_ROLES } from "@sellbridge/shared/staff-access";
import type { StaffRow, SupportPerformanceRows } from "@sellbridge/shared/support-performance";
import { and, eq, gte, lt, notInArray, or, isNull, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, organization, ticketMessages, tickets, user } from "../schema/index.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { platformTicketSql } from "./support-audience.ts";
import { getSupportPerformanceRows } from "./support-performance.ts";

/*
 * Rows for the admin's monthly report of the support and the team. The ticket rows are the very
 * ones the "Desempenho" screen reads (`getSupportPerformanceRows`), so both agree; this adds the
 * people who left the team but worked in the period, and a few platform counters.
 */

export interface ReportWindow {
  from: Date;
  /** Exclusive end. */
  to: Date;
}

/** Someone who answered tickets in the period and is no longer on the team (role changed). */
export interface FormerStaffMember {
  id: string;
  name: string;
  joinedAt: Date;
}

export interface PlatformAccountCounts {
  newSellers: number;
  newSuppliers: number;
  /** Reseller profiles with at least one counted order in the window. */
  sellersWithOrders: number;
}

export interface AdminReportRows {
  performance: SupportPerformanceRows;
  formerStaff: FormerStaffMember[];
  platform: { current: PlatformAccountCounts; previous: PlatformAccountCounts };
}

/** Authors of public team replies in the window whose account is no longer on the team. */
async function formerStaffWhoReplied(
  database: Database,
  window: ReportWindow,
): Promise<FormerStaffMember[]> {
  return database
    .selectDistinct({ id: user.id, name: user.name, joinedAt: user.createdAt })
    .from(ticketMessages)
    .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
    .innerJoin(user, eq(user.id, ticketMessages.authorId))
    .where(
      and(
        platformTicketSql,
        eq(ticketMessages.isAdmin, true),
        eq(ticketMessages.isInternal, false),
        gte(ticketMessages.createdAt, window.from),
        lt(ticketMessages.createdAt, window.to),
        or(isNull(user.role), notInArray(user.role, [...STAFF_ROLES])),
      ),
    );
}

async function platformAccountCounts(
  database: Database,
  window: ReportWindow,
): Promise<PlatformAccountCounts> {
  const [created] = await database
    .select({
      newSellers: sql`count(*) filter (where ${organization.kind} = 'seller')`.mapWith(Number),
      newSuppliers: sql`count(*) filter (where ${organization.kind} = 'supplier')`.mapWith(Number),
    })
    .from(organization)
    .where(and(gte(organization.createdAt, window.from), lt(organization.createdAt, window.to)));
  const [active] = await database
    .select({ sellers: sql`count(distinct ${orders.tenantId})`.mapWith(Number) })
    .from(orders)
    .where(
      and(
        gte(orders.orderedAt, window.from),
        lt(orders.orderedAt, window.to),
        isCountedOrder(orders.status),
      ),
    );
  return {
    newSellers: created?.newSellers ?? 0,
    newSuppliers: created?.newSuppliers ?? 0,
    sellersWithOrders: active?.sellers ?? 0,
  };
}

/** A former member counts like a blocked one: only shown when they worked in the period. */
export function formerStaffRows(former: readonly FormerStaffMember[]): StaffRow[] {
  return former.map((member) => ({ ...member, role: "agent", banned: true }));
}

/**
 * Everything the admin report needs: ticket rows since `trendSince` (the oldest month of the
 * trend chart) or the previous period, whichever is older; team replies since the period starts.
 * Rows have no upper bound: the report cuts them at the period's end.
 */
export async function getAdminReportRows(
  database: Database,
  input: { period: ReportWindow; previous: ReportWindow; trendSince: Date; now: Date },
): Promise<AdminReportRows> {
  const oldest = Math.min(input.trendSince.getTime(), input.previous.from.getTime());
  const [performance, formerStaff, current, previous] = await Promise.all([
    getSupportPerformanceRows(database, {
      previousSince: new Date(oldest),
      since: input.period.from,
      now: input.now,
    }),
    formerStaffWhoReplied(database, input.period),
    platformAccountCounts(database, input.period),
    platformAccountCounts(database, input.previous),
  ]);
  return {
    performance: {
      ...performance,
      staff: [...performance.staff, ...formerStaffRows(formerStaff)],
    },
    formerStaff,
    platform: { current, previous },
  };
}
