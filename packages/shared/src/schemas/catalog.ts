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

/** Search params of the region-wide catalog (every supplier that delivers to the tenant). */
export const regionCatalogSearchSchema = z.object({
  query: optionalParameter(z.string().trim().max(100)),
  category: optionalParameter(z.string().trim().max(100)),
  supplier: optionalParameter(z.uuid()),
  inStock: optionalParameter(z.coerce.boolean()),
  sort: withFallback(productSortSchema.default("title"), "title"),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(6).max(48).default(24), 24),
});

export type RegionCatalogSearch = z.infer<typeof regionCatalogSearchSchema>;

/** How bulk publishing sets each product's price. */
export const priceRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("suggested") }),
  z.object({ kind: z.literal("markup"), percent: z.number().int().min(5).max(300) }),
]);

export type PriceRule = z.infer<typeof priceRuleSchema>;

export const MAX_BULK_PUBLISH = 50;

export const bulkPublishSchema = z.object({
  productIds: z.array(z.uuid()).min(1).max(MAX_BULK_PUBLISH),
  storeConnectionIds: z.array(z.uuid()).min(1, "Escolha ao menos uma loja"),
  priceRule: priceRuleSchema,
});

export type BulkPublishInput = z.infer<typeof bulkPublishSchema>;

/**
 * Price for a product under a rule. Markup prices end in ,90 (R$ 47,90), the usual retail
 * look, and never fall to or below the cost.
 */
export function priceForRule(
  product: { costCents: number; suggestedPriceCents: number },
  rule: PriceRule,
): number {
  if (rule.kind === "suggested") {
    return Math.max(product.suggestedPriceCents, product.costCents + 100);
  }
  const raw = product.costCents * (1 + rule.percent / 100);
  const endingInNinety = Math.ceil((raw + 10) / 100) * 100 - 10;
  return Math.max(endingInNinety, product.costCents + 100);
}
