import type { HealthMetricKey } from "./supplier-panel-health-metrics.ts";

/**
 * Where the supplier panel sends the supplier to fix something: an order list, a product's
 * stock or review, or a health metric. The web layer turns each target into a panel link.
 */

/** The order lists a link can open, by what waits on the parcel. */
export type SupplierOrderFilter =
  "accept_overdue" | "dispatch_overdue" | "accept_soon" | "dispatch_soon" | "delivery_failed";

export type SupplierAttentionTarget =
  | { area: "orders"; filter: SupplierOrderFilter; shipmentId?: string }
  | { area: "stock"; filter: "out_of_stock_listed"; productId?: string }
  | { area: "catalog"; filter: "rejected"; productId?: string; field?: string }
  | { area: "performance"; metric: HealthMetricKey };
