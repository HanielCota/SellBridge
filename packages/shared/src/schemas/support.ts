import { z } from "zod";
import { freeText, pageNumberSchema, searchQuery } from "./common.ts";
import {
  MAX_RATING,
  MIN_RATING,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from "../domain/ticket-rules.ts";
import { withFallback, optionalParameter } from "./fallback.ts";
import { SUPPORT_ORIGINS, SUPPORT_PERIOD_DAYS } from "../domain/support-performance/types.ts";

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

export const ticketSubjectSchema = freeText()
  .trim()
  .min(5, "O assunto deve ter ao menos 5 caracteres")
  .max(120, "O assunto deve ter no máximo 120 caracteres");

export const ticketBodySchema = freeText()
  .trim()
  .min(10, "Descreva com ao menos 10 caracteres")
  .max(5000, "A mensagem deve ter no máximo 5.000 caracteres");

/** An optional text field of a multipart form: empty means not sent. */
export function optionalFormText(max: number) {
  return z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === "" ? undefined : value.trim()))
    .pipe(freeText().max(max).optional());
}

/**
 * The guided new-ticket form. The customer picks a topic (the category) and what is going on
 * (the situation); the server derives the subject and the priority from them.
 */
export const createTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES, { error: "Escolha sobre o que é o chamado" }),
  situation: optionalFormText(40),
  /** What the ticket is about when opened from an order, store or listing ("Pedido 123"). */
  about: optionalFormText(120),
  body: ticketBodySchema,
  /** The automatic answer the customer read before pressing "Ainda preciso de ajuda". */
  assistantAnswerId: optionalFormText(40),
});

/** What the support assistant reads: the same topic, situation and text the ticket would carry. */
export const askSupportAssistantSchema = z.object({
  category: ticketCategorySchema,
  situation: optionalFormText(40),
  body: ticketBodySchema,
});

/** "Resolveu meu problema": only ids, never the customer's text. */
export const supportAssistantOutcomeSchema = z.object({
  category: ticketCategorySchema,
  situation: optionalFormText(40),
  answerId: z.string().trim().min(1).max(40),
});

/** Prefills the new-ticket form from a page that links to it (an error card, a listing). */
export const newTicketSearchSchema = z.object({
  categoria: optionalParameter(ticketCategorySchema),
  assunto: optionalParameter(freeText().trim().max(120)),
  /** Text the description starts with, e.g. which flag a supplier contests. */
  texto: optionalParameter(freeText().max(300)),
  /** The order, store or listing the ticket is about (item 27.a); checked against the account. */
  pedido: optionalParameter(z.uuid()),
  loja: optionalParameter(z.uuid()),
  anuncio: optionalParameter(z.uuid()),
});

/** An optional id from the new-ticket form: empty means nothing linked, anything else a uuid. */
export const optionalFormId = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === "" ? undefined : value))
  .pipe(z.uuid({ error: "Vínculo do chamado inválido" }).optional());

export const ticketAboutSchema = z.object({
  orderId: optionalFormId,
  storeConnectionId: optionalFormId,
  listingId: optionalFormId,
});
export type TicketAboutInput = z.infer<typeof ticketAboutSchema>;
export type NewTicketSearch = z.infer<typeof newTicketSearchSchema>;

export const replyTicketSchema = z.object({ body: ticketBodySchema });

/** Internal notes are quick jottings for the team, so they only need to be non-empty. */
export const internalNoteBodySchema = freeText()
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
  query: optionalParameter(searchQuery()),
  page: withFallback(pageNumberSchema.default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(5).max(50).default(10), 10),
});
export type TicketsSearch = z.infer<typeof ticketsSearchSchema>;

/**
 * Slices of the support inbox; the default (all) comes first, then what needs someone, then the
 * reseller ↔ supplier conversations the team only reads.
 */
export const TICKET_QUEUES = ["all", "unassigned", "mine", "overdue", "suppliers"] as const;
export const ticketQueueSchema = z.enum(TICKET_QUEUES);
export type TicketQueue = z.infer<typeof ticketQueueSchema>;

export const TICKET_QUEUE_LABELS: Record<TicketQueue, string> = {
  unassigned: "Sem responsável",
  mine: "Minha caixa",
  overdue: "Atrasados",
  all: "Todos",
  suppliers: "Revendedor ↔ fornecedor",
};

export const staffTicketsSearchSchema = ticketsSearchSchema.extend({
  queue: withFallback(ticketQueueSchema.default("all"), "all"),
  priority: optionalParameter(ticketPrioritySchema),
  category: optionalParameter(ticketCategorySchema),
  /**
   * A support-topic situation id, from the performance screen's subjects; `sem-detalhe` lists
   * the tickets opened before the guided form recorded one.
   */
  situacao: optionalParameter(z.string().trim().min(1).max(40)),
  /** Only resellers' or only suppliers' tickets, as the performance screen counted them. */
  origem: optionalParameter(z.enum(["revendedor", "fornecedor"])),
  /** A team member's id, from the performance screen's people. */
  responsavel: optionalParameter(z.string().trim().min(1).max(64)),
});
export type StaffTicketsSearch = z.infer<typeof staffTicketsSearchSchema>;

/** The `situacao` value for tickets without a recorded situation. */
export const NO_SITUATION_FILTER = "sem-detalhe";

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

/** Orders the reseller can pin to a ticket, searched by order number or buyer. */
export const linkableOrdersSchema = z.object({
  ticketId: ticketIdSchema,
  query: freeText().trim().max(100).optional(),
});

export const ticketOrderLinkSchema = z.object({
  ticketId: ticketIdSchema,
  orderId: z.uuid(),
});

/** Turns support e-mails about this ticket on or off for the person asking. */
export const ticketNotificationsSchema = z.object({
  ticketId: ticketIdSchema,
  notify: z.boolean(),
});

/** A colleague of the same store who should also get the e-mails about this ticket. */
export const addTicketFollowerSchema = z.object({
  ticketId: ticketIdSchema,
  userId: z.string().min(1, "Escolha um colega"),
});

export const rateTicketSchema = z.object({
  ticketId: ticketIdSchema,
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  comment: freeText()
    .trim()
    .max(1000, "O comentário deve ter no máximo 1.000 caracteres")
    .optional(),
});

export const SUPPORT_PERFORMANCE_SECTIONS = ["geral", "equipe", "assuntos"] as const;
export type SupportPerformanceSection = (typeof SUPPORT_PERFORMANCE_SECTIONS)[number];

export const SUPPORT_PERFORMANCE_CHARTS = ["volume", "resposta", "horarios"] as const;
export type SupportPerformanceChart = (typeof SUPPORT_PERFORMANCE_CHARTS)[number];

const supportPeriodSchema = z.coerce
  .number()
  .pipe(z.union(SUPPORT_PERIOD_DAYS.map((days) => z.literal(days))));

/** What the support performance report is computed for: the server function's input. */
export const supportPerformanceInputSchema = z.object({
  days: withFallback(supportPeriodSchema.default(30), 30),
  origem: withFallback(z.enum(SUPPORT_ORIGINS).default("todos"), "todos"),
});
export type SupportPerformanceInput = z.infer<typeof supportPerformanceInputSchema>;

/**
 * The performance page's URL. Not `perfil`: that one switches the session's profile. `pessoa`
 * opens a team member's sheet.
 */
export const supportMetricsSearchSchema = supportPerformanceInputSchema.extend({
  secao: withFallback(z.enum(SUPPORT_PERFORMANCE_SECTIONS).default("geral"), "geral"),
  grafico: withFallback(z.enum(SUPPORT_PERFORMANCE_CHARTS).default("volume"), "volume"),
  pessoa: optionalParameter(z.string().trim().min(1).max(64)),
});
export type SupportMetricsSearch = z.infer<typeof supportMetricsSearchSchema>;
