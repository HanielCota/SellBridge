import {
  closeTicketForCustomer,
  countUnreadConversations,
  findConversationForViewer,
  findConversationOrder,
  getTicketThread,
  listConversationOrders,
  listConversations,
  listConversationStores,
  listTicketOrders,
  markTicketRead,
} from "@sellbridge/database/repositories";
import { notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  conversationOrdersSchema,
  supplierConversationsSearchSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { accountMiddleware, staffMiddleware, tenantMiddleware } from "@/lib/server/middleware";
import { presentConversation } from "./conversation-thread";
import { conversationViewerOf, findConversationViewer } from "./conversation-viewer.server";

/** Orders offered at once in the new-conversation order picker. */
const CONVERSATION_ORDERS_LIMIT = 8;

const ticketIdInput = z.object({ ticketId: z.uuid() });
const readInput = z.object({ ticketId: z.uuid(), lastMessageId: z.uuid() });

/** The reseller's stores, each with its supplier: step one of a new conversation. */
export const listMyConversationStores = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => listConversationStores(database, context.tenantId));

export const listMyConversationOrders = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(conversationOrdersSchema)
  .handler(async ({ context, data }) =>
    listConversationOrders(database, {
      tenantId: context.tenantId,
      storeConnectionId: data.storeConnectionId,
      search: data.query,
      limit: CONVERSATION_ORDERS_LIMIT,
    }),
  );

/** The order an order page opened the form from, with its store; null when not the account's. */
export const getMyConversationOrder = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ orderId: z.uuid() }))
  .handler(async ({ context, data }) =>
    findConversationOrder(database, { tenantId: context.tenantId, orderId: data.orderId }),
  );

/** "Fornecedores" for a store, "Revendedores" for a supplier: the same list, per side. */
export const listMyConversations = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .validator(supplierConversationsSearchSchema)
  .handler(async ({ context, data }) => {
    const viewer = await conversationViewerOf(context);
    const page = await listConversations(
      database,
      { viewer, readerId: context.userId, status: data.status, search: data.query },
      { page: data.page, pageSize: data.pageSize },
    );
    return { ...page, side: viewer.side };
  });

/** Conversations with a message from the other side this person has not read yet. */
export const countMyUnreadConversations = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    const viewer = await findConversationViewer(context);
    if (viewer === null) {
      return 0;
    }
    return countUnreadConversations(database, { viewer, readerId: context.userId });
  });

async function requireConversation(
  context: { tenantId: string; profileKind: "seller" | "supplier" },
  ticketId: string,
) {
  const viewer = await conversationViewerOf(context);
  const access = await findConversationForViewer(database, { ticketId, viewer });
  if (access === null) {
    throw notFoundError("Conversa não encontrada");
  }
  return viewer;
}

/** The thread as this side reads it: brand and store names, never the other side's contacts. */
export const getMyConversation = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .validator(ticketIdInput)
  .handler(async ({ context, data }) => {
    const viewer = await requireConversation(context, data.ticketId);
    const [thread, orders] = await Promise.all([
      getTicketThread(database, data.ticketId, null),
      listTicketOrders(database, data.ticketId),
    ]);
    return {
      ...presentConversation(thread, orders, viewer.side),
      side: viewer.side,
      viewerId: context.userId,
    };
  });

export const markMyConversationRead = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(readInput)
  .handler(async ({ context, data }) => {
    await requireConversation(context, data.ticketId);
    if (context.impersonatedBy !== null) {
      return { ok: true };
    }
    await markTicketRead(database, {
      ticketId: data.ticketId,
      userId: context.userId,
      tenantId: null,
      lastMessageId: data.lastMessageId,
    });
    return { ok: true };
  });

/** "Resolvido": the store closes it; a new message from the store opens it again. */
export const closeMyConversation = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(ticketIdInput)
  .handler(async ({ context, data }) => {
    await requireConversation(context, data.ticketId);
    await closeTicketForCustomer(database, {
      ticketId: data.ticketId,
      tenantId: context.tenantId,
      userId: context.userId,
    });
    logger.info("supplier_support.closed", { ticketId: data.ticketId });
    return { ok: true };
  });

/** The team reads a conversation from its inbox, with both sides named, to spot deals outside. */
export const staffGetConversation = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("support.answer")])
  .validator(ticketIdInput)
  .handler(async ({ data }) => {
    const [thread, orders] = await Promise.all([
      getTicketThread(database, data.ticketId, null),
      listTicketOrders(database, data.ticketId),
    ]);
    if (thread.ticket.audience !== "supplier") {
      throw notFoundError("Conversa não encontrada");
    }
    return presentConversation(thread, orders, "team");
  });
