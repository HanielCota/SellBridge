import { z } from "zod";
import { stateSchema } from "../domain/cep.ts";
import { freeText, pageNumberSchema, searchQuery } from "./common.ts";
import { withFallback, optionalParameter } from "./fallback.ts";
import { LISTING_MAX_PRICE_CENTS, listingStoreIdsSchema } from "./stores.ts";

export const PRODUCT_SORTS = [
  "title",
  "cost_asc",
  "cost_desc",
  "margin_desc",
  "stock_desc",
  "newest",
] as const;
export const productSortSchema = z.enum(PRODUCT_SORTS);
export type ProductSort = z.infer<typeof productSortSchema>;

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  title: "Nome (A–Z)",
  cost_asc: "Menor custo",
  cost_desc: "Maior custo",
  margin_desc: "Maior margem",
  stock_desc: "Maior estoque",
  newest: "Mais recentes",
};

/** Search params of the supplier catalog page; money filters are in cents. */
export const catalogSearchSchema = z.object({
  query: optionalParameter(searchQuery()),
  category: optionalParameter(freeText().trim().max(100)),
  minCost: optionalParameter(z.coerce.number().int().min(0).max(LISTING_MAX_PRICE_CENTS)),
  maxCost: optionalParameter(z.coerce.number().int().min(0).max(LISTING_MAX_PRICE_CENTS)),
  inStock: optionalParameter(z.coerce.boolean()),
  sort: withFallback(productSortSchema.default("title"), "title"),
  page: withFallback(pageNumberSchema.default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(6).max(48).default(12), 12),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

export const SUPPLIER_SORTS = ["name", "reputation"] as const;
export const supplierSortSchema = z.enum(SUPPLIER_SORTS);
export type SupplierSort = z.infer<typeof supplierSortSchema>;

export const SUPPLIER_SORT_LABELS: Record<SupplierSort, string> = {
  name: "Nome (A–Z)",
  reputation: "Melhor avaliados",
};

export const supplierListSearchSchema = z.object({
  /** A niche or a product the reseller wants to sell. */
  query: optionalParameter(searchQuery()),
  niche: optionalParameter(freeText().trim().max(100)),
  /** Where the supplier is: suppliers sell anywhere, so this only narrows the choice. */
  state: optionalParameter(stateSchema),
  city: optionalParameter(freeText().trim().max(80)),
  sort: withFallback(supplierSortSchema.default("name"), "name"),
});

export type SupplierListSearch = z.infer<typeof supplierListSearchSchema>;

/** Search params of the catalog with every product the tenant can sell, from every supplier. */
export const sellableCatalogSearchSchema = z.object({
  query: optionalParameter(searchQuery()),
  category: optionalParameter(freeText().trim().max(100)),
  supplier: optionalParameter(z.uuid()),
  inStock: optionalParameter(z.coerce.boolean()),
  /** Leaves out products the tenant already listed, so only new ones remain to publish. */
  unpublished: optionalParameter(z.coerce.boolean()),
  sort: withFallback(productSortSchema.default("title"), "title"),
  page: withFallback(pageNumberSchema.default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(6).max(48).default(24), 24),
});

export type SellableCatalogSearch = z.infer<typeof sellableCatalogSearchSchema>;

export const MIN_MARKUP_PERCENT = 5;
export const MAX_MARKUP_PERCENT = 300;

/** How bulk publishing sets each product's price. */
export const priceRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("suggested") }),
  z.object({
    kind: z.literal("markup"),
    percent: z.number().int().min(MIN_MARKUP_PERCENT).max(MAX_MARKUP_PERCENT),
  }),
]);

export type PriceRule = z.infer<typeof priceRuleSchema>;

export const MAX_BULK_PUBLISH = 50;

export const bulkPublishSchema = z.object({
  productIds: z.array(z.uuid()).min(1).max(MAX_BULK_PUBLISH),
  storeConnectionIds: listingStoreIdsSchema,
  priceRule: priceRuleSchema,
  /** Per-product rules that replace `priceRule` for the products they name. */
  priceOverrides: z
    .record(z.uuid(), priceRuleSchema)
    .refine(
      (overrides) => Object.keys(overrides).length <= MAX_BULK_PUBLISH,
      `Ajuste o preço de no máximo ${MAX_BULK_PUBLISH} produtos`,
    )
    .optional(),
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
  // Integers only: cost × (1 + percent/100) in float lands a hair above an exact ,90 price
  // (200 × 2.45 = 490.00000000000006) and the ceiling then adds a whole real.
  const markedUpTimesHundred = product.costCents * (100 + rule.percent);
  const endingInNinety = Math.ceil((markedUpTimesHundred + 1_000) / 10_000) * 100 - 10;
  return Math.max(endingInNinety, product.costCents + 100);
}
