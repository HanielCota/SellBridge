import type { MARKETPLACES } from "@sellbridge/shared/schemas";

/** The sales channels' names, as the supplier reads them in the filter and the order. */
export const CHANNEL_LABELS: Record<(typeof MARKETPLACES)[number], string> = {
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  tiktok_shop: "TikTok Shop",
};

/** Where something came from, with the article each channel's name takes in Portuguese. */
const CHANNEL_SOURCES: Readonly<Record<(typeof MARKETPLACES)[number], string>> = {
  mercado_livre: "do Mercado Livre",
  shopee: "da Shopee",
  tiktok_shop: "do TikTok Shop",
};

/**
 * "do Mercado Livre", "da Shopee": the channel as the origin of something, for "Veio …".
 *
 * @param marketplace - The store's marketplace.
 * @returns The phrase with the right article; a channel the app no longer sells on reads as
 * "do canal de venda".
 */
export function channelSource(marketplace: string): string {
  const known: Readonly<Record<string, string>> = CHANNEL_SOURCES;
  return known[marketplace] ?? "do canal de venda";
}

/** A channel's name; one the app no longer sells on reads as such. */
export function channelLabel(marketplace: string): string {
  const known: Readonly<Record<string, string>> = CHANNEL_LABELS;
  return known[marketplace] ?? "Canal descontinuado";
}
