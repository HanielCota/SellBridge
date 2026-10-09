import { z } from "zod";

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
  query: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().trim().max(100).optional().catch(undefined),
  minCost: z.coerce.number().int().min(0).optional().catch(undefined),
  maxCost: z.coerce.number().int().min(0).optional().catch(undefined),
  inStock: z.coerce.boolean().optional().catch(undefined),
  sort: productSortSchema.default("title").catch("title"),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z.coerce.number().int().min(6).max(48).default(12).catch(12),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

export const supplierListSearchSchema = z.object({
  query: z.string().trim().max(100).optional().catch(undefined),
  niche: z.string().trim().max(100).optional().catch(undefined),
});

export type SupplierListSearch = z.infer<typeof supplierListSearchSchema>;
