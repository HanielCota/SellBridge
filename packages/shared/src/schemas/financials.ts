import { z } from "zod";
import { pageNumberSchema, searchQuery } from "./common.ts";
import { withFallback, optionalParameter } from "./fallback.ts";
import { orderStatusSchema, type OrderStatus } from "./orders.ts";
import { isoDateSchema, periodSearchSchema } from "./period.ts";

export const FINANCIAL_SORTS = ["orderedAt", "revenue", "profit", "status"] as const;
export const financialSortSchema = z.enum(FINANCIAL_SORTS);
export type FinancialSortKey = z.infer<typeof financialSortSchema>;

/** The order journey in four steps, so the filter reads as stages instead of six statuses. */
export const ORDER_STAGES = ["open", "shipping", "done", "issue"] as const;
export const orderStageSchema = z.enum(ORDER_STAGES);
export type OrderStage = z.infer<typeof orderStageSchema>;

export const ORDER_STAGE_STATUSES: Record<OrderStage, readonly OrderStatus[]> = {
  open: ["pending", "paid"],
  shipping: ["shipped"],
  done: ["delivered"],
  issue: ["cancelled", "returned"],
};

/** The stage an order status belongs to: `ORDER_STAGE_STATUSES` read the other way. */
export function stageOfStatus(status: OrderStatus): OrderStage | undefined {
  return ORDER_STAGES.find((stage) => ORDER_STAGE_STATUSES[stage].includes(status));
}

export const financialSearchSchema = periodSearchSchema
  .extend({
    stage: optionalParameter(orderStageSchema),
    /** One calendar day of the period, picked on the profit chart; ignored when outside it. */
    day: optionalParameter(isoDateSchema),
    /**
     * The filter used to be `?status=paid`. Old links and bookmarks still filter: the status
     * becomes its stage instead of being dropped, which would show (and export) every order.
     */
    status: optionalParameter(orderStatusSchema),
    query: optionalParameter(searchQuery()),
    sort: withFallback(financialSortSchema.default("orderedAt"), "orderedAt"),
    direction: withFallback(z.enum(["asc", "desc"]).default("desc"), "desc"),
    page: withFallback(pageNumberSchema.default(1), 1),
    pageSize: withFallback(z.coerce.number().int().min(10).max(100).default(20), 20),
  })
  .transform(({ status, ...search }) => ({
    ...search,
    stage: search.stage ?? (status === undefined ? undefined : stageOfStatus(status)),
  }));
export type FinancialSearch = z.infer<typeof financialSearchSchema>;
