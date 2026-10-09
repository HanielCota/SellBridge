import { z } from "zod";
import { withFallback, optionalParameter } from "./fallback.ts";

export const PRODUCT_SORTS = ["title", "cost_asc", "cost_desc", "stock_desc", "newest"] as const;
export const productSortSchema = z.enum(PRODUCT_SORTS);
export type ProductSort = z.infer<typeof productSortSchema>;

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  title: "Nome (A–Z)",
  cost_asc: "Menor custo",
  cost_desc: "Maior custo",
  stock_desc: "Maior estoque",
  newest: "Mais recentes",
};

/** Search params of the supplier catalog page; money filters are in cents. */
export const catalogSearchSchema = z.object({
  query: optionalParameter(z.string().trim().max(100)),
  category: optionalParameter(z.string().trim().max(100)),
  minCost: optionalParameter(z.coerce.number().int().min(0)),
  maxCost: optionalParameter(z.coerce.number().int().min(0)),
  inStock: optionalParameter(z.coerce.boolean()),
  sort: withFallback(productSortSchema.default("title"), "title"),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(6).max(48).default(12), 12),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

export const supplierListSearchSchema = z.object({
  query: optionalParameter(z.string().trim().max(100)),
  niche: optionalParameter(z.string().trim().max(100)),
});

export type SupplierListSearch = z.infer<typeof supplierListSearchSchema>;
