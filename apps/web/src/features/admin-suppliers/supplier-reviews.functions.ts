import { listSupplierReviewsForModeration } from "@sellbridge/database/repositories";
import { pageNumberSchema } from "@sellbridge/shared/schemas";
import { logger } from "@sellbridge/shared/logger";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";

/** Short pages: each review is a few lines of text to read, not a row to scan. */
export const MODERATED_REVIEWS_PAGE_SIZE = 10;

export const moderatedReviewsInputSchema = z.object({
  supplierId: z.uuid(),
  page: pageNumberSchema.default(1),
});

/**
 * Every review of a supplier with its comment, order and store. Comments are read only by
 * moderation: the permission is checked here, on the server, so an agent calling the function
 * directly is refused (403) like one opening the screen.
 */
export const adminListSupplierReviews = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("reviews.moderate")])
  .validator(moderatedReviewsInputSchema)
  .handler(async ({ context, data }) => {
    logger.info("supplier_reviews.moderation_read", {
      userId: context.userId,
      supplierId: data.supplierId,
      page: data.page,
    });
    return await listSupplierReviewsForModeration(database, data.supplierId, {
      page: data.page,
      pageSize: MODERATED_REVIEWS_PAGE_SIZE,
    });
  });

export const adminSupplierReviewsQueryOptions = (supplierId: string, page: number) =>
  queryOptions({
    queryKey: ["admin-suppliers", "reviews", supplierId, page],
    queryFn: () => adminListSupplierReviews({ data: { supplierId, page } }),
    placeholderData: keepPreviousData,
  });
