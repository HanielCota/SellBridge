import {
  countPendingReviews,
  countUnreadSupportReplies,
  listListingTargets,
} from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { accountMiddleware } from "@/lib/server/middleware";
import { reviewableSince } from "@/features/orders/review-window";

const COUNT_ONLY = { page: 1, pageSize: 1 } as const;

/**
 * What needs attention in the header: unread support replies for any profile, and for a seller
 * also failed publications and reviews to answer.
 */
export const getAttentionCounts = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    if (context.profileKind === "supplier") {
      const unreadSupportReplies = await countUnreadSupportReplies(
        database,
        context.tenantId,
        context.userId,
      );
      return { failedListings: 0, unreadSupportReplies, pendingReviews: 0 };
    }
    const [failedListings, unreadSupportReplies, pendingReviews] = await Promise.all([
      listListingTargets(database, context.tenantId, { status: "error" }, COUNT_ONLY),
      countUnreadSupportReplies(database, context.tenantId, context.userId),
      countPendingReviews(database, context.tenantId, reviewableSince(new Date())),
    ]);
    return {
      failedListings: failedListings.total,
      unreadSupportReplies,
      pendingReviews: pendingReviews.total,
    };
  });
