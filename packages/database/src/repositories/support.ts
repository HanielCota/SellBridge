import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { containsPattern } from "./search-pattern.ts";
import { organization, ticketAttachments, ticketMessages, tickets, user } from "../schema/index.ts";

type TicketStatus = (typeof tickets.$inferSelect)["status"];

export interface NewAttachment {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminTicketSummary extends TicketSummary {
  tenantName: string;
  createdByEmail: string;
}

export interface TicketThread {
  ticket: TicketSummary & { tenantId: string; tenantName: string; createdByEmail: string };
  messages: {
    id: string;
    body: string;
    isAdmin: boolean;
    authorName: string;
    createdAt: Date;
    attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
  }[];
}

export async function createTicket(
  database: Database,
  input: {
    tenantId: string;
    userId: string;
    subject: string;
    body: string;
    attachments: readonly NewAttachment[];
  },
): Promise<{ ticketId: string }> {
  return database.transaction(async (transaction) => {
    const [ticket] = await transaction
      .insert(tickets)
      .values({ tenantId: input.tenantId, createdById: input.userId, subject: input.subject })
      .returning({ id: tickets.id });
    if (!ticket) {
      throw conflictError("Não foi possível abrir o chamado");
    }
    const [message] = await transaction
      .insert(ticketMessages)
      .values({ ticketId: ticket.id, authorId: input.userId, isAdmin: false, body: input.body })
      .returning({ id: ticketMessages.id });
    if (!message) {
      throw conflictError("Não foi possível registrar a mensagem");
    }
    if (input.attachments.length > 0) {
      await transaction.insert(ticketAttachments).values(
        input.attachments.map((file) => ({
          ...file,
          ticketId: ticket.id,
          messageId: message.id,
        })),
      );
    }
    return { ticketId: ticket.id };
  });
}

/**
 * Adds a message. Reseller replies (re)open the ticket; admin replies mark it answered.
 * `tenantId` scopes reseller access; admins pass null after their role was checked.
 */
export async function addTicketMessage(
  database: Database,
  input: {
    ticketId: string;
    tenantId: string | null;
    authorId: string;
    isAdmin: boolean;
    body: string;
    attachments: readonly NewAttachment[];
  },
): Promise<void> {
  const ticket = await database.query.tickets.findFirst({
    where:
      input.tenantId === null
        ? eq(tickets.id, input.ticketId)
        : and(eq(tickets.id, input.ticketId), eq(tickets.tenantId, input.tenantId)),
  });
  if (!ticket) {
    throw notFoundError("Chamado não encontrado");
  }
  if (ticket.status === "closed" && input.isAdmin) {
    throw conflictError("Reabra o chamado antes de responder");
  }
  await database.transaction(async (transaction) => {
    const [message] = await transaction
      .insert(ticketMessages)
      .values({
        ticketId: ticket.id,
        authorId: input.authorId,
        isAdmin: input.isAdmin,
        body: input.body,
      })
      .returning({ id: ticketMessages.id });
    if (!message) {
      throw conflictError("Não foi possível registrar a mensagem");
    }
    if (input.attachments.length > 0) {
      await transaction.insert(ticketAttachments).values(
        input.attachments.map((file) => ({
          ...file,
          ticketId: ticket.id,
          messageId: message.id,
        })),
      );
    }
    await transaction
      .update(tickets)
      .set({ status: input.isAdmin ? "answered" : "open" })
      .where(eq(tickets.id, ticket.id));
  });
}

function ticketFilters(filters: {
  status?: TicketStatus | undefined;
  search?: string | undefined;
}): SQL[] {
  const conditions: SQL[] = [];
  if (filters.status) {
    conditions.push(eq(tickets.status, filters.status));
  }
  if (filters.search) {
    conditions.push(ilike(tickets.subject, containsPattern(filters.search)));
  }
  return conditions;
}

export async function listTenantTickets(
  database: Database,
  tenantId: string,
  filters: { status?: TicketStatus | undefined; search?: string | undefined },
  pagination: Pagination,
): Promise<Paginated<TicketSummary>> {
  const where = and(eq(tickets.tenantId, tenantId), ...ticketFilters(filters));
  const [rows, totals] = await Promise.all([
    database
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(where)
      .orderBy(desc(tickets.updatedAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    database.select({ total: count() }).from(tickets).where(where),
  ]);
  return toPaginated(rows, totals.at(0)?.total ?? 0, pagination);
}

export async function listAllTickets(
  database: Database,
  filters: { status?: TicketStatus | undefined; search?: string | undefined },
  pagination: Pagination,
): Promise<Paginated<AdminTicketSummary>> {
  const term = filters.search ? containsPattern(filters.search) : undefined;
  const where = and(
    filters.status ? eq(tickets.status, filters.status) : undefined,
    term
      ? or(ilike(tickets.subject, term), ilike(organization.name, term), ilike(user.email, term))
      : undefined,
  );
  const base = database
    .select({
      id: tickets.id,
      subject: tickets.subject,
      status: tickets.status,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      tenantName: organization.name,
      createdByEmail: user.email,
    })
    .from(tickets)
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .innerJoin(user, eq(user.id, tickets.createdById));
  const [rows, totals] = await Promise.all([
    base
      .where(where)
      .orderBy(asc(tickets.status), desc(tickets.updatedAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    database
      .select({ total: count() })
      .from(tickets)
      .innerJoin(organization, eq(organization.id, tickets.tenantId))
      .innerJoin(user, eq(user.id, tickets.createdById))
      .where(where),
  ]);
  return toPaginated(rows, totals.at(0)?.total ?? 0, pagination);
}

async function findThreadTicket(
  database: Database,
  ticketId: string,
  tenantId: string | null,
): Promise<TicketThread["ticket"]> {
  const [ticket] = await database
    .select({
      id: tickets.id,
      subject: tickets.subject,
      status: tickets.status,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      tenantId: tickets.tenantId,
      tenantName: organization.name,
      createdByEmail: user.email,
    })
    .from(tickets)
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .innerJoin(user, eq(user.id, tickets.createdById))
    .where(
      tenantId === null
        ? eq(tickets.id, ticketId)
        : and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)),
    )
    .limit(1);
  if (!ticket) {
    throw notFoundError("Chamado não encontrado");
  }
  return ticket;
}

async function findThreadMessages(database: Database, ticketId: string) {
  return database
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      isAdmin: ticketMessages.isAdmin,
      authorName: user.name,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .innerJoin(user, eq(user.id, ticketMessages.authorId))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));
}

async function findMessageAttachments(database: Database, messageIds: readonly string[]) {
  if (messageIds.length === 0) {
    return [];
  }
  return database
    .select({
      id: ticketAttachments.id,
      messageId: ticketAttachments.messageId,
      fileName: ticketAttachments.fileName,
      mimeType: ticketAttachments.mimeType,
      sizeBytes: ticketAttachments.sizeBytes,
    })
    .from(ticketAttachments)
    .where(inArray(ticketAttachments.messageId, [...messageIds]));
}

/** Loads a full thread; pass the tenant to scope reseller access, or null for admins. */
export async function getTicketThread(
  database: Database,
  ticketId: string,
  tenantId: string | null,
): Promise<TicketThread> {
  const ticket = await findThreadTicket(database, ticketId, tenantId);
  const messages = await findThreadMessages(database, ticket.id);
  const attachments = await findMessageAttachments(
    database,
    messages.map((message) => message.id),
  );
  return {
    ticket,
    messages: messages.map((message) => ({
      ...message,
      attachments: attachments
        .filter((attachment) => attachment.messageId === message.id)
        .map(({ messageId: _messageId, ...attachment }) => attachment),
    })),
  };
}

export async function setTicketStatus(
  database: Database,
  ticketId: string,
  status: TicketStatus,
): Promise<void> {
  const [row] = await database
    .update(tickets)
    .set({ status })
    .where(eq(tickets.id, ticketId))
    .returning({ id: tickets.id });
  if (!row) {
    throw notFoundError("Chamado não encontrado");
  }
}

/** Attachment metadata for download; scoped by tenant unless the caller is an admin (null). */
export async function getAttachment(
  database: Database,
  attachmentId: string,
  tenantId: string | null,
) {
  const [row] = await database
    .select({
      id: ticketAttachments.id,
      storageKey: ticketAttachments.storageKey,
      fileName: ticketAttachments.fileName,
      mimeType: ticketAttachments.mimeType,
      tenantId: tickets.tenantId,
    })
    .from(ticketAttachments)
    .innerJoin(tickets, eq(tickets.id, ticketAttachments.ticketId))
    .where(
      tenantId === null
        ? eq(ticketAttachments.id, attachmentId)
        : and(eq(ticketAttachments.id, attachmentId), eq(tickets.tenantId, tenantId)),
    )
    .limit(1);
  if (!row) {
    throw notFoundError("Anexo não encontrado");
  }
  return row;
}
