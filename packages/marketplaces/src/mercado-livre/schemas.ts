import { z } from "zod";

/** Zod schemas for the Mercado Livre API responses and notifications used by the connector. */
export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.union([z.number(), z.string()]),
  refresh_token: z.string().min(1).optional(),
});

export const userSchema = z.object({ id: z.union([z.number(), z.string()]), nickname: z.string() });

export const errorBodySchema = z
  .object({ error: z.string().optional(), message: z.string().optional() })
  .passthrough();

export const domainDiscoverySchema = z.array(
  z.object({ category_id: z.string().min(1), category_name: z.string().optional() }),
);

export const createdItemSchema = z.object({
  id: z.string().min(1),
  permalink: z.string().nullable().optional(),
});

/**
 * Largest amount, in reais, that fits the integer cents columns (2,147,483,647 cents). A larger or
 * negative amount is refused here, with the webhook marked failed, instead of overflowing the
 * order upsert or turning into credit.
 */
const MAX_ORDER_AMOUNT = 21_474_836.47;
const orderAmountSchema = z.number().nonnegative().max(MAX_ORDER_AMOUNT);

export const orderSchema = z.object({
  // A numeric id past 2^53 has already lost digits in JSON.parse: refuse it rather than store it.
  id: z.union([z.number().int(), z.string()]),
  status: z.string(),
  date_created: z.iso.datetime({ offset: true }),
  total_amount: orderAmountSchema,
  buyer: z.object({ nickname: z.string().optional() }).nullable().optional(),
  tags: z.array(z.string()).optional(),
  payments: z
    .array(z.object({ transaction_amount_refunded: orderAmountSchema.nullable().optional() }))
    .nullable()
    .optional(),
  order_items: z.array(
    z.object({
      item: z.object({ id: z.string(), title: z.string() }),
      quantity: z.number().int().positive().max(1_000_000),
      unit_price: orderAmountSchema,
      sale_fee: orderAmountSchema.nullable().optional(),
    }),
  ),
});

export type MercadoLivreOrder = z.infer<typeof orderSchema>;

export const ordersSearchSchema = z.object({
  results: z.array(orderSchema),
  paging: z.object({ total: z.number(), offset: z.number(), limit: z.number() }).optional(),
});

export const notificationSchema = z.object({
  _id: z.string().min(1),
  resource: z.string().min(1),
  user_id: z.union([z.number(), z.string()]),
  topic: z.string().min(1),
  application_id: z.union([z.number(), z.string()]),
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
  seller_id: z.union([z.number(), z.string()]),
  seller_custom_field: z.string().nullable(),
  status: z.string(),
});
