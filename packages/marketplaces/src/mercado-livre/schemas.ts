import { z } from "zod";

/** Zod schemas for the Mercado Livre API responses and notifications used by the connector. */

/**
 * Optional text where Mercado Livre sends "" or spaces for "none": read as null, so a blank
 * tracking number can't overwrite the one the supplier typed and a blank nickname isn't a name.
 */
function blankAsNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export const presentTextSchema = z.string().nullable().optional().transform(blankAsNull);
export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.union([z.number(), z.string()]),
  refresh_token: z.string().min(1).optional(),
});

export const errorBodySchema = z
  .object({
    error: z.string().optional(),
    message: z.string().optional(),
    /** Validation details of a refused item; read by error-messages.ts, never trusted as is. */
    cause: z.unknown().optional(),
  })
  .passthrough();

export const domainDiscoverySchema = z.array(
  z.object({ category_id: z.string().min(1), category_name: z.string().optional() }),
);

const mercadoLivreLinkSchema = z
  .url({ protocol: /^https$/, hostname: /(^|\.)mercadoli(vre|bre)\.com(\.[a-z]{2})?$/ })
  .max(2048);

/**
 * Shown as a link on the listing card: only an https page of Mercado Livre itself. Anything
 * else (another host, data: or javascript:) becomes no link instead of failing the publication.
 */
function mercadoLivreLink(value: unknown): string | null {
  const parsed = mercadoLivreLinkSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const createdItemSchema = z.object({
  id: z.string().min(1),
  permalink: z.unknown().optional().transform(mercadoLivreLink),
});

/**
 * A money amount in reais as Mercado Livre sends it. Our money columns hold up to
 * R$ 21.474.836,47; anything negative or larger is refused here instead of failing (or
 * crediting the reseller) later.
 */
const reaisSchema = z.number().nonnegative().max(21_474_836.47);
/** Units in one order line; far above any retail sale, low enough that totals stay exact. */
const MAX_ORDER_LINE_QUANTITY = 100_000;

/**
 * Numeric ids from the marketplace: a safe integer, or the exact digits `parseMercadoLivreJson`
 * keeps for one past 2^53. A number that still arrives rounded is refused by `.int()` (safe
 * integers only), since a rounded id names another order.
 */
export const externalIdSchema = z.union([z.number().int(), z.string().regex(/^\d{1,20}$/)]);

/** The connected seller: its id becomes the store's `externalShopId`, so it must not be rounded. */
export const userSchema = z.object({ id: externalIdSchema, nickname: z.string() });

export const orderSchema = z.object({
  id: externalIdSchema,
  status: z.string(),
  // A malformed date would become "Invalid Date" and fail every retry of the webhook job.
  date_created: z.iso.datetime({ offset: true }),
  total_amount: reaisSchema,
  buyer: z
    .object({ nickname: z.string().max(255).nullable().optional().transform(blankAsNull) })
    .nullable()
    .optional(),
  tags: z.array(z.string()).optional(),
  payments: z
    .array(z.object({ transaction_amount_refunded: reaisSchema.nullable().optional() }))
    .nullable()
    .optional(),
  order_items: z.array(
    z.object({
      item: z.object({ id: z.string().max(64), title: z.string().max(255) }),
      quantity: z.number().int().positive().max(MAX_ORDER_LINE_QUANTITY),
      unit_price: reaisSchema,
      sale_fee: reaisSchema.nullable().optional(),
    }),
  ),
});

export type MercadoLivreOrder = z.infer<typeof orderSchema>;

/** `GET /orders/{id}` with the seller, checked against the store before the order is trusted. */
export const sellerOrderSchema = orderSchema.extend({ seller: z.object({ id: externalIdSchema }) });

export const ordersSearchSchema = z.object({
  results: z.array(orderSchema),
  paging: z.object({ total: z.number(), offset: z.number(), limit: z.number() }).optional(),
});

/**
 * A notification as documented. It is unsigned and anyone who knows our (public) application id
 * can post one, so each field has a ceiling well above the real values (a 36-character `_id`,
 * "/orders/2000003508419013") and only these fields are stored: a forged post can no longer
 * pad a 64 KB row into the events table, nor an `_id` past what its unique index can hold.
 */
export const notificationSchema = z.object({
  _id: z.string().min(1).max(128),
  resource: z.string().min(1).max(256),
  user_id: externalIdSchema,
  topic: z.string().min(1).max(64),
  application_id: externalIdSchema,
  attempts: z.number().int().min(0).max(1000).optional(),
  sent: z.string().max(64).optional(),
  received: z.string().max(64).optional(),
});

/** Fields of a stored notification that identify the order and the seller it belongs to. */
export const storedOrderNotificationSchema = z.object({
  user_id: z.union([z.string(), z.number()]),
  resource: z.string().min(1),
});

export const sellerCapabilitiesSchema = z.object({ tags: z.array(z.string()) });
export const categoryAttributesSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    tags: z
      .object({
        required: z.boolean().optional(),
        new_required: z.boolean().optional(),
        conditional_required: z.boolean().optional(),
        read_only: z.boolean().optional(),
      })
      .default({}),
  }),
);
export const conditionalAttributesSchema = z.object({
  required_attributes: z.array(z.object({ id: z.string(), name: z.string() })),
});
export const itemSearchSchema = z.object({
  results: z.array(z.string()),
  paging: z.object({ total: z.number().int().nonnegative() }),
});
export const reconciledItemSchema = createdItemSchema.extend({
  seller_id: externalIdSchema,
  seller_custom_field: z.string().nullable(),
  status: z.string(),
});
