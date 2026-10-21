import { notFoundError } from "@sellbridge/shared/errors";
import { and, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listings, orders, storeConnections, tickets } from "../schema/index.ts";
import { linkTicketOrder } from "./ticket-links.ts";

/** What a ticket opened from another screen is about (item 27.a); every part is optional. */
export interface TicketAbout {
  orderId?: string | undefined;
  storeConnectionId?: string | undefined;
  listingId?: string | undefined;
}

export interface TicketAboutLabels {
  order: { id: string; externalOrderId: string } | null;
  store: { id: string; name: string } | null;
  listing: { id: string; title: string } | null;
}

async function tenantOrder(database: Database, tenantId: string, orderId: string | undefined) {
  if (orderId === undefined) {
    return null;
  }
  const [row] = await database
    .select({ id: orders.id, externalOrderId: orders.externalOrderId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
  return row ?? null;
}

async function tenantStore(database: Database, tenantId: string, storeId: string | undefined) {
  if (storeId === undefined) {
    return null;
  }
  const [row] = await database
    .select({ id: storeConnections.id, name: storeConnections.shopName })
    .from(storeConnections)
    .where(and(eq(storeConnections.id, storeId), eq(storeConnections.tenantId, tenantId)));
  return row ?? null;
}

async function tenantListing(database: Database, tenantId: string, listingId: string | undefined) {
  if (listingId === undefined) {
    return null;
  }
  const [row] = await database
    .select({ id: listings.id, title: listings.title })
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.tenantId, tenantId)));
  return row ?? null;
}

/** Names of the workspace's own records only; another workspace's ids come back as null. */
export async function describeTicketAbout(
  database: Database,
  tenantId: string,
  about: TicketAbout,
): Promise<TicketAboutLabels> {
  const [order, store, listing] = await Promise.all([
    tenantOrder(database, tenantId, about.orderId),
    tenantStore(database, tenantId, about.storeConnectionId),
    tenantListing(database, tenantId, about.listingId),
  ]);
  return { order, store, listing };
}

function assertFound(
  requested: string | undefined,
  found: { id: string } | null,
  label: string,
): void {
  if (requested !== undefined && found === null) {
    throw notFoundError(`${label} não encontrada nesta conta`);
  }
}

/** The labels of what the ticket is about, refusing any id outside the workspace. */
export async function requireTicketAbout(
  database: Database,
  tenantId: string,
  about: TicketAbout,
): Promise<TicketAboutLabels> {
  const labels = await describeTicketAbout(database, tenantId, about);
  assertFound(about.orderId, labels.order, "Venda");
  assertFound(about.storeConnectionId, labels.store, "Loja");
  assertFound(about.listingId, labels.listing, "Publicação");
  return labels;
}

/**
 * Ties a just-opened ticket to the order, store and listing it came from. Each id must belong
 * to the ticket's workspace; the order goes through the usual order link (with its history).
 */
export async function linkTicketAbout(
  database: Database,
  input: { ticketId: string; tenantId: string; actorId: string; about: TicketAbout },
): Promise<void> {
  const labels = await requireTicketAbout(database, input.tenantId, input.about);
  if (labels.store !== null || labels.listing !== null) {
    await database
      .update(tickets)
      .set({ storeConnectionId: labels.store?.id ?? null, listingId: labels.listing?.id ?? null })
      .where(and(eq(tickets.id, input.ticketId), eq(tickets.tenantId, input.tenantId)));
  }
  if (labels.order !== null) {
    await linkTicketOrder(database, {
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      orderId: labels.order.id,
      actorId: input.actorId,
    });
  }
}

/** The store and listing a ticket is about, for its side panel (the orders have their own list). */
export async function getTicketSubject(
  database: Database,
  ticketId: string,
): Promise<Pick<TicketAboutLabels, "store" | "listing">> {
  const [row] = await database
    .select({
      tenantId: tickets.tenantId,
      storeConnectionId: tickets.storeConnectionId,
      listingId: tickets.listingId,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId));
  if (row === undefined) {
    return { store: null, listing: null };
  }
  const labels = await describeTicketAbout(database, row.tenantId, {
    storeConnectionId: row.storeConnectionId ?? undefined,
    listingId: row.listingId ?? undefined,
  });
  return { store: labels.store, listing: labels.listing };
}
