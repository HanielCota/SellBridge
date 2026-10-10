import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  listings,
  listingTargets,
  notificationReads,
  orders,
  storeConnections,
  tickets,
} from "../schema/index.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { daysBefore } from "./time-window.ts";

const WINDOW_DAYS = 14;
const PER_KIND = 10;
/** Sales are frequent; a handful is enough to show activity without burying problems. */
const SALES_SHOWN = 5;

interface EventBase {
  /** Id of the order, publication, store or ticket the event is about. */
  entityId: string;
  at: Date;
}

export interface SaleEvent extends EventBase {
  kind: "sale";
  externalOrderId: string;
  totalCents: number;
  storeName: string;
}

export interface ListingErrorEvent extends EventBase {
  kind: "listing_error";
  listingTitle: string;
  errorReason: string | null;
}

export interface StoreProblemEvent extends EventBase {
  kind: "store_problem";
  storeName: string;
}

export interface SupportReplyEvent extends EventBase {
  kind: "support_reply";
  subject: string;
}

/** Something that happened in the tenant and deserves the reseller's attention. */
export type NotificationEvent =
  SaleEvent | ListingErrorEvent | StoreProblemEvent | SupportReplyEvent;

export type NotificationKind = NotificationEvent["kind"];

function since(): Date {
  return daysBefore(WINDOW_DAYS);
}

async function saleEvents(database: Database, tenantId: string): Promise<SaleEvent[]> {
  const rows = await database
    .select({
      entityId: orders.id,
      externalOrderId: orders.externalOrderId,
      totalCents: orders.totalCents,
      at: orders.orderedAt,
      storeName: storeConnections.shopName,
    })
    .from(orders)
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.orderedAt, since()),
        isCountedOrder(orders.status),
      ),
    )
    .orderBy(desc(orders.orderedAt))
    .limit(SALES_SHOWN);
  return rows.map((row) => ({ ...row, kind: "sale" as const }));
}

async function listingErrorEvents(
  database: Database,
  tenantId: string,
): Promise<ListingErrorEvent[]> {
  const rows = await database
    .select({
      entityId: listingTargets.id,
      at: listingTargets.updatedAt,
      errorReason: listingTargets.errorReason,
      listingTitle: listings.title,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(and(eq(listingTargets.tenantId, tenantId), eq(listingTargets.status, "error")))
    .orderBy(desc(listingTargets.updatedAt))
    .limit(PER_KIND);
  return rows.map((row) => ({ ...row, kind: "listing_error" as const }));
}

async function storeProblemEvents(
  database: Database,
  tenantId: string,
): Promise<StoreProblemEvent[]> {
  const rows = await database
    .select({
      entityId: storeConnections.id,
      storeName: storeConnections.shopName,
      at: storeConnections.updatedAt,
    })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.status, ["expired", "error"]),
      ),
    )
    .limit(PER_KIND);
  return rows.map((row) => ({ ...row, kind: "store_problem" as const }));
}

async function supportReplyEvents(
  database: Database,
  tenantId: string,
): Promise<SupportReplyEvent[]> {
  const rows = await database
    .select({ entityId: tickets.id, subject: tickets.subject, at: tickets.updatedAt })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.status, "answered")))
    .orderBy(desc(tickets.updatedAt))
    .limit(PER_KIND);
  return rows.map((row) => ({ ...row, kind: "support_reply" as const }));
}

async function lastSeenAt(database: Database, userId: string): Promise<Date | null> {
  const reads = await database
    .select({ seenAt: notificationReads.seenAt })
    .from(notificationReads)
    .where(eq(notificationReads.userId, userId));
  return reads.at(0)?.seenAt ?? null;
}

/**
 * Recent events of the tenant (unsorted, a few per kind) and when the user last opened the
 * notifications. Ordering, capping and wording are up to the caller.
 */
export async function listNotificationEvents(
  database: Database,
  input: { tenantId: string; userId: string },
): Promise<{ events: NotificationEvent[]; seenAt: Date | null }> {
  const [sales, listingErrors, stores, support, seenAt] = await Promise.all([
    saleEvents(database, input.tenantId),
    listingErrorEvents(database, input.tenantId),
    storeProblemEvents(database, input.tenantId),
    supportReplyEvents(database, input.tenantId),
    lastSeenAt(database, input.userId),
  ]);
  return { events: [...sales, ...listingErrors, ...stores, ...support], seenAt };
}

export async function markNotificationsSeen(database: Database, userId: string): Promise<void> {
  const seenAt = new Date();
  await database
    .insert(notificationReads)
    .values({ userId, seenAt })
    .onConflictDoUpdate({ target: notificationReads.userId, set: { seenAt } });
}
