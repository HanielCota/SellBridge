import { z } from "zod";
import { freeText, pageNumberSchema, searchQuery } from "../schemas/common.ts";
import { optionalParameter, withFallback } from "../schemas/fallback.ts";
import { keepsNegativeShelfOnly, openedShelfCountSchema } from "../schemas/admin-suppliers.ts";
import { catalogDraftValuesSchema } from "./supplier-panel-catalog-schemas.ts";

export const SELLER_PRODUCT_STATUSES = ["all", "draft", "ready", "archived", "blocked"] as const;
export type SellerProductStatus = (typeof SELLER_PRODUCT_STATUSES)[number];

export const sellerProductListSearchSchema = z.object({
  status: withFallback(z.enum(SELLER_PRODUCT_STATUSES).default("all"), "all"),
  query: optionalParameter(searchQuery()),
  page: withFallback(pageNumberSchema.default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(10).max(100).default(25), 25),
});
export type SellerProductListSearch = z.infer<typeof sellerProductListSearchSchema>;

export const sellerProductRefSchema = z.object({ productId: z.uuid() });

/** Ownership is supplied by the authenticated session, never by this request body. */
export const sellerSaveProductSchema = sellerProductRefSchema
  .extend({
    values: catalogDraftValuesSchema,
    expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
    expectedStock: openedShelfCountSchema.optional(),
  })
  .refine((input) => keepsNegativeShelfOnly(input.values.stock, input.expectedStock), {
    path: ["values", "stock"],
    error: "O estoque negativo só pode manter uma falta de estoque já registrada.",
  });
export type SellerSaveProductInput = z.infer<typeof sellerSaveProductSchema>;

export const sellerDuplicateProductSchema = sellerProductRefSchema.extend({
  newProductId: z.uuid(),
  newSku: catalogDraftValuesSchema.shape.sku,
});

export const adminSellerProductScopeSchema = z.object({ tenantId: z.string().min(1).max(200) });
export const adminProductReasonSchema = freeText()
  .trim()
  .min(5, "Explique a alteração com pelo menos 5 caracteres.")
  .max(500);
export const adminSaveSellerProductSchema = sellerSaveProductSchema.safeExtend({
  ...adminSellerProductScopeSchema.shape,
  reason: adminProductReasonSchema,
});
