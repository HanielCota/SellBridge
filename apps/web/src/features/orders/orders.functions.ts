import {
  getReviewTarget,
  listReviewableOrders,
  saveSupplierReview,
} from "@sellbridge/database/repositories";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { orderReviewSearchSchema, supplierReviewInputSchema } from "@sellbridge/shared/schemas";
import { canReviewOrder, REVIEW_WINDOW_DAYS } from "@sellbridge/shared/supplier-score";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { reviewableSince } from "./review-window";

/** Orders of the tenant split by supplier, with their review and whether it can still change. */
export const listOrderReviews = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(orderReviewSearchSchema)
  .handler(async ({ context, data }) => {
    const now = new Date();
    const page = await listReviewableOrders(database, context.tenantId, {
      filters: { filter: data.review, search: data.query, reviewableSince: reviewableSince(now) },
      pagination: { page: data.page, pageSize: data.pageSize },
    });
    return {
      ...page,
      items: page.items.map((row) => ({ ...row, canReview: canReviewOrder(row, now) })),
    };
  });

export const saveSupplierReviewFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(supplierReviewInputSchema)
  .handler(async ({ context, data }) => {
    const target = await getReviewTarget(database, context.tenantId, data);
    if (!target) {
      throw notFoundError("Pedido não encontrado");
    }
    if (!canReviewOrder(target)) {
      throw conflictError(
        `Só dá para avaliar pedidos entregues nos últimos ${REVIEW_WINDOW_DAYS} dias`,
      );
    }
    await saveSupplierReview(database, context.tenantId, data);
    return { ok: true };
  });
