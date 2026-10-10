import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  listings,
  listingTargets,
  notificationReads,
  orders,
  storeConnections,
  tickets,
} from "../schema/index.ts";
import { daysBefore } from "./time-window.ts";

const WINDOW_DAYS = 14;
const PER_KIND = 10;
/** Sales are frequent; a handful is enough to show activity without burying problems. */
const SALES_SHOWN = 5;
const SIMULATED_SUFFIX = /\s*\(loja simulada\)\s*$/i;
const MAX_NOTIFICATIONS = 20;

export type NotificationKind = "sale" | "listing_error" | "store_problem" | "support_reply";

export interface AppNotification {
  /** Stable per event, so the list keys do not shuffle between polls. */
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  at: Date;
  /** Where the notification leads. */
  href: string;
}

function since(): Date {
  return daysBefore(WINDOW_DAYS);
}

async function saleNotifications(database: Database, tenantId: string): Promise<AppNotification[]> {
  const rows = await database
    .select({
      id: orders.id,
      externalOrderId: orders.externalOrderId,
      totalCents: orders.totalCents,
      orderedAt: orders.orderedAt,
      storeName: storeConnections.shopName,
    })
    .from(orders)
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.orderedAt, since()),
        sql`${orders.status} not in ('cancelled', 'returned')`,
      ),
    )
    .orderBy(desc(orders.orderedAt))
    .limit(SALES_SHOWN);
  return rows.map((row) => ({
    id: `sale:${row.id}`,
    kind: "sale",
    title: `Nova venda de ${(row.totalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    detail: `${row.externalOrderId} · ${row.storeName.replace(SIMULATED_SUFFIX, "")}`,
    at: row.orderedAt,
    href: `/financeiro?query=${encodeURIComponent(row.externalOrderId)}`,
  }));
}

async function listingErrorNotifications(
  database: Database,
  tenantId: string,
): Promise<AppNotification[]> {
  const rows = await database
    .select({
      id: listingTargets.id,
      updatedAt: listingTargets.updatedAt,
      errorReason: listingTargets.errorReason,
      title: listings.title,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(and(eq(listingTargets.tenantId, tenantId), eq(listingTargets.status, "error")))
    .orderBy(desc(listingTargets.updatedAt))
    .limit(PER_KIND);
  return rows.map((row) => ({
    id: `listing:${row.id}:${row.updatedAt.getTime()}`,
    kind: "listing_error",
    title: `Publicação recusada: ${row.title}`,
    detail: row.errorReason ?? "Erro ao publicar",
    at: row.updatedAt,
    href: "/publicacoes?status=error",
  }));
}

async function storeNotifications(
  database: Database,
  tenantId: string,
): Promise<AppNotification[]> {
  const rows = await database
    .select({
      id: storeConnections.id,
      shopName: storeConnections.shopName,
      status: storeConnections.status,
      updatedAt: storeConnections.updatedAt,
    })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.status, ["expired", "error"]),
      ),
    )
    .limit(PER_KIND);
  return rows.map((row) => ({
    id: `store:${row.id}:${row.updatedAt.getTime()}`,
    kind: "store_problem",
    title: `${row.shopName.replace(SIMULATED_SUFFIX, "")} precisa ser reconectada`,
    detail: "Pedidos e estoque estão parados nesta loja.",
    at: row.updatedAt,
    href: "/lojas",
  }));
}

async function supportNotifications(
  database: Database,
  tenantId: string,
): Promise<AppNotification[]> {
  const rows = await database
    .select({ id: tickets.id, subject: tickets.subject, updatedAt: tickets.updatedAt })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.status, "answered")))
    .orderBy(desc(tickets.updatedAt))
    .limit(PER_KIND);
  return rows.map((row) => ({
    id: `ticket:${row.id}:${row.updatedAt.getTime()}`,
    kind: "support_reply",
    title: "O suporte respondeu",
    detail: row.subject,
    at: row.updatedAt,
    href: `/suporte/${row.id}`,
  }));
}

/** Recent events that deserve the reseller's attention, newest first, plus what is unread. */
export async function listNotifications(
  database: Database,
  input: { tenantId: string; userId: string },
): Promise<{ items: AppNotification[]; unread: number; seenAt: Date | null }> {
  const [sales, listingErrors, stores, support, reads] = await Promise.all([
    saleNotifications(database, input.tenantId),
    listingErrorNotifications(database, input.tenantId),
    storeNotifications(database, input.tenantId),
    supportNotifications(database, input.tenantId),
    database
      .select({ seenAt: notificationReads.seenAt })
      .from(notificationReads)
      .where(eq(notificationReads.userId, input.userId)),
  ]);
  const seenAt = reads.at(0)?.seenAt ?? null;
  const items = [...sales, ...listingErrors, ...stores, ...support]
    .toSorted((first, second) => second.at.getTime() - first.at.getTime())
    .slice(0, MAX_NOTIFICATIONS);
  const unread = items.filter((item) => seenAt === null || item.at > seenAt).length;
  return { items, unread, seenAt };
}

export async function markNotificationsSeen(database: Database, userId: string): Promise<void> {
  const seenAt = new Date();
  await database
    .insert(notificationReads)
    .values({ userId, seenAt })
    .onConflictDoUpdate({ target: notificationReads.userId, set: { seenAt } });
}
