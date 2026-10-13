import {
  addTicketFollower,
  assignTicket,
  closeTicketForCustomer,
  countStaffQueues,
  countUnreadSupportReplies,
  getSupportMetrics,
  getTicketThread,
  linkTicketOrder,
  listLinkableOrders,
  listStaffTickets,
  listSupportStaff,
  listTenantColleagues,
  listTenantTickets,
  listTicketFollowers,
  listTicketOrders,
  markTicketRead,
  rateTicket,
  setTicketCategory,
  setTicketNotifications,
  setTicketPriority,
  setTicketStatus,
  unlinkTicketOrder,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  addTicketFollowerSchema,
  assignTicketSchema,
  linkableOrdersSchema,
  rateTicketSchema,
  setTicketCategorySchema,
  setTicketPrioritySchema,
  staffTicketsSearchSchema,
  supportMetricsSearchSchema,
  ticketNotificationsSchema,
  ticketOrderLinkSchema,
  ticketStatusSchema,
  ticketsSearchSchema,
} from "@sellbridge/shared/schemas";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { staffMiddleware, tenantMiddleware } from "@/lib/server/middleware";

/** How many other tickets of the same store the team sees next to a thread. */
const RELATED_TICKETS_LIMIT = 5;
/** Tickets listed in the support button's menu. */
const RECENT_TICKETS_LIMIT = 3;
const DAY_MILLISECONDS = 86_400_000;
/** Orders offered at once in the "link an order" picker. */
const LINKABLE_ORDERS_LIMIT = 8;

const ticketIdInput = z.object({ ticketId: z.uuid() });
/** The last message on screen when the thread was marked read. */
const readInput = z.object({ ticketId: z.uuid(), lastMessageId: z.uuid() });

/** An admin looking around as the customer must not clear the customer's unread replies. */
async function isImpersonating(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  return Boolean(session?.session.impersonatedBy);
}

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(ticketsSearchSchema)
  .handler(async ({ context, data }) =>
    listTenantTickets(
      database,
      context.tenantId,
      { status: data.status, search: data.query, readerId: context.userId },
      { page: data.page, pageSize: data.pageSize },
    ),
  );

/** What the support button shows: unread replies and the latest tickets. */
export const getMySupportOverview = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    const [unread, recent] = await Promise.all([
      countUnreadSupportReplies(database, context.tenantId, context.userId),
      listTenantTickets(
        database,
        context.tenantId,
        { readerId: context.userId },
        { page: 1, pageSize: RECENT_TICKETS_LIMIT },
      ),
    ]);
    return { unread, recent: recent.items, total: recent.total };
  });

/** The thread plus what hangs off it: linked orders and who gets the e-mails. */
export const getMyTicket = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(ticketIdInput)
  .handler(async ({ context, data }) => {
    const thread = await getTicketThread(database, data.ticketId, context.tenantId);
    const [orders, followers] = await Promise.all([
      listTicketOrders(database, thread.ticket.id),
      listTicketFollowers(database, thread.ticket.id),
    ]);
    const me = followers.find((follower) => follower.userId === context.userId);
    return {
      ...thread,
      orders,
      followers,
      viewerId: context.userId,
      notifyMe: me?.notify ?? false,
    };
  });

export const listMyLinkableOrders = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(linkableOrdersSchema)
  .handler(async ({ context, data }) =>
    listLinkableOrders(database, {
      tenantId: context.tenantId,
      ticketId: data.ticketId,
      search: data.query,
      limit: LINKABLE_ORDERS_LIMIT,
    }),
  );

export const linkMyTicketOrder = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(ticketOrderLinkSchema)
  .handler(async ({ context, data }) => {
    await linkTicketOrder(database, {
      ...data,
      tenantId: context.tenantId,
      actorId: context.userId,
    });
    return { ok: true };
  });

export const unlinkMyTicketOrder = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(ticketOrderLinkSchema)
  .handler(async ({ context, data }) => {
    await unlinkTicketOrder(database, {
      ...data,
      tenantId: context.tenantId,
      actorId: context.userId,
    });
    return { ok: true };
  });

export const setMyTicketNotifications = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(ticketNotificationsSchema)
  .handler(async ({ context, data }) => {
    await setTicketNotifications(database, {
      ...data,
      tenantId: context.tenantId,
      userId: context.userId,
    });
    return { ok: true };
  });

/** People of the store who could also follow a ticket. */
export const listMyColleagues = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => listTenantColleagues(database, context.tenantId));

export const addMyTicketFollower = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(addTicketFollowerSchema)
  .handler(async ({ context, data }) => {
    await addTicketFollower(database, {
      ...data,
      tenantId: context.tenantId,
      actorId: context.userId,
    });
    logger.info("support.follower_added", { ticketId: data.ticketId });
    return { ok: true };
  });

export const markMyTicketRead = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(readInput)
  .handler(async ({ context, data }) => {
    if (await isImpersonating()) {
      return { ok: true };
    }
    await markTicketRead(database, {
      ticketId: data.ticketId,
      userId: context.userId,
      tenantId: context.tenantId,
      lastMessageId: data.lastMessageId,
    });
    return { ok: true };
  });

export const closeMyTicket = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(ticketIdInput)
  .handler(async ({ context, data }) => {
    await closeTicketForCustomer(database, {
      ticketId: data.ticketId,
      tenantId: context.tenantId,
      userId: context.userId,
    });
    logger.info("support.closed_by_customer", { ticketId: data.ticketId });
    return { ok: true };
  });

export const rateMyTicket = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(rateTicketSchema)
  .handler(async ({ context, data }) => {
    await rateTicket(database, {
      ticketId: data.ticketId,
      tenantId: context.tenantId,
      userId: context.userId,
      rating: data.rating,
      comment: data.comment,
    });
    logger.info("support.rated", { ticketId: data.ticketId, rating: data.rating });
    return { ok: true };
  });

export const staffListTickets = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("support.answer")])
  .validator(staffTicketsSearchSchema)
  .handler(async ({ context, data }) =>
    listStaffTickets(
      database,
      {
        queue: data.queue,
        status: data.status,
        priority: data.priority,
        category: data.category,
        search: data.query,
        viewerId: context.userId,
      },
      { page: data.page, pageSize: data.pageSize },
    ),
  );

export const staffQueueCounts = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("support.answer")])
  .handler(async ({ context }) => countStaffQueues(database, context.userId));

export const staffGetTicket = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("support.answer")])
  .validator(ticketIdInput)
  .handler(async ({ data }) => {
    const thread = await getTicketThread(database, data.ticketId, null);
    const [history, orders] = await Promise.all([
      listTenantTickets(
        database,
        thread.ticket.tenantId,
        {},
        { page: 1, pageSize: RELATED_TICKETS_LIMIT + 1 },
      ),
      listTicketOrders(database, thread.ticket.id),
    ]);
    return {
      ...thread,
      orders,
      relatedTickets: history.items
        .filter((item) => item.id !== thread.ticket.id)
        .slice(0, RELATED_TICKETS_LIMIT),
      relatedTotal: Math.max(0, history.total - 1),
    };
  });

export const staffMarkTicketRead = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("support.answer")])
  .validator(readInput)
  .handler(async ({ context, data }) => {
    await markTicketRead(database, {
      ticketId: data.ticketId,
      userId: context.userId,
      tenantId: null,
      lastMessageId: data.lastMessageId,
    });
    return { ok: true };
  });

/** The team members a ticket can be handed to. */
export const listSupportTeam = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("support.answer")])
  .handler(async () => listSupportStaff(database));

export const staffSetTicketStatus = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("support.triage")])
  .validator(z.object({ ticketId: z.uuid(), status: ticketStatusSchema }))
  .handler(async ({ context, data }) => {
    await setTicketStatus(database, {
      ticketId: data.ticketId,
      status: data.status,
      actorId: context.userId,
    });
    logger.info("support.status_changed", {
      ticketId: data.ticketId,
      status: data.status,
      staffId: context.userId,
    });
    return { ok: true };
  });

/**
 * Anyone on the team can take a ticket or give back their own; handing it to someone else,
 * or taking it from a colleague, needs `support.assign_others` (supervisors and admins).
 */
export const staffAssignTicket = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("support.triage")])
  .validator(assignTicketSchema)
  .handler(async ({ context, data }) => {
    await assignTicket(database, {
      ticketId: data.ticketId,
      assigneeId: data.assigneeId,
      actorId: context.userId,
      mayAssignOthers: hasStaffPermission(context.role, "support.assign_others"),
    });
    logger.info("support.assigned", {
      ticketId: data.ticketId,
      assigneeId: data.assigneeId,
      staffId: context.userId,
    });
    return { ok: true };
  });

export const staffSetTicketPriority = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("support.triage")])
  .validator(setTicketPrioritySchema)
  .handler(async ({ context, data }) => {
    await setTicketPriority(database, { ...data, actorId: context.userId });
    return { ok: true };
  });

export const staffSetTicketCategory = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("support.triage")])
  .validator(setTicketCategorySchema)
  .handler(async ({ context, data }) => {
    await setTicketCategory(database, { ...data, actorId: context.userId });
    return { ok: true };
  });

export const staffSupportMetrics = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("support.metrics")])
  .validator(supportMetricsSearchSchema)
  .handler(async ({ data }) => {
    const now = new Date();
    const since = new Date(now.getTime() - data.days * DAY_MILLISECONDS);
    return getSupportMetrics(database, { since, now });
  });
