import {
  getOrderPage,
  getReviewTarget,
  listReviewableOrders,
  listSupplierCredits,
  saveSupplierReview,
} from "@sellbridge/database/repositories";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { orderReviewSearchSchema, supplierReviewInputSchema } from "@sellbridge/shared/schemas";
import { canReviewOrder, REVIEW_WINDOW_DAYS } from "@sellbridge/shared/supplier-score";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tenantMiddleware } from "@/lib/server/middleware";
import { marketplaceOrderUrl } from "./marketplace-order-url";
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

/** Everything the order page shows, for one order of the tenant (not found for any other). */
export const getOrderPageFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ orderId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const page = await getOrderPage(database, context.tenantId, data.orderId, {
      platformFeeBasisPoints: environment.PLATFORM_FEE_BASIS_POINTS,
      now: new Date(),
    });
    const supplierCredits =
      page.order.status === "returned"
        ? await listSupplierCredits(database, context.tenantId, [page.order.id])
        : [];
    return {
      ...page,
      supplierCredits,
      marketplaceUrl: marketplaceOrderUrl(page.order.marketplace, page.order.externalOrderId),
    };
  });
