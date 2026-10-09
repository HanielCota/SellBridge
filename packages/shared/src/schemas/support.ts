import { z } from "zod";

export const TICKET_STATUSES = ["open", "answered", "closed"] as const;
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Aguardando suporte",
  answered: "Respondido",
  closed: "Encerrado",
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
  subject: ticketSubjectSchema,
  body: ticketBodySchema,
});

export const replyTicketSchema = z.object({ body: ticketBodySchema });

export const ticketsSearchSchema = z.object({
  status: ticketStatusSchema.optional().catch(undefined),
  query: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10).catch(10),
});
export type TicketsSearch = z.infer<typeof ticketsSearchSchema>;
