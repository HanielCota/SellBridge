import {
  countProductsAwaitingReview,
  getProductForReview,
  listProductsAwaitingReview,
} from "@sellbridge/database/repositories";
import {
  reviewProductInputSchema,
  reviewQueueSearchSchema,
} from "@sellbridge/shared/supplier-product-review";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { adminMiddleware } from "@/lib/server/middleware";

/**
 * The platform's review of supplier products. Admin-only, like the approve and reject functions
 * in `features/supplier-panel/catalog`, which this queue calls for the decision itself.
 */
export const adminListReviewQueue = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(reviewQueueSearchSchema)
  .handler(async ({ data }) => await listProductsAwaitingReview(database, data));

export const adminGetReviewProduct = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(reviewProductInputSchema)
  .handler(async ({ data }) => await getProductForReview(database, data.productId));

/** Products waiting for review: the badge on the admin's Fornecedores tab. */
export const adminCountReviewQueue = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => await countProductsAwaitingReview(database));
