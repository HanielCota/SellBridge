import type { FulfillmentStatus } from "../schemas/fulfillment.ts";
import type { OrderStatus } from "../schemas/orders.ts";

/**
 * The supplier home's sales (item 38): which orders count, how parcels group into the steps the
 * supplier sees, and how long each product's stock lasts at the period's pace. The SQL lives in
 * `supplier-panel-sales.ts` of the database package and reads these lists.
 */

/** The "Situação" filter of the home; `sold` is the default and leaves cancellations out. */
export const SUPPLIER_SALES_SITUATIONS = ["sold", "open", "delivered", "lost"] as const;
export type SupplierSalesSituation = (typeof SUPPLIER_SALES_SITUATIONS)[number];

export const SUPPLIER_SALES_SITUATION_LABELS: Record<SupplierSalesSituation, string> = {
  sold: "Todos, sem cancelados",
  open: "Em andamento",
  delivered: "Entregues",
  lost: "Cancelados e devolvidos",
};

/** Unpaid orders ("pending") are never sales, as in every report of the reseller. */
export const SUPPLIER_SALES_SITUATION_STATUSES: Record<
  SupplierSalesSituation,
  readonly OrderStatus[]
> = {
  sold: ["paid", "shipped", "delivered"],
  open: ["paid", "shipped"],
  delivered: ["delivered"],
  lost: ["cancelled", "returned"],
};

/**
 * The steps of "Seus pedidos", in the order a parcel goes through them. The first three count
 * what is open now; the last two, what settled among the period's orders.
 */
export const SUPPLIER_PARCEL_STAGES = [
  "accept",
  "preparing",
  "shipped",
  "delivered",
  "returned",
] as const;
export type SupplierParcelStage = (typeof SUPPLIER_PARCEL_STAGES)[number];

export const SUPPLIER_PARCEL_STAGE_LABELS: Record<SupplierParcelStage, string> = {
  accept: "Esperando aceite",
  preparing: "Separando",
  shipped: "Enviados",
  delivered: "Entregues no período",
  returned: "Devolvidos no período",
};

/** Cancelled parcels belong to no step: the order never left the supplier. */
const STAGE_STATUSES: Record<SupplierParcelStage, readonly FulfillmentStatus[]> = {
  accept: ["forwarded"],
  preparing: ["accepted", "picking", "ready"],
  shipped: ["shipped"],
  delivered: ["delivered"],
  returned: ["returned", "not_delivered"],
};

export type SupplierParcelStageCounts = Record<SupplierParcelStage, number>;

/** Folds the parcels counted per status into the five steps; unknown statuses are skipped. */
export function countParcelStages(
  rows: readonly { status: string; parcels: number }[],
): SupplierParcelStageCounts {
  const counts = (stage: SupplierParcelStage) =>
    rows
      .filter((row) => STAGE_STATUSES[stage].some((status) => status === row.status))
      .reduce((sum, row) => sum + row.parcels, 0);
  return {
    accept: counts("accept"),
    preparing: counts("preparing"),
    shipped: counts("shipped"),
    delivered: counts("delivered"),
    returned: counts("returned"),
  };
}

/** A product whose stock lasts this many days or fewer is "acabando" on the home. */
export const STOCK_RUNNING_OUT_DAYS = 14;

/**
 * Days the sellable stock lasts if the product keeps selling as in the period. Null when it did
 * not sell (no pace to project); 0 when nothing is left; at least 1 while a unit remains.
 */
export function stockDaysLeft(input: {
  availableStock: number;
  unitsSold: number;
  periodDays: number;
}): number | null {
  if (input.unitsSold <= 0 || input.periodDays <= 0) {
    return null;
  }
  if (input.availableStock <= 0) {
    return 0;
  }
  const unitsPerDay = input.unitsSold / input.periodDays;
  return Math.max(1, Math.floor(input.availableStock / unitsPerDay));
}

/**
 * True for a product that sold in the period, still has stock, and runs out within
 * `STOCK_RUNNING_OUT_DAYS`. Sold out is its own warning on the home, never counted twice.
 */
export function isRunningOut(daysLeft: number | null): boolean {
  return daysLeft !== null && daysLeft > 0 && daysLeft <= STOCK_RUNNING_OUT_DAYS;
}
