import {
  conflictError,
  forbiddenError,
  notFoundError,
  validationError,
} from "@sellbridge/shared/errors";
import { isStaffRole, STAFF_ROLES } from "@sellbridge/shared/staff-access";
import {
  assertCanRate,
  assertCanReply,
  assertCustomerCanClose,
  awaitingAfterMessage,
  awaitingAfterStatus,
  nextTicketStatus,
  RESPONSE_TARGET_HOURS,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketMessageKind,
  type TicketPriority,
} from "@sellbridge/shared/ticket-rules";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import type { Database, DatabaseExecutor, Transaction } from "../client.ts";
import {
  activeAssigneeIdSql,
  activeAssigneeNameSql,
  assignee,
  STAFF_ROLE_LIST,
  withoutActiveAssigneeSql,
} from "./support-assignee.ts";
import { timestampOf } from "./sql/raw-values.ts";
import { containsPattern } from "./sql/search-pattern.ts";
import {
  organization,
  ticketAttachments,
  ticketEvents,
  ticketMessages,
  ticketReads,
  tickets,
  user,
} from "../schema/index.ts";

type TicketStatus = (typeof tickets.$inferSelect)["status"];
type TicketEventType = (typeof ticketEvents.$inferSelect)["type"];

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
  category: TicketCategory;
  priority: TicketPriority;
  /** Since when the reseller waits for support; null when support owes nothing. */
  awaitingSince: Date | null;
  /** The other side wrote after the reader last opened the thread. */
  hasUnread: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffTicketSummary extends TicketSummary {
  tenantName: string;
  createdByEmail: string;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface TicketEventView {
  id: number;
  type: TicketEventType;
  /** Made by the system (auto-close), not by a person. */
  automatic: boolean;
  /** Null for automatic changes and for people whose account was deleted. */
  actorName: string | null;
  /** An "assigned" event where the person took the ticket for themselves. */
  isSelfAssignment: boolean;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date;
}

export interface TicketThread {
  ticket: Omit<TicketSummary, "hasUnread"> & {
    tenantId: string;
    tenantName: string;
    createdById: string;
    createdByName: string;
    createdByEmail: string;
    assigneeId: string | null;
    assigneeName: string | null;
    firstResponseAt: Date | null;
    closedAt: Date | null;
    rating: number | null;
    ratingComment: string | null;
    ratedAt: Date | null;
  };
  messages: {
    id: string;
    body: string;
    isAdmin: boolean;
    /** Support-only note; only present in threads loaded for staff. */
    isInternal: boolean;
    /** Who wrote it; a reader never needs to mark their own message as read. */
    authorId: string;
    authorName: string;
    /** Profile photo of the author; the thread falls back to their initials without one. */
    authorImage: string | null;
    createdAt: Date;
    attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
  }[];
  /**
   * What changed on the ticket. Staff get everything; resellers get what concerns them (no
   * priority changes, no handing back to the queue).
   */
  events: TicketEventView[];
  /** The latest moment someone from the other side opened the thread (support for resellers). */
  seenByOtherSideAt: Date | null;
}

/** Which side reads the thread: resellers wait for support, support waits for resellers. */
export type TicketSide = "customer" | "staff";

export interface TicketReader {
  userId: string;
  side: TicketSide;
}

/**
 * `base` plus the ticket priority's target hours, in SQL. The hours are inlined: bound as
 * parameters inside the CASE they would reach Postgres as text.
 */
function plusResponseTarget(base: SQLWrapper): SQL {
  return sql`(${base} + (case ${tickets.priority} ${sql.join(
    TICKET_PRIORITIES.map((priority) =>
      sql.raw(`when '${priority}' then ${RESPONSE_TARGET_HOURS[priority]}`),
    ),
    sql` `,
  )} end) * interval '1 hour')`;
}

const responseDueAtSql = plusResponseTarget(tickets.awaitingSince);

function isOverdue(now: Date): SQL {
  return sql`(${tickets.status} = 'open' and ${tickets.awaitingSince} is not null and ${responseDueAtSql} < ${timestampOf(now)})`;
}

/**
 * True when the other side wrote after the reader's last visit to the thread. Written with
 * aliases on purpose: in a single-table select Drizzle leaves columns unqualified, and inside
 * the subquery `"id"` would then mean the message, not the ticket.
 */
function hasUnreadSql(reader: TicketReader | undefined): SQL<boolean> {
  if (!reader) {
    return sql<boolean>`false`;
  }
  const fromOtherSide =
    reader.side === "customer"
      ? sql.raw(`unread_m.is_admin and not unread_m.is_internal`)
      : sql.raw(`not unread_m.is_admin`);
  return sql<boolean>`exists (
    select 1 from ticket_messages unread_m
    where unread_m.ticket_id = "tickets"."id"
      and ${fromOtherSide}
      and unread_m.created_at > coalesce((
        select unread_r.read_at from ticket_reads unread_r
        where unread_r.ticket_id = "tickets"."id" and unread_r.user_id = ${reader.userId}
      ), '-infinity'::timestamptz)
  )`;
}

const summaryColumns = (reader: TicketReader | undefined) => ({
  id: tickets.id,
  subject: tickets.subject,
  status: tickets.status,
  category: tickets.category,
  priority: tickets.priority,
  awaitingSince: tickets.awaitingSince,
  hasUnread: hasUnreadSql(reader),
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
});

async function recordEvent(
  executor: DatabaseExecutor,
  input: {
    ticketId: string;
    actorId: string | null;
    type: TicketEventType;
    fromValue: string | null;
    toValue: string | null;
    createdAt: Date;
    automatic?: boolean;
  },
): Promise<void> {
  await executor.insert(ticketEvents).values(input);
}

async function markRead(
  executor: DatabaseExecutor,
  ticketId: string,
  userId: string,
  readAt: Date,
) {
  await executor
    .insert(ticketReads)
    .values({ ticketId, userId, readAt })
    .onConflictDoUpdate({
      target: [ticketReads.ticketId, ticketReads.userId],
      set: { readAt: sql`greatest(${ticketReads.readAt}, excluded.read_at)` },
    });
}

export async function insertAttachments(
  executor: DatabaseExecutor,
  ticketId: string,
  messageId: string,
  attachments: readonly NewAttachment[],
) {
  if (attachments.length === 0) {
    return;
  }
  await executor
    .insert(ticketAttachments)
    .values(attachments.map((file) => ({ ...file, ticketId, messageId })));
}

/** The ticket row, locked for the rest of the transaction; `tenantId` null means staff. */
async function lockTicket(transaction: Transaction, ticketId: string, tenantId: string | null) {
  const [ticket] = await transaction
    .select({
      id: tickets.id,
      status: tickets.status,
      assigneeId: tickets.assigneeId,
      awaitingSince: tickets.awaitingSince,
      firstResponseAt: tickets.firstResponseAt,
      ratedAt: tickets.ratedAt,
      priority: tickets.priority,
      category: tickets.category,
    })
    .from(tickets)
    .where(
      tenantId === null
        ? eq(tickets.id, ticketId)
        : and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)),
    )
    .limit(1)
    .for("update");
  if (!ticket) {
    throw notFoundError("Chamado não encontrado");
  }
  return ticket;
}

/** Columns that change with the status: when it closed, and a fresh rating after a reopen. */
function statusColumns(from: TicketStatus, to: TicketStatus, now: Date) {
  if (to === "closed" && from === "closed") {
    return {};
  }
  if (to === "closed") {
    return { closedAt: now };
  }
  if (from === "closed") {
    return { closedAt: null, rating: null, ratingComment: null, ratedAt: null };
  }
  return {};
}

type LockedTicket = Awaited<ReturnType<typeof lockTicket>>;

/**
 * What a public message does to the ticket: the new status, the response clock, the first
 * response time, and — for a support reply on a ticket nobody took — who now owns it.
 */
async function applyMessageToTicket(
  transaction: Transaction,
  ticket: LockedTicket,
  message: {
    kind: "reseller" | "reply";
    authorId: string;
    statusAfter?: TicketStatus | undefined;
  },
  now: Date,
): Promise<TicketStatus> {
  const status = nextTicketStatus(ticket.status, message.kind, message.statusAfter);
  const isFirstResponse = message.kind === "reply" && ticket.firstResponseAt === null;
  // Same rule as the "unassigned" queue: an assignee who left the team (or was blocked) counts
  // as nobody, so the first reply from the team takes the ticket out of that queue.
  const takesTicket =
    message.kind === "reply" &&
    message.authorId !== ticket.assigneeId &&
    (ticket.assigneeId === null || !(await isActiveStaff(transaction, ticket.assigneeId)));
  await transaction
    .update(tickets)
    .set({
      status,
      awaitingSince: awaitingAfterMessage(ticket.awaitingSince, message.kind, now),
      ...statusColumns(ticket.status, status, now),
      ...(isFirstResponse ? { firstResponseAt: now } : {}),
      ...(takesTicket ? { assigneeId: message.authorId } : {}),
      updatedAt: now,
    })
    .where(eq(tickets.id, ticket.id));
  const base = { ticketId: ticket.id, actorId: message.authorId, createdAt: now };
  if (status !== ticket.status) {
    await recordEvent(transaction, {
      ...base,
      type: "status_changed",
      fromValue: ticket.status,
      toValue: status,
    });
  }
  if (takesTicket) {
    await recordEvent(transaction, {
      ...base,
      type: "assigned",
      fromValue: null,
      toValue: message.authorId,
    });
  }
  return status;
}

/**
 * Adds a message. Reseller replies (re)open the ticket; support replies mark it answered
 * (or `statusAfter`); internal notes leave the ticket untouched so the reseller is not notified.
 * `tenantId` scopes reseller access; staff pass null after their permission was checked.
 * The first public support reply on a ticket nobody took assigns it to whoever answered.
 * The ticket row is locked so a concurrent close cannot slip in between check and reply.
 */
export async function addTicketMessage(
  database: Database,
  input: {
    ticketId: string;
    tenantId: string | null;
    authorId: string;
    kind: TicketMessageKind;
    statusAfter?: TicketStatus | undefined;
    body: string;
    attachments: readonly NewAttachment[];
    now?: Date;
  },
): Promise<{ status: TicketStatus }> {
  const now = input.now ?? new Date();
  return database.transaction(async (transaction) => {
    const ticket = await lockTicket(transaction, input.ticketId, input.tenantId);
    assertCanReply(ticket.status, input.kind);
    const [message] = await transaction
      .insert(ticketMessages)
      .values({
        ticketId: ticket.id,
        authorId: input.authorId,
        isAdmin: input.kind !== "reseller",
        isInternal: input.kind === "note",
        body: input.body,
        createdAt: now,
      })
      .returning({ id: ticketMessages.id });
    if (!message) {
      throw conflictError("Não foi possível registrar a mensagem");
    }
    await insertAttachments(transaction, ticket.id, message.id, input.attachments);
    await markRead(transaction, ticket.id, input.authorId, now);
    if (input.kind === "note") {
      return { status: ticket.status };
    }
    const change = { kind: input.kind, authorId: input.authorId, statusAfter: input.statusAfter };
    return { status: await applyMessageToTicket(transaction, ticket, change, now) };
  });
}

/** Staff changes the status without writing (reopen, close without reply). */
export async function setTicketStatus(
  database: Database,
  input: { ticketId: string; status: TicketStatus; actorId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTicket(transaction, input.ticketId, null);
    if (ticket.status === input.status) {
      return;
    }
    await transaction
      .update(tickets)
      .set({
        status: input.status,
        awaitingSince: awaitingAfterStatus(ticket.awaitingSince, input.status, now),
        ...statusColumns(ticket.status, input.status, now),
        updatedAt: now,
      })
      .where(eq(tickets.id, ticket.id));
    await recordEvent(transaction, {
      ticketId: ticket.id,
      actorId: input.actorId,
      type: "status_changed",
      fromValue: ticket.status,
      toValue: input.status,
      createdAt: now,
    });
  });
}

/** The reseller says the problem is solved. Writing again later reopens the ticket. */
export async function closeTicketForCustomer(
  database: Database,
  input: { ticketId: string; tenantId: string; userId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTicket(transaction, input.ticketId, input.tenantId);
    assertCustomerCanClose(ticket.status);
    await transaction
      .update(tickets)
      .set({ status: "closed", awaitingSince: null, closedAt: now, updatedAt: now })
      .where(eq(tickets.id, ticket.id));
    await recordEvent(transaction, {
      ticketId: ticket.id,
      actorId: input.userId,
      type: "status_changed",
      fromValue: ticket.status,
      toValue: "closed",
      createdAt: now,
    });
  });
}

export async function rateTicket(
  database: Database,
  input: {
    ticketId: string;
    tenantId: string;
    userId: string;
    rating: number;
    comment?: string | undefined;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTicket(transaction, input.ticketId, input.tenantId);
    assertCanRate(ticket.status, ticket.ratedAt);
    const comment = input.comment?.trim();
    await transaction
      .update(tickets)
      .set({
        rating: input.rating,
        ratingComment: comment ? comment : null,
        ratedAt: now,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticket.id));
    await recordEvent(transaction, {
      ticketId: ticket.id,
      actorId: input.userId,
      type: "rated",
      fromValue: null,
      toValue: String(input.rating),
      createdAt: now,
    });
  });
}

/**
 * Hands the ticket to a member of the team, or back to the queue (`assigneeId` null).
 * Without `mayAssignOthers` the actor can only take a ticket nobody active holds, or give
 * back their own; checked on the locked row, so a concurrent assignment can't slip in.
 */
export async function assignTicket(
  database: Database,
  input: {
    ticketId: string;
    assigneeId: string | null;
    actorId: string;
    mayAssignOthers: boolean;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    if (input.assigneeId !== null && !(await isActiveStaff(transaction, input.assigneeId))) {
      throw validationError("Escolha alguém da equipe de suporte");
    }
    const ticket = await lockTicket(transaction, input.ticketId, null);
    if (ticket.assigneeId === input.assigneeId) {
      return;
    }
    if (!input.mayAssignOthers) {
      await assertOnlyTouchesSelf(transaction, ticket.assigneeId, input);
    }
    await transaction
      .update(tickets)
      .set({ assigneeId: input.assigneeId, updatedAt: now })
      .where(eq(tickets.id, ticket.id));
    await recordEvent(transaction, {
      ticketId: ticket.id,
      actorId: input.actorId,
      type: "assigned",
      fromValue: ticket.assigneeId,
      toValue: input.assigneeId,
      createdAt: now,
    });
  });
}

async function isActiveStaff(executor: DatabaseExecutor, userId: string): Promise<boolean> {
  const [row] = await executor
    .select({ role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row !== undefined && isStaffRole(row.role) && row.banned !== true;
}

async function assertOnlyTouchesSelf(
  executor: DatabaseExecutor,
  currentAssigneeId: string | null,
  input: { assigneeId: string | null; actorId: string },
): Promise<void> {
  if (input.assigneeId === null && currentAssigneeId === input.actorId) {
    return;
  }
  const heldByTeammate =
    currentAssigneeId !== null && (await isActiveStaff(executor, currentAssigneeId));
  if (input.assigneeId === input.actorId && !heldByTeammate) {
    return;
  }
  throw forbiddenError("Só supervisores podem passar chamados de outra pessoa");
}

export async function setTicketPriority(
  database: Database,
  input: { ticketId: string; priority: TicketPriority; actorId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTicket(transaction, input.ticketId, null);
    if (ticket.priority === input.priority) {
      return;
    }
    await transaction
      .update(tickets)
      .set({ priority: input.priority, updatedAt: now })
      .where(eq(tickets.id, ticket.id));
    await recordEvent(transaction, {
      ticketId: ticket.id,
      actorId: input.actorId,
      type: "priority_changed",
      fromValue: ticket.priority,
      toValue: input.priority,
      createdAt: now,
    });
  });
}

export async function setTicketCategory(
  database: Database,
  input: { ticketId: string; category: TicketCategory; actorId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const ticket = await lockTicket(transaction, input.ticketId, null);
    if (ticket.category === input.category) {
      return;
    }
    await transaction
      .update(tickets)
      .set({ category: input.category, updatedAt: now })
      .where(eq(tickets.id, ticket.id));
    await recordEvent(transaction, {
      ticketId: ticket.id,
      actorId: input.actorId,
      type: "category_changed",
      fromValue: ticket.category,
      toValue: input.category,
      createdAt: now,
    });
  });
}

/**
 * Marks the thread as read up to the last message the person saw: a message that arrives
 * between loading the thread and this call stays unread. `tenantId` scopes resellers (who can
 * only point at public messages); null is staff.
 */
export async function markTicketRead(
  database: Database,
  input: { ticketId: string; userId: string; tenantId: string | null; lastMessageId: string },
): Promise<void> {
  const [message] = await database
    .select({ createdAt: ticketMessages.createdAt })
    .from(ticketMessages)
    .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
    .where(
      and(
        eq(ticketMessages.id, input.lastMessageId),
        eq(tickets.id, input.ticketId),
        input.tenantId === null ? undefined : eq(tickets.tenantId, input.tenantId),
        input.tenantId === null ? undefined : eq(ticketMessages.isInternal, false),
      ),
    )
    .limit(1);
  if (!message) {
    throw notFoundError("Chamado não encontrado");
  }
  await markRead(database, input.ticketId, input.userId, message.createdAt);
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

/**
 * A tenant's tickets. With `readerId`, each one says whether it has a support reply that
 * person did not read yet.
 */
export async function listTenantTickets(
  database: Database,
  tenantId: string,
  filters: {
    status?: TicketStatus | undefined;
    search?: string | undefined;
    readerId?: string | undefined;
  },
  pagination: Pagination,
): Promise<Paginated<TicketSummary>> {
  const where = and(eq(tickets.tenantId, tenantId), ...ticketFilters(filters));
  const reader = filters.readerId
    ? { userId: filters.readerId, side: "customer" as const }
    : undefined;
  const [rows, totals] = await Promise.all([
    database
      .select(summaryColumns(reader))
      .from(tickets)
      .where(where)
      .orderBy(desc(tickets.updatedAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    database.select({ total: count() }).from(tickets).where(where),
  ]);
  return toPaginated(rows, totals.at(0)?.total ?? 0, pagination);
}

/** Tickets of the tenant with a support reply the reader has not opened yet. */
export async function countUnreadSupportReplies(
  database: Database,
  tenantId: string,
  readerId: string,
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(tickets)
    .where(
      and(eq(tickets.tenantId, tenantId), hasUnreadSql({ userId: readerId, side: "customer" })),
    );
  return row?.total ?? 0;
}

/** Tickets with a support reply the reader has not opened, newest reply first. */
export async function listUnreadSupportReplies(
  database: Database,
  tenantId: string,
  readerId: string,
  limit: number,
): Promise<{ ticketId: string; subject: string; repliedAt: Date }[]> {
  const repliedAt = sql<Date>`(
    select max(reply_m.created_at) from ticket_messages reply_m
    where reply_m.ticket_id = "tickets"."id" and reply_m.is_admin and not reply_m.is_internal
  )`.mapWith(tickets.updatedAt);
  return database
    .select({ ticketId: tickets.id, subject: tickets.subject, repliedAt })
    .from(tickets)
    .where(
      and(eq(tickets.tenantId, tenantId), hasUnreadSql({ userId: readerId, side: "customer" })),
    )
    .orderBy(desc(repliedAt))
    .limit(limit);
}

export interface StaffTicketFilters {
  queue: "unassigned" | "mine" | "overdue" | "all";
  status?: TicketStatus | undefined;
  priority?: TicketPriority | undefined;
  category?: TicketCategory | undefined;
  search?: string | undefined;
}

function queueCondition(queue: StaffTicketFilters["queue"], viewerId: string, now: Date) {
  if (queue === "unassigned") {
    return and(withoutActiveAssigneeSql, inArray(tickets.status, ["open", "answered"]));
  }
  if (queue === "mine") {
    return and(eq(tickets.assigneeId, viewerId), inArray(tickets.status, ["open", "answered"]));
  }
  if (queue === "overdue") {
    return isOverdue(now);
  }
  return undefined;
}

/** The support inbox: one queue, filtered, with unread dots for the viewing staff member. */
export async function listStaffTickets(
  database: Database,
  input: StaffTicketFilters & { viewerId: string; now?: Date },
  pagination: Pagination,
): Promise<Paginated<StaffTicketSummary>> {
  const now = input.now ?? new Date();
  const term = input.search ? containsPattern(input.search) : undefined;
  const where = and(
    queueCondition(input.queue, input.viewerId, now),
    input.status ? eq(tickets.status, input.status) : undefined,
    input.priority ? eq(tickets.priority, input.priority) : undefined,
    input.category ? eq(tickets.category, input.category) : undefined,
    term
      ? or(ilike(tickets.subject, term), ilike(organization.name, term), ilike(user.email, term))
      : undefined,
  );
  const order =
    input.queue === "overdue"
      ? // Most late first: a low ticket waiting long can be less late than an urgent one.
        [asc(responseDueAtSql)]
      : [asc(tickets.status), desc(tickets.priority), desc(tickets.updatedAt)];
  const [rows, totals] = await Promise.all([
    database
      .select({
        ...summaryColumns({ userId: input.viewerId, side: "staff" }),
        tenantName: organization.name,
        createdByEmail: user.email,
        assigneeId: activeAssigneeIdSql,
        assigneeName: activeAssigneeNameSql,
      })
      .from(tickets)
      .innerJoin(organization, eq(organization.id, tickets.tenantId))
      .innerJoin(user, eq(user.id, tickets.createdById))
      .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
      .where(where)
      .orderBy(...order)
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

export interface StaffQueueCounts {
  unassigned: number;
  mine: number;
  overdue: number;
  /** Tickets waiting for support right now (status open). */
  open: number;
}

export async function countStaffQueues(
  database: Database,
  viewerId: string,
  now: Date = new Date(),
): Promise<StaffQueueCounts> {
  const active = inArray(tickets.status, ["open", "answered"]);
  const [row] = await database
    .select({
      unassigned:
        sql<number>`count(*) filter (where ${and(active, withoutActiveAssigneeSql)})`.mapWith(
          Number,
        ),
      mine: sql<number>`count(*) filter (where ${and(active, eq(tickets.assigneeId, viewerId))})`.mapWith(
        Number,
      ),
      overdue: sql<number>`count(*) filter (where ${isOverdue(now)})`.mapWith(Number),
      open: sql<number>`count(*) filter (where ${tickets.status} = 'open')`.mapWith(Number),
    })
    .from(tickets)
    // Every counter is about live tickets: skipping the closed ones (most of the table, and
    // growing) lets the queue index do the work.
    .where(active);
  return row ?? { unassigned: 0, mine: 0, overdue: 0, open: 0 };
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
      category: tickets.category,
      priority: tickets.priority,
      awaitingSince: tickets.awaitingSince,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      tenantId: tickets.tenantId,
      tenantName: organization.name,
      createdById: tickets.createdById,
      createdByName: user.name,
      createdByEmail: user.email,
      assigneeId: activeAssigneeIdSql,
      assigneeName: activeAssigneeNameSql,
      firstResponseAt: tickets.firstResponseAt,
      closedAt: tickets.closedAt,
      rating: tickets.rating,
      ratingComment: tickets.ratingComment,
      ratedAt: tickets.ratedAt,
    })
    .from(tickets)
    .innerJoin(organization, eq(organization.id, tickets.tenantId))
    .innerJoin(user, eq(user.id, tickets.createdById))
    .leftJoin(assignee, eq(assignee.id, tickets.assigneeId))
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

async function findThreadMessages(database: Database, ticketId: string, withInternal: boolean) {
  return database
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      isAdmin: ticketMessages.isAdmin,
      isInternal: ticketMessages.isInternal,
      authorId: ticketMessages.authorId,
      authorName: user.name,
      authorImage: user.image,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .innerJoin(user, eq(user.id, ticketMessages.authorId))
    .where(
      and(
        eq(ticketMessages.ticketId, ticketId),
        withInternal ? undefined : eq(ticketMessages.isInternal, false),
      ),
    )
    .orderBy(asc(ticketMessages.createdAt));
}

/**
 * Every attachment of the ticket, read by the indexed `ticket_id` alongside the messages.
 * Callers pair them with the messages they show, so files of notes left out stay out.
 */
async function findTicketAttachments(database: Database, ticketId: string) {
  return database
    .select({
      id: ticketAttachments.id,
      messageId: ticketAttachments.messageId,
      fileName: ticketAttachments.fileName,
      mimeType: ticketAttachments.mimeType,
      sizeBytes: ticketAttachments.sizeBytes,
    })
    .from(ticketAttachments)
    .where(eq(ticketAttachments.ticketId, ticketId));
}

/** Event types whose values are user ids, shown as names. */
const PERSON_EVENTS: ReadonlySet<TicketEventType> = new Set(["assigned", "follower_added"]);

/** Names of the people an "assigned" or "follower_added" event points at. */
async function namesOf(database: Database, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** A reseller sees who handles the ticket and what changed for them, not the team's triage. */
function isCustomerVisible(event: TicketEventView): boolean {
  if (event.type === "priority_changed") {
    return false;
  }
  if (event.type === "assigned") {
    return event.toValue !== null;
  }
  return true;
}

async function findThreadEvents(database: Database, ticketId: string): Promise<TicketEventView[]> {
  const rows = await database
    .select({
      id: ticketEvents.id,
      type: ticketEvents.type,
      automatic: ticketEvents.automatic,
      actorId: ticketEvents.actorId,
      actorName: user.name,
      fromValue: ticketEvents.fromValue,
      toValue: ticketEvents.toValue,
      createdAt: ticketEvents.createdAt,
    })
    .from(ticketEvents)
    .leftJoin(user, eq(user.id, ticketEvents.actorId))
    .where(eq(ticketEvents.ticketId, ticketId))
    .orderBy(asc(ticketEvents.id));
  const assignedIds = rows
    .filter((row) => PERSON_EVENTS.has(row.type))
    .flatMap((row) => [row.fromValue, row.toValue])
    .filter((id): id is string => id !== null);
  const names = await namesOf(database, [...new Set(assignedIds)]);
  return rows.map(({ actorId, ...row }) => {
    if (!PERSON_EVENTS.has(row.type)) {
      return { ...row, isSelfAssignment: false };
    }
    const fallback = row.type === "assigned" ? "Ex-membro da equipe" : "Usuário removido";
    return {
      ...row,
      isSelfAssignment: row.type === "assigned" && actorId !== null && row.toValue === actorId,
      fromValue: row.fromValue === null ? null : (names.get(row.fromValue) ?? fallback),
      toValue: row.toValue === null ? null : (names.get(row.toValue) ?? fallback),
    };
  });
}

/** Last time anyone from the other side read the thread: support for resellers, and back. */
async function findSeenByOtherSideAt(
  database: Database,
  ticketId: string,
  side: TicketSide,
): Promise<Date | null> {
  const isStaffReader = sql`coalesce(${user.role} in (${STAFF_ROLE_LIST}), false)`;
  const [row] = await database
    .select({ readAt: sql<Date | null>`max(${ticketReads.readAt})`.mapWith(ticketReads.readAt) })
    .from(ticketReads)
    .innerJoin(user, eq(user.id, ticketReads.userId))
    .where(
      and(
        eq(ticketReads.ticketId, ticketId),
        side === "customer" ? isStaffReader : sql`not ${isStaffReader}`,
      ),
    );
  return row?.readAt ?? null;
}

/**
 * Loads a full thread; pass the tenant to scope reseller access, or null for staff.
 * Internal notes are only part of the staff thread; resellers get a trimmed history.
 */
export async function getTicketThread(
  database: Database,
  ticketId: string,
  tenantId: string | null,
): Promise<TicketThread> {
  const ticket = await findThreadTicket(database, ticketId, tenantId);
  const isStaff = tenantId === null;
  const [messages, allEvents, seenByOtherSideAt, attachments] = await Promise.all([
    findThreadMessages(database, ticket.id, isStaff),
    findThreadEvents(database, ticket.id),
    findSeenByOtherSideAt(database, ticket.id, isStaff ? "staff" : "customer"),
    findTicketAttachments(database, ticket.id),
  ]);
  const events = isStaff ? allEvents : allEvents.filter(isCustomerVisible);
  return {
    ticket,
    messages: messages.map((message) => ({
      ...message,
      attachments: attachments
        .filter((attachment) => attachment.messageId === message.id)
        .map(({ messageId: _messageId, ...attachment }) => attachment),
    })),
    events,
    seenByOtherSideAt,
  };
}

/** Who opened the ticket, to tell them by e-mail that support answered. */
export async function findTicketRequester(
  database: Database,
  ticketId: string,
): Promise<{ subject: string; name: string; email: string } | null> {
  const [row] = await database
    .select({ subject: tickets.subject, name: user.name, email: user.email })
    .from(tickets)
    .innerJoin(user, eq(user.id, tickets.createdById))
    .where(eq(tickets.id, ticketId))
    .limit(1);
  return row ?? null;
}

/** Members of the support team a ticket can be handed to. */
export async function listSupportStaff(
  database: Database,
): Promise<{ id: string; name: string; role: string }[]> {
  const rows = await database
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(
      and(inArray(user.role, [...STAFF_ROLES]), or(isNull(user.banned), eq(user.banned, false))),
    )
    .orderBy(asc(user.name));
  return rows.map((row) => ({ ...row, role: row.role ?? "user" }));
}

/** Closes tickets support answered and the reseller left alone since `before`. */
const AUTO_CLOSE_EVENTS_PER_INSERT = 1000;

export async function autoCloseIdleTickets(
  database: Database,
  input: { before: Date; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  return database.transaction(async (transaction) => {
    const closed = await transaction
      .update(tickets)
      .set({ status: "closed", closedAt: now, awaitingSince: null, updatedAt: now })
      .where(
        and(
          eq(tickets.status, "answered"),
          isNull(tickets.awaitingSince),
          lt(tickets.updatedAt, input.before),
        ),
      )
      .returning({ id: tickets.id });
    if (closed.length === 0) {
      return 0;
    }
    const events = closed.map((ticket) => ({
      ticketId: ticket.id,
      actorId: null,
      automatic: true,
      type: "status_changed" as const,
      fromValue: "answered",
      toValue: "closed",
      createdAt: now,
    }));
    // Postgres takes at most 65,535 parameters per statement (7 per event): the first run
    // after a long pause can close tens of thousands of tickets at once.
    for (let start = 0; start < events.length; start += AUTO_CLOSE_EVENTS_PER_INSERT) {
      await transaction
        .insert(ticketEvents)
        .values(events.slice(start, start + AUTO_CLOSE_EVENTS_PER_INSERT));
    }
    return closed.length;
  });
}

export interface SupportMetrics {
  opened: number;
  closed: number;
  openNow: number;
  overdueNow: number;
  /** Average time to the first support reply, for tickets opened in the period. */
  averageFirstResponseMinutes: number | null;
  /**
   * Share of tickets opened in the period whose first reply came within the target. Measured
   * against the ticket's current priority.
   */
  withinTargetRate: number | null;
  /** Every rating given in the period, even if the ticket was reopened afterwards. */
  averageRating: number | null;
  ratings: number;
  byCategory: { category: TicketCategory; total: number }[];
  byAgent: {
    agentId: string;
    agentName: string;
    assignedOpen: number;
    closed: number;
    replies: number;
    averageRating: number | null;
  }[];
}

const firstReplyTarget = plusResponseTarget(tickets.createdAt);

function numberOrNull(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }
  return Number(value);
}

async function overviewMetrics(database: Database, since: Date, now: Date) {
  const openedInPeriod = gte(tickets.createdAt, since);
  const answeredInPeriod = and(openedInPeriod, isNotNull(tickets.firstResponseAt));
  const [row] = await database
    .select({
      opened: sql<number>`count(*) filter (where ${openedInPeriod})`.mapWith(Number),
      closed:
        sql<number>`count(*) filter (where ${tickets.closedAt} >= ${timestampOf(since)})`.mapWith(
          Number,
        ),
      openNow: sql<number>`count(*) filter (where ${tickets.status} = 'open')`.mapWith(Number),
      overdueNow: sql<number>`count(*) filter (where ${isOverdue(now)})`.mapWith(Number),
      averageFirstResponseMinutes: sql<
        string | null
      >`avg(extract(epoch from (${tickets.firstResponseAt} - ${tickets.createdAt})) / 60) filter (where ${answeredInPeriod})`,
      withinTargetRate: sql<
        string | null
      >`avg(case when ${tickets.firstResponseAt} <= ${firstReplyTarget} then 1.0 else 0.0 end) filter (where ${answeredInPeriod})`,
    })
    .from(tickets);
  return row;
}

/**
 * Ratings come from the history, not from `tickets.rating`: reopening a ticket clears that
 * column for the next close, and a low rating must not vanish from the metrics with it.
 */
const ratingValue = sql`(${ticketEvents.toValue})::int`;
const ratedSince = (since: Date) =>
  and(eq(ticketEvents.type, "rated"), gte(ticketEvents.createdAt, since));

async function ratingMetrics(database: Database, since: Date) {
  const [row] = await database
    .select({ average: sql<string | null>`avg(${ratingValue})`, total: count() })
    .from(ticketEvents)
    .where(ratedSince(since));
  return { average: numberOrNull(row?.average ?? null), total: row?.total ?? 0 };
}

async function agentMetrics(database: Database, since: Date) {
  const replies = database
    .select({ authorId: ticketMessages.authorId, replies: count().as("replies") })
    .from(ticketMessages)
    .where(
      and(
        eq(ticketMessages.isAdmin, true),
        eq(ticketMessages.isInternal, false),
        gte(ticketMessages.createdAt, since),
      ),
    )
    .groupBy(ticketMessages.authorId)
    .as("agent_replies");
  const assigned = database
    .select({
      assigneeId: tickets.assigneeId,
      assignedOpen: sql<number>`count(*) filter (where ${tickets.status} <> 'closed')`.as(
        "assigned_open",
      ),
      closed: sql<number>`count(*) filter (where ${tickets.closedAt} >= ${timestampOf(since)})`.as(
        "closed",
      ),
    })
    .from(tickets)
    .where(isNotNull(tickets.assigneeId))
    .groupBy(tickets.assigneeId)
    .as("agent_tickets");
  // Credited to whoever holds the ticket now.
  const rated = database
    .select({
      assigneeId: tickets.assigneeId,
      averageRating: sql<string | null>`avg(${ratingValue})`.as("average_rating"),
    })
    .from(ticketEvents)
    .innerJoin(tickets, eq(tickets.id, ticketEvents.ticketId))
    .where(and(ratedSince(since), isNotNull(tickets.assigneeId)))
    .groupBy(tickets.assigneeId)
    .as("agent_ratings");
  const rows = await database
    .select({
      agentId: user.id,
      agentName: user.name,
      assignedOpen: sql<number>`coalesce(${assigned.assignedOpen}, 0)`.mapWith(Number),
      closed: sql<number>`coalesce(${assigned.closed}, 0)`.mapWith(Number),
      replies: sql<number>`coalesce(${replies.replies}, 0)`.mapWith(Number),
      averageRating: rated.averageRating,
    })
    .from(user)
    .leftJoin(assigned, eq(assigned.assigneeId, user.id))
    .leftJoin(replies, eq(replies.authorId, user.id))
    .leftJoin(rated, eq(rated.assigneeId, user.id))
    .where(inArray(user.role, [...STAFF_ROLES]))
    .orderBy(asc(user.name));
  return rows.map((row) => ({ ...row, averageRating: numberOrNull(row.averageRating) }));
}

/** Volume, response times and satisfaction since `since`, overall and per team member. */
export async function getSupportMetrics(
  database: Database,
  input: { since: Date; now?: Date },
): Promise<SupportMetrics> {
  const now = input.now ?? new Date();
  const [overview, ratings, byCategory, byAgent] = await Promise.all([
    overviewMetrics(database, input.since, now),
    ratingMetrics(database, input.since),
    database
      .select({ category: tickets.category, total: count() })
      .from(tickets)
      .where(gte(tickets.createdAt, input.since))
      .groupBy(tickets.category)
      .orderBy(desc(count())),
    agentMetrics(database, input.since),
  ]);
  return {
    opened: overview?.opened ?? 0,
    closed: overview?.closed ?? 0,
    openNow: overview?.openNow ?? 0,
    overdueNow: overview?.overdueNow ?? 0,
    averageFirstResponseMinutes: numberOrNull(overview?.averageFirstResponseMinutes ?? null),
    withinTargetRate: numberOrNull(overview?.withinTargetRate ?? null),
    averageRating: ratings.average,
    ratings: ratings.total,
    byCategory,
    byAgent,
  };
}

/**
 * Attachment metadata for download; scoped by tenant unless the caller is staff (null).
 * Files attached to internal notes are invisible to the tenant.
 */
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
    .innerJoin(ticketMessages, eq(ticketMessages.id, ticketAttachments.messageId))
    .where(
      tenantId === null
        ? eq(ticketAttachments.id, attachmentId)
        : and(
            eq(ticketAttachments.id, attachmentId),
            eq(tickets.tenantId, tenantId),
            eq(ticketMessages.isInternal, false),
          ),
    )
    .limit(1);
  if (!row) {
    throw notFoundError("Anexo não encontrado");
  }
  return row;
}

/**
 * The ticket a new message would go to, as the message would find it: null when it does not
 * exist or, for a reseller (`tenantId` set), belongs to another organization. Checked before any
 * attachment is written, so a refused message never puts a file on disk.
 */
export async function findTicketForMessage(
  database: Database,
  input: { ticketId: string; tenantId: string | null },
): Promise<{ status: TicketStatus } | null> {
  const [ticket] = await database
    .select({ status: tickets.status })
    .from(tickets)
    .where(
      input.tenantId === null
        ? eq(tickets.id, input.ticketId)
        : and(eq(tickets.id, input.ticketId), eq(tickets.tenantId, input.tenantId)),
    )
    .limit(1);
  return ticket ?? null;
}
