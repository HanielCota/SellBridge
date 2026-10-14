import { computeOrderFinance, type OrderFinance } from "@sellbridge/shared/finance";
import { canReviewOrder } from "@sellbridge/shared/supplier-score";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orderItems, supplierProducts, supplierReviews, suppliers } from "../schema/index.ts";
import { getOrderDetail, type OrderDetail } from "./order-detail.ts";
import { listOrderStatusChanges, type OrderStatusChange } from "./order-status-changes.ts";

/** The order's review of one of its suppliers. */
export interface OrderSupplierReview {
  supplierId: string;
  supplierName: string;
  /** Null until the reseller rates this supplier for the order. */
  rating: number | null;
  /** Delivered within the review window: it can be rated (or rated again) now. */
  reviewable: boolean;
}

export interface OrderPage {
  order: OrderDetail;
  finance: OrderFinance;
  history: OrderStatusChange[];
  reviews: OrderSupplierReview[];
}

/**
 * Each status the order went through, oldest first. An order stored before its changes were
 * recorded shows as one step: its status at its date.
 */
async function orderHistory(
  database: Database,
  tenantId: string,
  order: Pick<OrderDetail, "id" | "status" | "orderedAt">,
): Promise<OrderStatusChange[]> {
  const history = await listOrderStatusChanges(database, tenantId, order.id);
  return history.length > 0 ? history : [{ status: order.status, at: order.orderedAt }];
}

/** One row per supplier of the order's items, with the tenant's review of it if any. */
async function orderReviews(
  database: Database,
  tenantId: string,
  order: Pick<OrderDetail, "id" | "status" | "orderedAt" | "deliveredAt">,
  now: Date,
): Promise<OrderSupplierReview[]> {
  const rows = await database
    .selectDistinct({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      rating: supplierReviews.rating,
    })
    .from(orderItems)
    .innerJoin(supplierProducts, eq(supplierProducts.id, orderItems.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(
      supplierReviews,
      and(
        eq(supplierReviews.orderId, orderItems.orderId),
        eq(supplierReviews.supplierId, suppliers.id),
        eq(supplierReviews.tenantId, tenantId),
      ),
    )
    .where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, order.id)))
    .orderBy(asc(suppliers.name), asc(suppliers.id));
  // The reviews tab's own rule, so both say the same about the same order.
  const reviewable = canReviewOrder(order, now);
  return rows.map((row) => ({ ...row, reviewable }));
}

/**
 * Everything the order page shows, for one order of the tenant: the order and its items, its
 * money by the financial report's rule, its status history and its supplier reviews.
 * Another tenant's order is not found.
 */
export async function getOrderPage(
  database: Database,
  tenantId: string,
  orderId: string,
  options: { platformFeeBasisPoints: number; now: Date },
): Promise<OrderPage> {
  const order = await getOrderDetail(database, tenantId, orderId);
  const [history, reviews] = await Promise.all([
    orderHistory(database, tenantId, order),
    orderReviews(database, tenantId, order, options.now),
  ]);
  return {
    order,
    finance: computeOrderFinance(order, options.platformFeeBasisPoints),
    history,
    reviews,
  };
}
