import { z } from "zod";
import {
  channelSaleFees,
  type ChannelFeeContext,
  totalChannelFeeCents,
} from "../domain/channel-fees.ts";
import { formatCents, MAX_STORED_CENTS } from "../domain/money.ts";
import { freeText } from "./common.ts";

/** The channels a reseller registers sales of by hand, while they have no integration. */
export const MANUAL_SALE_CHANNELS = ["shopee", "tiktok_shop"] as const;
export type ManualSaleChannel = (typeof MANUAL_SALE_CHANNELS)[number];

export const MANUAL_SALE_CHANNEL_LABELS: Readonly<Record<ManualSaleChannel, string>> = {
  shopee: "Shopee",
  tiktok_shop: "TikTok Shop",
};

export const MANUAL_SALE_MAX_ITEMS = 20;
const MAX_QUANTITY = 999;
const MAX_ORDER_NUMBER_LENGTH = 60;
const MAX_BUYER_NAME_LENGTH = 120;
/** R$ 100.000,00 per unit: far above any catalog price, low enough to keep totals exact. */
const MAX_UNIT_PRICE_CENTS = 10_000_000;

export const manualSaleItemSchema = z.object({
  productId: z.uuid("Escolha o produto de novo"),
  quantity: z
    .number("Informe a quantidade")
    .int("A quantidade é um número inteiro")
    .min(1, "A quantidade é de pelo menos 1")
    .max(MAX_QUANTITY, `A quantidade é de até ${MAX_QUANTITY}`),
  unitPriceCents: z
    .number("Informe o preço de venda")
    .int("Informe o preço em reais e centavos")
    .min(1, "O preço de venda é de pelo menos R$ 0,01")
    .max(MAX_UNIT_PRICE_CENTS, "O preço de venda é de até R$ 100.000,00"),
});

interface SaleLine {
  readonly quantity: number;
  readonly unitPriceCents: number;
}

/** The order total is stored in one money column, so the sum of the items must fit it too. */
function saleTotalCents(items: readonly SaleLine[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}

/** Shopee and TikTok Shop fees depend only on the price; the context is Mercado Livre's. */
const PRICE_ONLY_FEE_CONTEXT: ChannelFeeContext = {
  mercadoLivreCommissionBasisPoints: 0,
  weightGrams: 0,
};

/**
 * The channel's published fee for the whole sale, in cents: each product pays its unit fee
 * (commission, fixed fee and TikTok's Shipping Fee Program) once per unit sold. An estimate the
 * reseller corrects with the real value from the channel's order.
 */
export function estimatedManualSaleFeeCents(
  channel: ManualSaleChannel,
  items: readonly SaleLine[],
): number {
  return items.reduce(
    (total, item) =>
      total +
      item.quantity *
        totalChannelFeeCents(channelSaleFees(channel, item.unitPriceCents, PRICE_ONLY_FEE_CONTEXT)),
    0,
  );
}

/** A sale made on Shopee or TikTok Shop, typed by the reseller from the channel's order. */
const manualSaleFieldsSchema = z.object({
  channel: z.enum(MANUAL_SALE_CHANNELS, "Escolha onde foi a venda"),
  externalOrderId: freeText()
    .trim()
    .min(1, "Digite o número do pedido, como aparece na Shopee ou no TikTok Shop")
    .max(
      MAX_ORDER_NUMBER_LENGTH,
      `O número do pedido tem até ${MAX_ORDER_NUMBER_LENGTH} caracteres`,
    ),
  buyerName: freeText()
    .trim()
    .min(2, "Informe o nome do comprador, como está na etiqueta")
    .max(MAX_BUYER_NAME_LENGTH, `O nome tem até ${MAX_BUYER_NAME_LENGTH} caracteres`),
  items: z
    .array(manualSaleItemSchema)
    .min(1, "Adicione pelo menos um produto")
    .max(MANUAL_SALE_MAX_ITEMS, `Uma venda tem até ${MANUAL_SALE_MAX_ITEMS} produtos`)
    .refine((items) => saleTotalCents(items) <= MAX_STORED_CENTS, {
      message: `O total da venda passa de ${formatCents(MAX_STORED_CENTS)}. Confira as quantidades e os preços`,
    }),
  /** What the channel keeps of the sale, as the reseller confirmed it from the channel's order. */
  marketplaceFeeCents: z
    .number("Preencha a taxa. Se a Shopee ou o TikTok Shop não cobrou nada, digite 0")
    .int("Informe a taxa em reais e centavos")
    .min(0, "A taxa não pode ser negativa")
    .max(MAX_STORED_CENTS, "Confira a taxa: ela passa do total da venda"),
});

export const manualSaleSchema = manualSaleFieldsSchema.superRefine((sale, context) => {
  const totalCents = saleTotalCents(sale.items);
  if (sale.marketplaceFeeCents <= totalCents) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: ["marketplaceFeeCents"],
    message: `A taxa não pode passar do total da venda (${formatCents(totalCents)})`,
  });
});
export type ManualSale = z.infer<typeof manualSaleSchema>;
