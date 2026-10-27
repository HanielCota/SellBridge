import type { MarketplaceId } from "@sellbridge/marketplaces";

/** "do Mercado Livre", "da Shopee": the article follows each marketplace's name. */
const ORDER_SOURCE: Record<MarketplaceId, string> = {
  mercado_livre: "do Mercado Livre",
  shopee: "da Shopee",
  tiktok_shop: "do TikTok Shop",
  mock: "da integração descontinuada",
};

/** Said above a forward form the marketplace's own address filled. */
export function marketplaceAddressNote(marketplace: MarketplaceId): string {
  return `Endereço preenchido pelo pedido ${ORDER_SOURCE[marketplace]}. Confira antes de encaminhar.`;
}
