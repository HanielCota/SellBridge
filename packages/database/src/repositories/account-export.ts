import { and, asc, eq, inArray } from "drizzle-orm";
import { findBillingHolder } from "./region.ts";
import type { Database } from "../client.ts";
import {
  account,
  apiKeys,
  billingAccounts,
  listings,
  notificationPreferences,
  orderItems,
  orders,
  session,
  storeConnections,
  supplierReviews,
  suppliers,
  ticketMessages,
  tickets,
  user,
  webhookEndpoints,
} from "../schema/index.ts";

export const ACCOUNT_EXPORT_FORMAT = "sellbridge-account-export/1";

interface Account {
  userId: string;
  /** The profile's organization; null for a team member with no profile of their own. */
  tenantId: string | null;
}

/** Rows by key in one pass, so pairing children with their parents stays linear. */
function groupBy<Row>(rows: readonly Row[], keyOf: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [row]);
      continue;
    }
    // The arrays are this function's own, built here: pushing keeps the pass linear.
    group.push(row);
  }
  return groups;
}

async function exportUser(database: Database, userId: string) {
  const [row] = await database
    .select({
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId));
  return row ?? null;
}

/** The holder with phone and company (item 26.a): every personal field the account keeps. */
async function exportHolder(database: Database, tenantId: string) {
  return findBillingHolder(database, tenantId);
}

/** Stores without their tokens: those are keys to the marketplace, not the seller's data. */
async function exportStores(database: Database, tenantId: string) {
  return database
    .select({
      shopName: storeConnections.shopName,
      marketplace: storeConnections.marketplace,
      status: storeConnections.status,
      connectedAt: storeConnections.connectedAt,
    })
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenantId))
    .orderBy(asc(storeConnections.connectedAt));
}

async function exportListings(database: Database, tenantId: string) {
  return database
    .select({
      title: listings.title,
      priceCents: listings.priceCents,
      createdAt: listings.createdAt,
    })
    .from(listings)
    .where(eq(listings.tenantId, tenantId))
    .orderBy(asc(listings.createdAt));
}

/** Sales with their items. The buyer's name is left out: it is the buyer's data, not ours. */
async function exportOrders(database: Database, tenantId: string) {
  const rows = await database
    .select({
      id: orders.id,
      externalOrderId: orders.externalOrderId,
      status: orders.status,
      totalCents: orders.totalCents,
      marketplaceFeeCents: orders.marketplaceFeeCents,
      orderedAt: orders.orderedAt,
      deliveredAt: orders.deliveredAt,
    })
    .from(orders)
    .where(eq(orders.tenantId, tenantId))
    .orderBy(asc(orders.orderedAt));
  const items = await database
    .select({
      orderId: orderItems.orderId,
      title: orderItems.title,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      unitCostCents: orderItems.unitCostCents,
    })
    .from(orderItems)
    .where(eq(orderItems.tenantId, tenantId));
  const itemsByOrder = groupBy(items, (item) => item.orderId);
  return rows.map(({ id, ...order }) => ({
    ...order,
    items: (itemsByOrder.get(id) ?? []).map(({ orderId: _orderId, ...item }) => item),
  }));
}

/** Support conversations, without the team's internal notes. */
async function exportTickets(database: Database, tenantId: string) {
  const rows = await database
    .select({
      id: tickets.id,
      subject: tickets.subject,
      status: tickets.status,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(eq(tickets.tenantId, tenantId))
    .orderBy(asc(tickets.createdAt));
  if (rows.length === 0) {
    return [];
  }
  const messages = await database
    .select({
      ticketId: ticketMessages.ticketId,
      isAdmin: ticketMessages.isAdmin,
      body: ticketMessages.body,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .where(
      and(
        inArray(
          ticketMessages.ticketId,
          rows.map((row) => row.id),
        ),
        eq(ticketMessages.isInternal, false),
      ),
    )
    .orderBy(asc(ticketMessages.createdAt));
  const messagesByTicket = groupBy(messages, (message) => message.ticketId);
  return rows.map(({ id, ...ticket }) => ({
    ...ticket,
    messages: (messagesByTicket.get(id) ?? []).map((message) => ({
      from: message.isAdmin ? "Equipe SellBridge" : "Você",
      body: message.body,
      createdAt: message.createdAt,
    })),
  }));
}

/**
 * The account's own supplier reviews, comment included: only moderation reads comments in the
 * app, so this download is the one place the author gets them back.
 */
async function exportSupplierReviews(database: Database, tenantId: string) {
  return database
    .select({
      externalOrderId: orders.externalOrderId,
      supplierName: suppliers.name,
      rating: supplierReviews.rating,
      tags: supplierReviews.tags,
      comment: supplierReviews.comment,
      createdAt: supplierReviews.createdAt,
      updatedAt: supplierReviews.updatedAt,
    })
    .from(supplierReviews)
    .innerJoin(orders, eq(orders.id, supplierReviews.orderId))
    .innerJoin(suppliers, eq(suppliers.id, supplierReviews.supplierId))
    .where(eq(supplierReviews.tenantId, tenantId))
    .orderBy(asc(supplierReviews.createdAt));
}

/** API keys by name and prefix only: the secret hash stays behind. */
async function exportApiKeys(database: Database, tenantId: string) {
  return database
    .select({
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId));
}

/** The plan, without Stripe's ids. */
async function exportBilling(database: Database, tenantId: string) {
  const [row] = await database
    .select({
      plan: billingAccounts.plan,
      status: billingAccounts.status,
      periodEnd: billingAccounts.periodEnd,
    })
    .from(billingAccounts)
    .where(eq(billingAccounts.tenantId, tenantId));
  return row ?? null;
}

/** How the account signs in (e-mail and password, Google), without tokens or the hash. */
async function exportLogins(database: Database, userId: string) {
  return database
    .select({ provider: account.providerId, createdAt: account.createdAt })
    .from(account)
    .where(eq(account.userId, userId));
}

/** Webhook endpoints by address and events, without the signing secret. */
async function exportWebhookEndpoints(database: Database, tenantId: string) {
  return database
    .select({
      url: webhookEndpoints.url,
      description: webhookEndpoints.description,
      eventTypes: webhookEndpoints.eventTypes,
      disabledAt: webhookEndpoints.disabledAt,
      createdAt: webhookEndpoints.createdAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.tenantId, tenantId));
}

/** Where the account is signed in, without the session tokens. */
async function exportSessions(database: Database, userId: string) {
  return database
    .select({
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(eq(session.userId, userId));
}

async function exportNotificationPreferences(database: Database, userId: string) {
  return database
    .select({
      event: notificationPreferences.event,
      channel: notificationPreferences.channel,
      enabled: notificationPreferences.enabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
}

/** What the profile holds: the registration, the stores and everything sold through them. */
async function exportProfileData(database: Database, tenantId: string) {
  const [holder, stores, listingRows, orderRows, ticketRows, reviews] = await Promise.all([
    exportHolder(database, tenantId),
    exportStores(database, tenantId),
    exportListings(database, tenantId),
    exportOrders(database, tenantId),
    exportTickets(database, tenantId),
    exportSupplierReviews(database, tenantId),
  ]);
  const [keys, billing, webhooks] = await Promise.all([
    exportApiKeys(database, tenantId),
    exportBilling(database, tenantId),
    exportWebhookEndpoints(database, tenantId),
  ]);
  return {
    holder,
    stores,
    listings: listingRows,
    orders: orderRows,
    tickets: ticketRows,
    supplierReviews: reviews,
    apiKeys: keys,
    billing,
    webhookEndpoints: webhooks,
  };
}

type ProfileData = Awaited<ReturnType<typeof exportProfileData>>;

/** A team member with no profile keeps only personal data: the profile parts come back empty. */
const NO_PROFILE_DATA: ProfileData = {
  holder: null,
  stores: [],
  listings: [],
  orders: [],
  tickets: [],
  supplierReviews: [],
  apiKeys: [],
  billing: null,
  webhookEndpoints: [],
};

/** Everything the account holds about itself, for the "Baixar meus dados" download (LGPD). */
export async function collectAccountExport(database: Database, owner: Account) {
  const [userRow, sessions, preferences, logins] = await Promise.all([
    exportUser(database, owner.userId),
    exportSessions(database, owner.userId),
    exportNotificationPreferences(database, owner.userId),
    exportLogins(database, owner.userId),
  ]);
  const profile =
    owner.tenantId === null ? NO_PROFILE_DATA : await exportProfileData(database, owner.tenantId);
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    user: userRow,
    holder: profile.holder,
    stores: profile.stores,
    listings: profile.listings,
    orders: profile.orders,
    tickets: profile.tickets,
    supplierReviews: profile.supplierReviews,
    apiKeys: profile.apiKeys,
    sessions,
    notificationPreferences: preferences,
    billing: profile.billing,
    logins,
    webhookEndpoints: profile.webhookEndpoints,
  };
}

export type AccountExport = Awaited<ReturnType<typeof collectAccountExport>>;
