import { z } from "zod";
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

/** A sale made on Shopee or TikTok Shop, typed by the reseller from the channel's order. */
export const manualSaleSchema = z.object({
  channel: z.enum(MANUAL_SALE_CHANNELS, "Escolha onde foi a venda"),
  externalOrderId: freeText()
    .trim()
    .min(1, "Informe o número do pedido, como aparece no canal")
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
    .max(MANUAL_SALE_MAX_ITEMS, `Uma venda tem até ${MANUAL_SALE_MAX_ITEMS} produtos`),
});
export type ManualSale = z.infer<typeof manualSaleSchema>;
