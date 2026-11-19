import { z } from "zod";

/**
 * Shapes of the Shopee Open Platform v2 responses the connector reads, field by field from the
 * official reference (docs/marketplaces/shopee.md). Only the fields used are declared; zod drops
 * the rest.
 */

/**
 * Every response carries `request_id`, `error` (empty on success) and `message`; most put the
 * payload in `response`, while the token and shop-info calls answer at the top level.
 */
export const envelopeSchema = z.object({
  request_id: z.string().max(100).optional(),
  error: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
});

export type ShopeeEnvelope = z.infer<typeof envelopeSchema>;

/** GetAccessToken and RefreshAccessToken ("Authorization and Authentication"). */
export const tokenSchema = z.object({
  access_token: z.string().min(1).max(500),
  refresh_token: z.string().min(1).max(500),
  /** Validity of the access token in seconds (4 hours). */
  expire_in: z.number().int().positive(),
  /** Returned by RefreshAccessToken: the shop the pair belongs to. */
  shop_id: z.number().int().nonnegative().optional(),
});

/** v2.shop.get_shop_info. */
export const shopInfoSchema = z.object({
  shop_name: z.string().max(200),
  region: z.string().max(10),
  /** NORMAL, BANNED or FROZEN. */
  status: z.string().max(40),
});
