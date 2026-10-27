import {
  countParcelAlerts,
  countPendingReviews,
  countFailedListingTargets,
  countUnreadSupportReplies,
} from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { accountMiddleware } from "@/lib/server/middleware";
import { reviewableSince } from "@/features/orders/review-window";

/**
 * What needs attention in the header: unread support replies and parcels late or with a delivery
 * problem for any profile, and for a seller also failed publications and reviews to answer.
 */
export const getAttentionCounts = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    if (context.profileKind === "supplier") {
      const [unreadSupportReplies, supplierOrders] = await Promise.all([
        countUnreadSupportReplies(database, context.tenantId, context.userId),
        countParcelAlerts(database, {
          supplierOrganizationId: context.tenantId,
          includeForwarded: true,
        }),
      ]);
      return {
        failedListings: 0,
        unreadSupportReplies,
        pendingReviews: 0,
        supplierOrders,
        parcelAlerts: 0,
      };
    }
    const [failedListings, unreadSupportReplies, pendingReviews, parcelAlerts] = await Promise.all([
      countFailedListingTargets(database, context.tenantId),
      countUnreadSupportReplies(database, context.tenantId, context.userId),
      countPendingReviews(database, context.tenantId, reviewableSince(new Date())),
      countParcelAlerts(database, { tenantId: context.tenantId }),
    ]);
    return {
      failedListings,
      unreadSupportReplies,
      pendingReviews: pendingReviews.total,
      supplierOrders: 0,
      parcelAlerts,
    };
  });
