import { unavailableReason, type UnavailableReason } from "@sellbridge/shared/catalog-availability";
import { daysBefore } from "@sellbridge/shared/time";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import type { Database } from "../client.ts";
import {
  categories,
  listings,
  listingTargets,
  notificationReads,
  orderItems,
  orders,
  orderShipments,
  shipmentEvents,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { sellableOnMarketplace } from "./sql/sellable.ts";
import { countPendingReviews } from "./supplier-reviews.ts";
import { shipmentLateEvents, type ShipmentLateEvent } from "./shipment-timing.ts";
import { listUnreadSupportReplies } from "./support.ts";

const WINDOW_DAYS = 14;
const PER_KIND = 10;
/** Problems that stay in the list until resolved, whatever the user cleared. */
export const STANDING_NOTIFICATION_KINDS: ReadonlySet<NotificationEvent["kind"]> = new Set([
  "stock_shortage",
  "shipment_cancelled",
  "listing_unavailable",
  "shipment_late",
]);
/** Sales are frequent; a handful is enough to show activity without burying problems. */
const SALES_SHOWN = 5;

interface EventBase {
  /** Id of the order, publication, store or ticket the event is about. */
  entityId: string;
  at: Date;
}

/** The item a sale is shown with: its first item, alphabetically, like the financial statement. */
export interface SaleProduct {
  title: string;
  imageUrl: string | null;
  categoryName: string | null;
}

export interface SaleEvent extends EventBase {
  kind: "sale";
  externalOrderId: string;
  totalCents: number;
  storeName: string;
  /** Null when the order has no items recorded. */
  product: SaleProduct | null;
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

/** Delivered orders whose supplier the reseller has not reviewed yet, as a single entry. */
export interface ReviewPendingEvent extends EventBase {
  kind: "review_pending";
  pending: number;
}

/** A paid order with an item the supplier's stock could not cover (see stock-reservations.ts). */
export interface StockShortageEvent extends EventBase {
  kind: "stock_shortage";
  externalOrderId: string;
  /** The first short item, alphabetically, like a sale's product. */
  productTitle: string;
}

/** A supplier cancelled its parcel of a paid order: re-forward it or cancel the sale. */
export interface ShipmentCancelledEvent extends EventBase {
  kind: "shipment_cancelled";
  shipmentId: string;
  externalOrderId: string;
  supplierName: string;
  /** What the supplier wrote when cancelling. */
  reason: string;
}

/** A live or paused listing whose product the supplier no longer offers (see 08.b). */
export interface ListingUnavailableEvent extends EventBase {
  kind: "listing_unavailable";
  listingTitle: string;
  reason: UnavailableReason;
}

/** Something that happened in the tenant and deserves the reseller's attention. */
export type NotificationEvent =
  | SaleEvent
  | ListingErrorEvent
  | StoreProblemEvent
  | SupportReplyEvent
  | ReviewPendingEvent
  | StockShortageEvent
  | ShipmentCancelledEvent
  | ShipmentLateEvent
  | ListingUnavailableEvent;

export type { ShipmentLateEvent };

export type NotificationKind = NotificationEvent["kind"];

/** Read state is kept per user and organization. */
export interface NotificationReader {
  userId: string;
  tenantId: string;
}

const READER_KEY = [notificationReads.userId, notificationReads.tenantId];

function since(): Date {
  return daysBefore(WINDOW_DAYS);
}

/**
 * When a sale reached the reseller, compared with "seen" and "cleared": the marketplace's order
 * date can be minutes older than the webhook that brought it, and a sale dated before the bell
 * was opened would never count as new (nor ring). Capped at an hour after the order date, so a
 * store's first sync of past weeks does not flood the bell with old sales marked new.
 */
const saleArrivedAt =
  sql<Date>`least(${orders.createdAt}, ${orders.orderedAt} + interval '1 hour')`.mapWith(
    orders.createdAt,
  );

async function saleEvents(database: Database, tenantId: string): Promise<SaleEvent[]> {
  const rows = await database
    .select({
      entityId: orders.id,
      externalOrderId: orders.externalOrderId,
      totalCents: orders.totalCents,
      at: saleArrivedAt,
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
    .orderBy(desc(saleArrivedAt))
    .limit(SALES_SHOWN);
  const products = await saleProducts(
    database,
    tenantId,
    rows.map((row) => row.entityId),
  );
  return rows.map((row) => ({
    ...row,
    kind: "sale" as const,
    product: products.get(row.entityId) ?? null,
  }));
}

/** First item of each order, with its supplier picture and category when it still has them. */
async function saleProducts(
  database: Database,
  tenantId: string,
  orderIds: string[],
): Promise<Map<string, SaleProduct>> {
  const products = new Map<string, SaleProduct>();
  if (orderIds.length === 0) {
    return products;
  }
  const rows = await database
    .select({
      orderId: orderItems.orderId,
      title: orderItems.title,
      imageUrls: supplierProducts.imageUrls,
      categoryName: categories.name,
    })
    .from(orderItems)
    .leftJoin(supplierProducts, eq(supplierProducts.id, orderItems.supplierProductId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(and(eq(orderItems.tenantId, tenantId), inArray(orderItems.orderId, orderIds)))
    .orderBy(asc(orderItems.title));
  for (const row of rows) {
    if (products.has(row.orderId)) {
      continue;
    }
    products.set(row.orderId, {
      title: row.title,
      imageUrl: row.imageUrls?.[0] ?? null,
      categoryName: row.categoryName,
    });
  }
  return products;
}

/**
 * Parcels of paid orders a supplier cancelled and nobody re-forwarded yet, oldest first. Only
 * the supplier's own cancellation counts: the reseller already knows about theirs. Dated when
 * the supplier cancelled.
 */
async function shipmentCancelledEvents(
  database: Database,
  tenantId: string,
): Promise<ShipmentCancelledEvent[]> {
  // The latest cancellation of each parcel: a re-forwarded parcel may have been cancelled before.
  const rows = await database
    .selectDistinctOn([orderShipments.id], {
      shipmentId: orderShipments.id,
      entityId: orders.id,
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
      at: shipmentEvents.createdAt,
      actor: shipmentEvents.actor,
      reason: shipmentEvents.note,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .innerJoin(
      shipmentEvents,
      and(eq(shipmentEvents.shipmentId, orderShipments.id), eq(shipmentEvents.status, "cancelled")),
    )
    .where(
      and(
        eq(orderShipments.tenantId, tenantId),
        eq(orders.tenantId, tenantId),
        eq(orderShipments.status, "cancelled"),
        eq(orders.status, "paid"),
      ),
    )
    .orderBy(asc(orderShipments.id), desc(shipmentEvents.createdAt));
  return rows
    .filter((row) => row.actor === SHIPMENT_ACTORS.supplier)
    .toSorted((left, right) => left.at.getTime() - right.at.getTime())
    .slice(0, PER_KIND)
    .map(({ actor: _actor, ...row }) => ({ ...row, kind: "shipment_cancelled" as const }));
}

/**
 * Paid orders still short of stock, one entry per order, oldest shortage first: those have been
 * waiting longest. Dated when the shortage began, so a late one still counts as new.
 */
async function stockShortageEvents(
  database: Database,
  tenantId: string,
): Promise<StockShortageEvent[]> {
  // Items short before the date existed fall back to their order's date.
  const shortSince =
    sql<Date>`min(coalesce(${orderItems.shortSince}, ${orders.orderedAt}))`.mapWith(
      orderItems.shortSince,
    );
  const rows = await database
    .select({
      entityId: orders.id,
      externalOrderId: orders.externalOrderId,
      at: shortSince,
      productTitle: sql<string>`min(${orderItems.title})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.tenantId, tenantId),
        eq(orders.tenantId, tenantId),
        eq(orderItems.stockState, "short"),
        eq(orders.status, "paid"),
      ),
    )
    .groupBy(orders.id, orders.externalOrderId)
    .orderBy(asc(shortSince), asc(orders.id))
    .limit(PER_KIND);
  return rows.map((row) => ({ ...row, kind: "stock_shortage" as const }));
}

/**
 * Listings the supplier keeps off the marketplaces, dated by their last status change (the
 * pause, when the admin turned the product off). Gone once the product can be sold again.
 */
async function listingUnavailableEvents(
  database: Database,
  tenantId: string,
): Promise<ListingUnavailableEvent[]> {
  const lastChange = sql<Date>`(select max(${listingTargets.updatedAt}) from ${listingTargets}
    where ${listingTargets.listingId} = ${listings.id}
      and ${listingTargets.status} in ('published', 'paused'))`.mapWith(listingTargets.updatedAt);
  const rows = await database
    .select({
      entityId: listings.id,
      listingTitle: listings.title,
      at: lastChange,
      productActive: supplierProducts.active,
      supplierActive: suppliers.active,
    })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        eq(listings.tenantId, tenantId),
        sql`not ${sellableOnMarketplace()}`,
        sql`${lastChange} is not null`,
      ),
    )
    .orderBy(desc(lastChange))
    .limit(PER_KIND);
  return rows.flatMap(({ productActive, supplierActive, ...row }) => {
    const reason = unavailableReason({ productActive, supplierActive });
    return reason === null ? [] : [{ ...row, reason, kind: "listing_unavailable" as const }];
  });
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

/** Tickets with a support reply this user has not opened yet: opening the thread clears it. */
async function supportReplyEvents(
  database: Database,
  reader: NotificationReader,
): Promise<SupportReplyEvent[]> {
  const rows = await listUnreadSupportReplies(database, reader.tenantId, reader.userId, PER_KIND);
  return rows.map((row) => ({
    kind: "support_reply" as const,
    entityId: row.ticketId,
    subject: row.subject,
    at: row.repliedAt,
  }));
}

async function reviewPendingEvents(
  database: Database,
  tenantId: string,
  reviewableSince: Date,
): Promise<ReviewPendingEvent[]> {
  const pending = await countPendingReviews(database, tenantId, reviewableSince);
  if (pending.total === 0 || pending.latestDeliveredAt === null) {
    return [];
  }
  return [
    {
      kind: "review_pending",
      entityId: "reviews",
      at: pending.latestDeliveredAt,
      pending: pending.total,
    },
  ];
}

async function readState(
  database: Database,
  reader: NotificationReader,
): Promise<{ seenAt: Date | null; clearedAt: Date | null }> {
  const reads = await database
    .select({ seenAt: notificationReads.seenAt, clearedAt: notificationReads.clearedAt })
    .from(notificationReads)
    .where(
      and(
        eq(notificationReads.userId, reader.userId),
        eq(notificationReads.tenantId, reader.tenantId),
      ),
    );
  const read = reads.at(0);
  return { seenAt: read?.seenAt ?? null, clearedAt: read?.clearedAt ?? null };
}

/**
 * Recent events of the tenant (unsorted, a few per kind) and when the user last opened the
 * notifications. Events up to the user's last clear are left out. Ordering, capping and wording
 * are up to the caller.
 */
export async function listNotificationEvents(
  database: Database,
  input: { tenantId: string; userId: string; reviewableSince: Date },
): Promise<{ events: NotificationEvent[]; seenAt: Date | null }> {
  const [
    sales,
    shortages,
    cancelled,
    late,
    unavailable,
    listingErrors,
    stores,
    support,
    reviews,
    read,
  ] = await Promise.all([
    saleEvents(database, input.tenantId),
    stockShortageEvents(database, input.tenantId),
    shipmentCancelledEvents(database, input.tenantId),
    shipmentLateEvents(database, { tenantId: input.tenantId, limit: PER_KIND, now: new Date() }),
    listingUnavailableEvents(database, input.tenantId),
    listingErrorEvents(database, input.tenantId),
    storeProblemEvents(database, input.tenantId),
    supportReplyEvents(database, input),
    reviewPendingEvents(database, input.tenantId, input.reviewableSince),
    readState(database, input),
  ]);
  const events = [
    ...sales,
    ...shortages,
    ...cancelled,
    ...late,
    ...unavailable,
    ...listingErrors,
    ...stores,
    ...support,
    ...reviews,
  ];
  const { clearedAt } = read;
  if (clearedAt === null) {
    return { events, seenAt: read.seenAt };
  }
  // An open shortage or a parcel the supplier cancelled is work still waiting for the reseller:
  // clearing the list hides news, not work to do, so they stay until resolved.
  const kept = events.filter(
    (event) => STANDING_NOTIFICATION_KINDS.has(event.kind) || event.at > clearedAt,
  );
  return { events: kept, seenAt: read.seenAt };
}

export async function markNotificationsSeen(
  database: Database,
  reader: NotificationReader,
): Promise<void> {
  const seenAt = new Date();
  await database
    .insert(notificationReads)
    .values({ ...reader, seenAt })
    .onConflictDoUpdate({ target: READER_KEY, set: { seenAt } });
}

/**
 * Empties the user's notification center in one organization: everything that happened there
 * until now stops being listed.
 */
export async function clearNotifications(
  database: Database,
  reader: NotificationReader,
): Promise<void> {
  const now = new Date();
  await database
    .insert(notificationReads)
    .values({ ...reader, seenAt: now, clearedAt: now })
    .onConflictDoUpdate({ target: READER_KEY, set: { seenAt: now, clearedAt: now } });
}
