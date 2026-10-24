import { notFoundError, validationError } from "@sellbridge/shared/errors";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import type { SupplierConversationTopicId } from "@sellbridge/shared/supplier-conversation-topics";
import { and, count, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  organization,
  orders,
  storeConnections,
  suppliers,
  ticketAttachments,
  ticketMessages,
  tickets,
} from "../schema/index.ts";
import { supplierConversationSql } from "./support-audience.ts";
import { hasUnreadSql } from "./support-unread.ts";
import { containsPattern } from "./sql/search-pattern.ts";

/*
 * The support conversations between a reseller and the supplier of one of their stores. They
 * are tickets with the `supplier` audience: the same thread, attachments, states and auto-close
 * as the website support, scoped here to the two sides that may read them.
 */

/** Who reads: the reseller's organization, or the supplier the conversation was sent to. */
export type ConversationViewer =
  | { readonly side: "reseller"; readonly tenantId: string }
  | { readonly side: "supplier"; readonly supplierId: string };

type TicketStatus = (typeof tickets.$inferSelect)["status"];

function viewerCondition(viewer: ConversationViewer): SQL | undefined {
  if (viewer.side === "reseller") {
    return and(supplierConversationSql, eq(tickets.tenantId, viewer.tenantId));
  }
  return and(supplierConversationSql, eq(tickets.supplierId, viewer.supplierId));
}

/** A reseller reads the supplier's messages as "unread"; a supplier, the reseller's. */
function readerOf(viewer: ConversationViewer, userId: string) {
  return { userId, side: viewer.side === "reseller" ? ("customer" as const) : ("staff" as const) };
}

export interface ConversationStore {
  storeConnectionId: string;
  storeName: string;
  supplierId: string | null;
  supplierName: string | null;
  /** A supplier the team still runs for them has no panel: nobody there would read it. */
  supplierAnswers: boolean;
}

/** The reseller's live stores, each with the one supplier it sells. */
export async function listConversationStores(
  database: Database,
  tenantId: string,
): Promise<ConversationStore[]> {
  const rows = await database
    .select({
      storeConnectionId: storeConnections.id,
      storeName: storeConnections.shopName,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      supplierOrganizationId: suppliers.organizationId,
      supplierActive: suppliers.active,
    })
    .from(storeConnections)
    .leftJoin(suppliers, eq(suppliers.id, storeConnections.supplierId))
    .where(
      and(eq(storeConnections.tenantId, tenantId), ne(storeConnections.status, "disconnected")),
    )
    .orderBy(storeConnections.shopName);
  return rows.map(({ supplierOrganizationId, supplierActive, ...store }) => ({
    ...store,
    supplierAnswers: supplierOrganizationId !== null && supplierActive === true,
  }));
}

/** The store a new conversation is about, refused when its supplier cannot answer. */
export async function requireConversationStore(
  database: Database,
  input: { tenantId: string; storeConnectionId: string },
): Promise<{ supplierId: string; storeName: string }> {
  const stores = await listConversationStores(database, input.tenantId);
  const store = stores.find((item) => item.storeConnectionId === input.storeConnectionId);
  if (store === undefined) {
    throw notFoundError("Loja não encontrada");
  }
  if (store.supplierId === null || !store.supplierAnswers) {
    throw validationError(
      `A loja ${store.storeName} ainda não tem um fornecedor que atende pelo SellBridge`,
    );
  }
  return { supplierId: store.supplierId, storeName: store.storeName };
}

export interface ConversationOrder {
  orderId: string;
  externalOrderId: string;
  orderedAt: Date;
  totalCents: number;
}

const orderColumns = {
  orderId: orders.id,
  externalOrderId: orders.externalOrderId,
  orderedAt: orders.orderedAt,
  totalCents: orders.totalCents,
};

/** Recent orders of one store of the reseller, searched by order number. */
export async function listConversationOrders(
  database: Database,
  input: {
    tenantId: string;
    storeConnectionId: string;
    search?: string | undefined;
    limit: number;
  },
): Promise<ConversationOrder[]> {
  const term = input.search === undefined || input.search === "" ? undefined : input.search;
  return database
    .select(orderColumns)
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, input.tenantId),
        eq(orders.storeConnectionId, input.storeConnectionId),
        term === undefined ? undefined : ilike(orders.externalOrderId, containsPattern(term)),
      ),
    )
    .orderBy(desc(orders.orderedAt))
    .limit(input.limit);
}

/** An order the form linked: it must be of the reseller and of the store picked. */
export async function requireConversationOrder(
  database: Database,
  input: { tenantId: string; storeConnectionId: string; orderId: string },
): Promise<ConversationOrder> {
  const [order] = await database
    .select(orderColumns)
    .from(orders)
    .where(
      and(
        eq(orders.id, input.orderId),
        eq(orders.tenantId, input.tenantId),
        eq(orders.storeConnectionId, input.storeConnectionId),
      ),
    )
    .limit(1);
  if (order === undefined) {
    throw validationError("Este pedido não é da loja escolhida; escolha um pedido da lista");
  }
  return order;
}

/** An order of the reseller with its store: an order page prefills both in the form. */
export async function findConversationOrder(
  database: Database,
  input: { tenantId: string; orderId: string },
): Promise<(ConversationOrder & { storeConnectionId: string }) | null> {
  const [order] = await database
    .select({ ...orderColumns, storeConnectionId: orders.storeConnectionId })
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.tenantId, input.tenantId)))
    .limit(1);
  return order ?? null;
}

export interface ConversationSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  topic: SupplierConversationTopicId | null;
  storeName: string | null;
  /** The reseller's account name: what the supplier reads, never their phone or e-mail. */
  resellerName: string;
  supplierName: string | null;
  /** The other side wrote after the reader last opened the conversation. */
  hasUnread: boolean;
  updatedAt: Date;
}

/** The viewer's conversations, newest activity first, with an unread dot for the reader. */
export async function listConversations(
  database: Database,
  input: {
    viewer: ConversationViewer;
    readerId: string;
    status?: TicketStatus | undefined;
    search?: string | undefined;
  },
  pagination: Pagination,
): Promise<Paginated<ConversationSummary>> {
  const term = input.search === undefined ? undefined : containsPattern(input.search);
  const where = and(
    viewerCondition(input.viewer),
    input.status === undefined ? undefined : eq(tickets.status, input.status),
    term === undefined
      ? undefined
      : or(ilike(tickets.subject, term), ilike(storeConnections.shopName, term)),
  );
  const [rows, totals] = await Promise.all([
    database
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        topic: tickets.supplierTopic,
        storeName: storeConnections.shopName,
        resellerName: organization.name,
        supplierName: suppliers.name,
        hasUnread: hasUnreadSql(readerOf(input.viewer, input.readerId)),
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .innerJoin(organization, eq(organization.id, tickets.tenantId))
      .leftJoin(storeConnections, eq(storeConnections.id, tickets.storeConnectionId))
      .leftJoin(suppliers, eq(suppliers.id, tickets.supplierId))
      .where(where)
      .orderBy(desc(tickets.updatedAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    database
      .select({ total: count() })
      .from(tickets)
      .leftJoin(storeConnections, eq(storeConnections.id, tickets.storeConnectionId))
      .where(where),
  ]);
  return toPaginated(rows, totals.at(0)?.total ?? 0, pagination);
}

/** Conversations with a message from the other side the reader has not opened yet. */
export async function countUnreadConversations(
  database: Database,
  input: { viewer: ConversationViewer; readerId: string },
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(tickets)
    .where(
      and(viewerCondition(input.viewer), hasUnreadSql(readerOf(input.viewer, input.readerId))),
    );
  return row?.total ?? 0;
}

export interface ConversationAccess {
  id: string;
  status: TicketStatus;
  tenantId: string;
}

/**
 * The conversation as the viewer may reach it, or null: another reseller's, another supplier's,
 * a website ticket and an unknown id all look the same. Checked before any file is written.
 */
export async function findConversationForViewer(
  database: Database,
  input: { ticketId: string; viewer: ConversationViewer },
): Promise<ConversationAccess | null> {
  const [row] = await database
    .select({ id: tickets.id, status: tickets.status, tenantId: tickets.tenantId })
    .from(tickets)
    .where(and(eq(tickets.id, input.ticketId), viewerCondition(input.viewer)))
    .limit(1);
  return row ?? null;
}

/** A file of a conversation sent to this supplier; internal notes never reach a supplier. */
export async function getConversationAttachment(
  database: Database,
  input: { attachmentId: string; supplierId: string },
) {
  const [row] = await database
    .select({
      id: ticketAttachments.id,
      storageKey: ticketAttachments.storageKey,
      fileName: ticketAttachments.fileName,
      mimeType: ticketAttachments.mimeType,
    })
    .from(ticketAttachments)
    .innerJoin(tickets, eq(tickets.id, ticketAttachments.ticketId))
    .innerJoin(ticketMessages, eq(ticketMessages.id, ticketAttachments.messageId))
    .where(
      and(
        eq(ticketAttachments.id, input.attachmentId),
        viewerCondition({ side: "supplier", supplierId: input.supplierId }),
        eq(ticketMessages.isInternal, false),
      ),
    )
    .limit(1);
  if (row === undefined) {
    throw notFoundError("Anexo não encontrado");
  }
  return row;
}
