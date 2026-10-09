import { z } from "zod";
import { withFallback, optionalParameter } from "./fallback.ts";
import { orderStatusSchema } from "./orders.ts";
import { periodSearchSchema } from "./period.ts";

export const FINANCIAL_SORTS = ["orderedAt", "revenue", "profit", "status"] as const;
export const financialSortSchema = z.enum(FINANCIAL_SORTS);
export type FinancialSortKey = z.infer<typeof financialSortSchema>;

export const financialSearchSchema = periodSearchSchema.extend({
  status: optionalParameter(orderStatusSchema),
  query: optionalParameter(z.string().trim().max(100)),
  sort: withFallback(financialSortSchema.default("orderedAt"), "orderedAt"),
  direction: withFallback(z.enum(["asc", "desc"]).default("desc"), "desc"),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(10).max(100).default(20), 20),
});
export type FinancialSearch = z.infer<typeof financialSearchSchema>;
