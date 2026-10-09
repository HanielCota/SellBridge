import { z } from "zod";

export const MARKETPLACES = ["mock", "mercado_livre", "shopee", "tiktok_shop"] as const;
export const marketplaceSchema = z.enum(MARKETPLACES);
export type Marketplace = z.infer<typeof marketplaceSchema>;

export const STORE_STATUSES = ["connected", "expired", "error", "disconnected"] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  connected: "Conectada",
  expired: "Acesso expirado",
  error: "Com erro",
  disconnected: "Desconectada",
};

export const LISTING_STATUSES = ["pending", "publishing", "published", "error"] as const;
export const listingStatusSchema = z.enum(LISTING_STATUSES);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  pending: "Na fila",
  publishing: "Publicando",
  published: "Publicado",
  error: "Erro",
};

export const createListingSchema = z.object({
  supplierProductId: z.uuid(),
  title: z.string().trim().min(10, "O título deve ter ao menos 10 caracteres").max(120),
  description: z.string().trim().min(20, "Descreva o produto com ao menos 20 caracteres").max(5000),
  priceCents: z.number().int().positive("Informe o preço de venda"),
  storeConnectionIds: z.array(z.uuid()).min(1, "Escolha ao menos uma loja de destino"),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const listingsSearchSchema = z.object({
  status: listingStatusSchema.optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10).catch(10),
});
export type ListingsSearch = z.infer<typeof listingsSearchSchema>;
