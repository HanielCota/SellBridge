import {
  getTicketThread,
  listTenantTickets,
  type TicketSummary,
  type TicketThread,
} from "@sellbridge/database/repositories";
import { z } from "zod";
import {
  dataEnvelope,
  noInput,
  pageEnvelope,
  pageQuerySchema,
  toPaginationMeta,
} from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { organizationParamsSchema, requireOrganization } from "../organization-endpoint.server";

const ticketShape = {
  id: z.uuid(),
  subject: z.string(),
  status: z.string().describe("`open`, `answered` ou `closed`."),
  category: z.string(),
  priority: z.string().describe("`low`, `normal`, `high` ou `urgent`."),
  awaitingSince: z.iso
    .datetime()
    .nullable()
    .describe("Desde quando o revendedor espera resposta do suporte; nulo quando nada falta."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

const ticketSummarySchema = z.object(ticketShape);

const ticketThreadSchema = z.object({
  ...ticketShape,
  storeName: z.string().nullable(),
  createdByName: z.string(),
  assigneeName: z.string().nullable(),
  firstResponseAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  rating: z.number().int().nullable(),
  ratingComment: z.string().nullable(),
  messages: z.array(
    z.object({
      id: z.uuid(),
      body: z.string(),
      fromSupport: z.boolean().describe("`true` quando a mensagem é da equipe do SellBridge."),
      authorName: z.string(),
      createdAt: z.iso.datetime(),
      attachments: z.array(
        z.object({ fileName: z.string(), mimeType: z.string(), sizeBytes: z.number().int() }),
      ),
    }),
  ),
});

function presentTicketSummary(
  ticket: Omit<TicketSummary, "hasUnread">,
): z.input<typeof ticketSummarySchema> {
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
function presentTicketThread(thread: TicketThread): z.input<typeof ticketThreadSchema> {
  const { ticket } = thread;
  return {
    ...presentTicketSummary(ticket),
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
  path: "/organizations/{organizationId}/tickets",
  operationId: "listTickets",
  tag: "Suporte",
  summary: "Listar chamados de suporte",
  description:
    "Os chamados que a organização abriu com o suporte, dos mais recentes aos mais antigos.",
  scope: "support:read",
  params: organizationParamsSchema,
  query: pageQuerySchema,
  response: pageEnvelope(ticketSummarySchema),
  handle: async ({ params, query }) => {
    const organizationId = await requireOrganization(params.organizationId);
    const page = await listTenantTickets(database, organizationId, {}, query);
    return { data: page.items.map(presentTicketSummary), pagination: toPaginationMeta(page) };
  },
});

export const getDeveloperTicket = defineDeveloperEndpoint({
  path: "/organizations/{organizationId}/tickets/{ticketId}",
  operationId: "getTicket",
  tag: "Suporte",
  summary: "Ver um chamado com as mensagens",
  description:
    "O chamado como a organização o vê: as notas internas da equipe não vêm, e os autores vêm só com o nome.",
  scope: "support:read",
  params: organizationParamsSchema.extend({ ticketId: z.uuid().describe("Id do chamado.") }),
  query: noInput,
  response: dataEnvelope(ticketThreadSchema),
  handle: async ({ params }) => {
    const organizationId = await requireOrganization(params.organizationId);
    const thread = await getTicketThread(database, params.ticketId, organizationId);
    return { data: presentTicketThread(thread) };
  },
});
