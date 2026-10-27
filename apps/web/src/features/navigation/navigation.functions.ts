import {
  countParcelAlerts,
  countPendingReviews,
  countFailedListingTargets,
  countSupplierShipmentsByTab,
  countUnreadSupportReplies,
  findSupplierOfProfile,
} from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { accountMiddleware } from "@/lib/server/middleware";
import { reviewableSince } from "@/features/orders/review-window";

/** Parcels waiting for the supplier's accept; none while the profile has no brand yet. */
async function countOrdersToAccept(tenantId: string): Promise<number> {
  const supplier = await findSupplierOfProfile(database, tenantId);
  if (supplier === null) {
    return 0;
  }
  const counts = await countSupplierShipmentsByTab(database, {
    supplierId: supplier.id,
    query: "",
  });
  return counts.forwarded;
}

/**
 * What needs attention in the header: unread support replies and parcels late or with a delivery
 * problem for any profile, and for a seller also failed publications and reviews to answer.
 */
export const getAttentionCounts = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    if (context.profileKind === "supplier") {
      const [unreadSupportReplies, ordersToAccept, parcelAlerts] = await Promise.all([
        countUnreadSupportReplies(database, context.tenantId, context.userId),
        countOrdersToAccept(context.tenantId),
        countParcelAlerts(database, { supplierOrganizationId: context.tenantId }),
      ]);
      return { failedListings: 0, unreadSupportReplies, pendingReviews: 0, ordersToAccept, parcelAlerts };
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
      ordersToAccept: 0,
      parcelAlerts,
    };
  });
