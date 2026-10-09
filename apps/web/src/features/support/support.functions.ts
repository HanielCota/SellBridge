import {
  getTicketThread,
  listAllTickets,
  listTenantTickets,
  setTicketStatus,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { ticketStatusSchema, ticketsSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { adminMiddleware, tenantMiddleware } from "@/lib/server/middleware";

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(ticketsSearchSchema)
  .handler(async ({ context, data }) =>
    listTenantTickets(
      database,
      context.tenantId,
      { status: data.status, search: data.query },
      { page: data.page, pageSize: data.pageSize },
    ),
  );

export const getMyTicket = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ ticketId: z.uuid() }))
  .handler(async ({ context, data }) => getTicketThread(database, data.ticketId, context.tenantId));

export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(ticketsSearchSchema)
  .handler(async ({ data }) =>
    listAllTickets(
      database,
      { status: data.status, search: data.query },
      { page: data.page, pageSize: data.pageSize },
    ),
  );

export const adminGetTicket = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(z.object({ ticketId: z.uuid() }))
  .handler(async ({ data }) => getTicketThread(database, data.ticketId, null));

export const adminSetTicketStatus = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ ticketId: z.uuid(), status: ticketStatusSchema }))
  .handler(async ({ context, data }) => {
    await setTicketStatus(database, data.ticketId, data.status);
    logger.info("support.status_changed", {
      ticketId: data.ticketId,
      status: data.status,
      adminId: context.userId,
    });
    return { ok: true };
  });
