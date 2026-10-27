import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { TicketCategory, TicketPriority, TicketStatus } from "@sellbridge/shared/ticket-rules";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  adminAuditEvents,
  billingAccounts,
  organization,
  ticketEvents,
  tickets,
} from "../schema/index.ts";
import type { ReportWindow } from "./admin-report.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { timestampOf } from "./sql/raw-values.ts";
import { assignee } from "./support-assignee.ts";
import { platformTicketSql } from "./support-audience.ts";

/*
 * The admin's spreadsheets (team, tickets, customers, audit). Each read takes a `limit` and
 * returns at most one row past it, so the route can refuse a file too big to open instead of
 * cutting it without saying. No e-mail, phone, CPF or address leaves through here.
 */

export interface TicketExportRow {
  id: string;
  createdAt: Date;
  /** The ticket's latest close; null while it is open. */
  closedAt: Date | null;
  category: TicketCategory;
  situationId: string | null;
  priority: TicketPriority;
  origin: ProfileKind;
  status: TicketStatus;
  /** The customer's profile (store) name, as the team inbox shows it. */
  profileName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  firstResponseAt: Date | null;
  /** Reopened at least once after a close. */
  reopened: boolean;
  rating: number | null;
}

const reopenedSql = sql<boolean>`exists (
  select 1 from ${ticketEvents} r
  where r.ticket_id = ${tickets.id} and r.type = 'status_changed' and r.from_value = 'closed'
)`;

/** Tickets the team answers that were opened in the window, oldest first. */
export async function listTicketsForExport(
  database: Database,
  input: { window: ReportWindow; limit: number },
): Promise<TicketExportRow[]> {
  return database
    .select({
      id: tickets.id,
      createdAt: tickets.createdAt,
      closedAt: tickets.closedAt,
      category: tickets.category,
      situationId: tickets.situationId,
      priority: tickets.priority,
      origin: organization.kind,
      status: tickets.status,
      profileName: organization.name,
      assigneeId: tickets.assigneeId,
      assigneeName: assignee.name,
      firstResponseAt: tickets.firstResponseAt,
      reopened: reopenedSql,
      rating: tickets.rating,
    })
    .from(tickets)
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
    .where(
      and(
        platformTicketSql,
        gte(tickets.createdAt, input.window.from),
        lt(tickets.createdAt, input.window.to),
      ),
    )
    .orderBy(asc(tickets.createdAt), asc(tickets.id))
    .limit(input.limit + 1);
}

export interface ProfileExportFacts {
  tenantId: string;
  profileName: string;
  kind: ProfileKind;
  plan: string | null;
  billingStatus: string | null;
  /** Counted orders of a reseller profile in the window; suppliers sell through resellers. */
  ordersInWindow: number;
}

/** Profile name, kind, plan and orders in the window of each profile asked for. */
export async function listProfileExportFacts(
  database: Database,
  input: { tenantIds: readonly string[]; window: ReportWindow },
): Promise<ProfileExportFacts[]> {
  if (input.tenantIds.length === 0) {
    return [];
  }
  const { from, to } = input.window;
  return database
    .select({
      tenantId: organization.id,
      profileName: organization.name,
      kind: organization.kind,
      plan: billingAccounts.plan,
      billingStatus: billingAccounts.status,
      ordersInWindow:
        sql`(select count(*) from orders o where o.tenant_id = ${organization.id} and o.ordered_at >= ${timestampOf(from)} and o.ordered_at < ${timestampOf(to)} and ${isCountedOrder(sql.raw("o.status"))})`.mapWith(
          Number,
        ),
    })
    .from(organization)
    .leftJoin(billingAccounts, eq(billingAccounts.tenantId, organization.id))
    .where(inArray(organization.id, [...input.tenantIds]));
}

export type AdminExportKind = "equipe" | "chamados" | "clientes" | "auditoria";

/**
 * Every admin download goes to the audit trail: who took which file of which period, and
 * whether it named the team. Not tied to a customer, so `user_id` stays empty.
 */
export async function recordReportExport(
  database: Database,
  event: { adminId: string; kind: AdminExportKind; period: string; names: boolean },
): Promise<void> {
  await database.insert(adminAuditEvents).values({
    adminId: event.adminId,
    action: "report.exported",
    details: { kind: event.kind, period: event.period, names: event.names },
  });
}
