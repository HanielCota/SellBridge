import {
  getTicketThread,
  listAllTickets,
  listTenantTickets,
  setTicketStatus,
} from "@sellbridge/db/repositories";
import { logger } from "@sellbridge/shared/logger";
import { ticketStatusSchema, ticketsSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { adminMiddleware, tenantMiddleware } from "@/lib/server/middleware";

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(ticketsSearchSchema)
  .handler(async ({ context, data }) =>
    listTenantTickets(
      db,
      context.tenantId,
      { status: data.status, search: data.q },
      { page: data.page, pageSize: data.pageSize },
    ),
  );

export const getMyTicket = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(z.object({ ticketId: z.uuid() }))
  .handler(async ({ context, data }) => getTicketThread(db, data.ticketId, context.tenantId));

export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(ticketsSearchSchema)
  .handler(async ({ data }) =>
    listAllTickets(
      db,
      { status: data.status, search: data.q },
      { page: data.page, pageSize: data.pageSize },
    ),
  );

export const adminGetTicket = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(z.object({ ticketId: z.uuid() }))
  .handler(async ({ data }) => getTicketThread(db, data.ticketId, null));

export const adminSetTicketStatus = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.object({ ticketId: z.uuid(), status: ticketStatusSchema }))
  .handler(async ({ context, data }) => {
    await setTicketStatus(db, data.ticketId, data.status);
    logger.info("support.status_changed", {
      ticketId: data.ticketId,
      status: data.status,
      adminId: context.userId,
    });
    return { ok: true };
  });
