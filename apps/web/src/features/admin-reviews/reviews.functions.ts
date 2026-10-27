import { listReviewsForModeration } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";
import {
  MODERATED_REVIEWS_PAGE_SIZE,
  moderatedReviewsInputSchema,
  type ModeratedReviewsInput,
} from "./moderation-search";

/**
 * Reviews with their comment, supplier, order and store, newest first. Comments are read only
 * by moderation: the permission is checked here, on the server, so an agent or a reseller
 * calling the function directly is refused (403) like one opening the screen.
 */
export const adminListReviews = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("reviews.moderate")])
  .validator(moderatedReviewsInputSchema)
  .handler(async ({ context, data }) => {
    logger.info("supplier_reviews.moderation_read", {
      userId: context.userId,
      supplierId: data.supplierId ?? "all",
      withCommentOnly: data.withCommentOnly,
      page: data.page,
    });
    return await listReviewsForModeration(
      database,
      { supplierId: data.supplierId, withCommentOnly: data.withCommentOnly },
      { page: data.page, pageSize: MODERATED_REVIEWS_PAGE_SIZE },
    );
  });

export const moderatedReviewsQueryOptions = (input: ModeratedReviewsInput) =>
  queryOptions({
    queryKey: ["admin-reviews", input],
    queryFn: () => adminListReviews({ data: input }),
    placeholderData: keepPreviousData,
  });
