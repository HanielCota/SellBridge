import { z } from "zod";

/**
 * Shapes of the TikTok Shop responses the connector reads, field by field from the official API
 * reference (docs/marketplaces/tiktok-shop.md). Only the fields used are declared; zod drops the
 * rest. Ids are strings in every documented sample.
 */

const id = z.string().min(1).max(64);

/** Every response: `code` 0 means success; `data` holds the payload. */
export const envelopeSchema = z.object({
  code: z.number().int(),
  message: z.string().max(2000).optional(),
  request_id: z.string().max(100).optional(),
  data: z.unknown().optional(),
});

export type TikTokShopEnvelope = z.infer<typeof envelopeSchema>;

export const tokenSchema = z.object({
  access_token: z.string().min(1),
  /** Expiration as a Unix timestamp in seconds, not a duration. */
  access_token_expire_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  refresh_token_expire_in: z.number().int().optional(),
  open_id: z.string().optional(),
  seller_name: z.string().max(200).optional(),
  seller_base_region: z.string().max(10).optional(),
  user_type: z.number().int().optional(),
});

export const authorizedShopsSchema = z.object({
  shops: z
    .array(
      z.object({
        id,
        name: z.string().max(200),
        region: z.string().max(10),
        seller_type: z.string().max(40).optional(),
        cipher: z.string().min(1).max(200),
        code: z.string().max(60).optional(),
      }),
    )
    .max(200),
});

export type AuthorizedShop = z.infer<typeof authorizedShopsSchema>["shops"][number];

export const uploadedImageSchema = z.object({ uri: z.string().min(1).max(500) });

export const recommendedCategorySchema = z.object({
  leaf_category_id: id.optional(),
});

export const warehousesSchema = z.object({
  warehouses: z
    .array(
      z.object({
        id,
        effect_status: z.string().max(40).optional(),
        type: z.string().max(40).optional(),
        is_default: z.boolean().optional(),
      }),
    )
    .max(500),
});

export const createdProductSchema = z.object({
  product_id: id,
  skus: z.array(z.object({ id })).max(300).optional(),
  warnings: z
    .array(z.object({ message: z.string().max(2000) }))
    .max(100)
    .optional(),
});

export const productSchema = z.object({
  id,
  status: z.string().max(40).optional(),
  skus: z
    .array(
      z.object({
        id,
        seller_sku: z.string().max(200).optional(),
        inventory: z
          .array(z.object({ warehouse_id: id, quantity: z.number().int().optional() }))
          .max(100)
          .optional(),
      }),
    )
    .min(1)
    .max(300),
});

export type TikTokShopProduct = z.infer<typeof productSchema>;
