import {
  getTicketThread,
  listTenantTickets,
  type TicketSummary,
  type TicketThread,
} from "@sellbridge/database/repositories";
import { z } from "zod";
import { noInput, pageQuerySchema, toPaginationMeta } from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { organizationParamsSchema, requireOrganization } from "../organization-endpoint.server";

function presentTicketSummary(ticket: TicketSummary) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    category: ticket.category,
    priority: ticket.priority,
    awaitingSince: ticket.awaitingSince?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/**
 * The thread as the organization sees it: the team's internal notes never come, and authors
 * are named but their e-mails and photos stay out.
 */
function presentTicketThread(thread: TicketThread) {
  const { ticket } = thread;
  return {
    ...presentTicketSummary({ ...ticket, hasUnread: false }),
    storeName: ticket.storeName,
    createdByName: ticket.createdByName,
    assigneeName: ticket.assigneeName,
    firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    rating: ticket.rating,
    ratingComment: ticket.ratingComment,
    messages: thread.messages.map((message) => ({
      id: message.id,
      body: message.body,
      fromSupport: message.isAdmin,
      authorName: message.authorName,
      createdAt: message.createdAt.toISOString(),
      attachments: message.attachments.map((attachment) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
    })),
  };
}

export const listDeveloperTickets = defineDeveloperEndpoint({
  operationId: "listTickets",
  scope: "support:read",
  params: organizationParamsSchema,
  query: pageQuerySchema,
  handle: async ({ params, query }) => {
    const organizationId = await requireOrganization(params.organizationId);
    const page = await listTenantTickets(database, organizationId, {}, query);
    return { data: page.items.map(presentTicketSummary), pagination: toPaginationMeta(page) };
  },
});

export const getDeveloperTicket = defineDeveloperEndpoint({
  operationId: "getTicket",
  scope: "support:read",
  params: organizationParamsSchema.extend({ ticketId: z.uuid() }),
  query: noInput,
  handle: async ({ params }) => {
    const organizationId = await requireOrganization(params.organizationId);
    const thread = await getTicketThread(database, params.ticketId, organizationId);
    return { data: presentTicketThread(thread) };
  },
});
