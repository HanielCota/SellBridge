import {
  countPendingReviews,
  listAllTickets,
  listListingTargets,
  listTenantTickets,
} from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { adminMiddleware, tenantMiddleware } from "@/lib/server/middleware";
import { reviewableSince } from "@/features/orders/review-window";

const COUNT_ONLY = { page: 1, pageSize: 1 } as const;

/** What needs the reseller's attention: failed publications, support replies and reviews. */
export const getAttentionCounts = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    const [failedListings, answeredTickets, pendingReviews] = await Promise.all([
      listListingTargets(database, context.tenantId, { status: "error" }, COUNT_ONLY),
      listTenantTickets(database, context.tenantId, { status: "answered" }, COUNT_ONLY),
      countPendingReviews(database, context.tenantId, reviewableSince(new Date())),
    ]);
    return {
      failedListings: failedListings.total,
      answeredTickets: answeredTickets.total,
      pendingReviews: pendingReviews.total,
    };
  });

/** Open tickets waiting for the support team. */
export const getOpenTicketCount = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
    const openTickets = await listAllTickets(database, { status: "open" }, COUNT_ONLY);
    return openTickets.total;
  });
