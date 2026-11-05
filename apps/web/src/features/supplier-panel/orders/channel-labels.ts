import type { MARKETPLACES } from "@sellbridge/shared/schemas";

/** The sales channels' names, as the supplier reads them in the filter and the order. */
export const CHANNEL_LABELS: Record<(typeof MARKETPLACES)[number], string> = {
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  tiktok_shop: "TikTok Shop",
};

/** A channel's name; one the app no longer sells on reads as such. */
export function channelLabel(marketplace: string): string {
  const known: Readonly<Record<string, string>> = CHANNEL_LABELS;
  return known[marketplace] ?? "Canal descontinuado";
}
