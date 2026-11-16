import type {
  ClosedBy,
  ReportCloseRow,
  ReportConversationRow,
  ReportReopenRow,
  SupplierSupportRows,
} from "@sellbridge/shared/supplier-support-report";
import type { SupplierConversationTopicId } from "@sellbridge/shared/supplier-conversation-topics";
import { and, eq, exists, gte, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { member, ticketEvents, tickets } from "../schema/index.ts";
import { supplierConversationSql } from "./support-audience.ts";

/*
 * The raw rows of the supplier's answering report: its conversations, finishes and reopenings.
 * The rules that turn them into figures live in `@sellbridge/shared/supplier-support-report`.
 * A supplier gets a few hundred conversations a month at most, so the rows come whole.
 */

function ofSupplier(supplierId: string): SQL | undefined {
  return and(supplierConversationSql, eq(tickets.supplierId, supplierId));
}

/** Every conversation has a topic (a check constraint); a missing one is a broken row. */
function topicOf(topic: SupplierConversationTopicId | null): SupplierConversationTopicId {
  if (topic === null) {
    throw new Error("Supplier conversation without a topic: the tickets check constraint failed");
  }
  return topic;
}

async function listReportConversations(
  database: Database,
  input: { supplierId: string; since: Date },
): Promise<ReportConversationRow[]> {
  const rows = await database
    .select({
      id: tickets.id,
      topic: tickets.supplierTopic,
      createdAt: tickets.createdAt,
      firstResponseAt: tickets.firstResponseAt,
      status: tickets.status,
      awaitingSince: tickets.awaitingSince,
      closedAt: tickets.closedAt,
    })
    .from(tickets)
    .where(
      and(
        ofSupplier(input.supplierId),
        or(gte(tickets.createdAt, input.since), eq(tickets.status, "open")),
      ),
    );
  return rows.map((row) => ({ ...row, topic: topicOf(row.topic) }));
}

/** Someone of the store's account finished it; the system marks its own finishes `automatic`. */
function closedByOf(row: { automatic: boolean; byStore: boolean }): ClosedBy {
  if (row.automatic) {
    return "automatic";
  }
  // The team only reads these conversations, so anyone else is the supplier.
  return row.byStore ? "store" : "supplier";
}

async function listReportCloses(
  database: Database,
  input: { supplierId: string; since: Date },
): Promise<ReportCloseRow[]> {
  const byStore = sql<boolean>`${exists(
    database
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(eq(member.organizationId, tickets.tenantId), eq(member.userId, ticketEvents.actorId)),
      ),
  )}`;
  const rows = await database
    .select({
      ticketId: ticketEvents.ticketId,
      topic: tickets.supplierTopic,
      closedAt: ticketEvents.createdAt,
      automatic: ticketEvents.automatic,
      byStore,
    })
    .from(ticketEvents)
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .where(
      and(
        ofSupplier(input.supplierId),
        eq(ticketEvents.type, "status_changed"),
        eq(ticketEvents.toValue, "closed"),
        gte(ticketEvents.createdAt, input.since),
      ),
    );
  return rows.map((row) => ({
    ticketId: row.ticketId,
    topic: topicOf(row.topic),
    closedAt: row.closedAt,
    closedBy: closedByOf(row),
  }));
}

async function listReportReopens(
  database: Database,
  input: { supplierId: string; since: Date },
): Promise<ReportReopenRow[]> {
  return database
    .select({ ticketId: ticketEvents.ticketId, reopenedAt: ticketEvents.createdAt })
    .from(ticketEvents)
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .where(
      and(
        ofSupplier(input.supplierId),
        eq(ticketEvents.type, "status_changed"),
        eq(ticketEvents.fromValue, "closed"),
        gte(ticketEvents.createdAt, input.since),
      ),
    );
}

/**
 * The rows behind the supplier's report: conversations opened since `previousSince` (the start of
 * the period before) plus every one still waiting, and the finishes and reopenings since `since`.
 */
export async function listSupplierSupportRows(
  database: Database,
  input: { supplierId: string; since: Date; previousSince: Date },
): Promise<SupplierSupportRows> {
  const [conversations, closes, reopens] = await Promise.all([
    listReportConversations(database, {
      supplierId: input.supplierId,
      since: input.previousSince,
    }),
    listReportCloses(database, { supplierId: input.supplierId, since: input.since }),
    listReportReopens(database, { supplierId: input.supplierId, since: input.since }),
  ]);
  return { conversations, closes, reopens };
}
