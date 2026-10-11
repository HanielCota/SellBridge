import { z } from "zod";
import { withFallback, optionalParameter } from "./fallback.ts";
import type { OrderStatus } from "./orders.ts";
import { periodSearchSchema } from "./period.ts";

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

export const financialSearchSchema = periodSearchSchema.extend({
  stage: optionalParameter(orderStageSchema),
  query: optionalParameter(z.string().trim().max(100)),
  sort: withFallback(financialSortSchema.default("orderedAt"), "orderedAt"),
  direction: withFallback(z.enum(["asc", "desc"]).default("desc"), "desc"),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(10).max(100).default(20), 20),
});
export type FinancialSearch = z.infer<typeof financialSearchSchema>;
