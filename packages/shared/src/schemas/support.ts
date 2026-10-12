import { z } from "zod";
import {
  MAX_RATING,
  MIN_RATING,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from "../domain/ticket-rules.ts";
import { withFallback, optionalParameter } from "./fallback.ts";

export { TICKET_CATEGORIES, TICKET_PRIORITIES, type TicketCategory, type TicketPriority };

export const TICKET_STATUSES = ["open", "answered", "closed"] as const;
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Aguardando suporte",
  answered: "Respondido",
  closed: "Encerrado",
};

export const ticketCategorySchema = z.enum(TICKET_CATEGORIES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  order: "Pedido ou entrega",
  payment: "Pagamento ou repasse",
  store: "Conexão de loja",
  listing: "Publicação ou anúncio",
  account: "Minha conta",
  other: "Outro tema",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;
export type AttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

export const ticketSubjectSchema = z
  .string()
  .trim()
  .min(5, "O assunto deve ter ao menos 5 caracteres")
  .max(120, "O assunto deve ter no máximo 120 caracteres");

export const ticketBodySchema = z
  .string()
  .trim()
  .min(10, "Descreva com ao menos 10 caracteres")
  .max(5000, "A mensagem deve ter no máximo 5.000 caracteres");

export const createTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES, { error: "Escolha sobre o que é o chamado" }),
  subject: ticketSubjectSchema,
  body: ticketBodySchema,
});

/** Prefills the new-ticket form from a page that links to it (an error card, a listing). */
export const newTicketSearchSchema = z.object({
  categoria: optionalParameter(ticketCategorySchema),
  assunto: optionalParameter(z.string().trim().max(120)),
});
export type NewTicketSearch = z.infer<typeof newTicketSearchSchema>;

export const replyTicketSchema = z.object({ body: ticketBodySchema });

/** Internal notes are quick jottings for the team, so they only need to be non-empty. */
export const internalNoteBodySchema = z
  .string()
  .trim()
  .min(2, "Escreva a nota")
  .max(5000, "A nota deve ter no máximo 5.000 caracteres");

/** Admin message: either a reply sent with a chosen status, or a note hidden from the reseller. */
export const adminTicketMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reply"),
    body: ticketBodySchema,
    statusAfter: ticketStatusSchema.default("answered"),
  }),
  z.object({ kind: z.literal("note"), body: internalNoteBodySchema }),
]);
export type AdminTicketMessage = z.infer<typeof adminTicketMessageSchema>;

export const ticketsSearchSchema = z.object({
  status: optionalParameter(ticketStatusSchema),
  query: optionalParameter(z.string().trim().max(100)),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(5).max(50).default(10), 10),
});
export type TicketsSearch = z.infer<typeof ticketsSearchSchema>;

/** Slices of the support inbox, from what nobody took yet to what is past its deadline. */
export const TICKET_QUEUES = ["unassigned", "mine", "overdue", "all"] as const;
export const ticketQueueSchema = z.enum(TICKET_QUEUES);
export type TicketQueue = z.infer<typeof ticketQueueSchema>;

export const TICKET_QUEUE_LABELS: Record<TicketQueue, string> = {
  unassigned: "Sem responsável",
  mine: "Minha caixa",
  overdue: "Atrasados",
  all: "Todos",
};

export const staffTicketsSearchSchema = ticketsSearchSchema.extend({
  queue: withFallback(ticketQueueSchema.default("all"), "all"),
  priority: optionalParameter(ticketPrioritySchema),
  category: optionalParameter(ticketCategorySchema),
});
export type StaffTicketsSearch = z.infer<typeof staffTicketsSearchSchema>;

const ticketIdSchema = z.uuid();

/** `assigneeId: null` leaves the ticket without anyone responsible. */
export const assignTicketSchema = z.object({
  ticketId: ticketIdSchema,
  assigneeId: z.string().min(1).nullable(),
});

export const setTicketPrioritySchema = z.object({
  ticketId: ticketIdSchema,
  priority: ticketPrioritySchema,
});

export const setTicketCategorySchema = z.object({
  ticketId: ticketIdSchema,
  category: ticketCategorySchema,
});

export const rateTicketSchema = z.object({
  ticketId: ticketIdSchema,
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  comment: z
    .string()
    .trim()
    .max(1000, "O comentário deve ter no máximo 1.000 caracteres")
    .optional(),
});

export const supportMetricsSearchSchema = z.object({
  days: withFallback(z.coerce.number().int().min(1).max(90).default(30), 30),
});
export type SupportMetricsSearch = z.infer<typeof supportMetricsSearchSchema>;
