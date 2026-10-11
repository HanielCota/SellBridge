import { z } from "zod";
import { withFallback, optionalParameter } from "./fallback.ts";

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

export const LISTING_STATUSES = ["pending", "publishing", "published", "paused", "error"] as const;
export const listingStatusSchema = z.enum(LISTING_STATUSES);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  pending: "Na fila",
  publishing: "Publicando",
  published: "Publicado",
  paused: "Pausado",
  error: "Erro",
};

/** Mercado Livre rejects longer titles, so 60 is the ceiling every marketplace accepts. */
export const LISTING_TITLE_MIN_LENGTH = 10;
export const LISTING_TITLE_MAX_LENGTH = 60;
export const LISTING_DESCRIPTION_MIN_LENGTH = 20;
export const LISTING_DESCRIPTION_MAX_LENGTH = 5000;

export const listingTitleSchema = z
  .string()
  .trim()
  .min(
    LISTING_TITLE_MIN_LENGTH,
    `O título deve ter ao menos ${LISTING_TITLE_MIN_LENGTH} caracteres`,
  )
  .max(
    LISTING_TITLE_MAX_LENGTH,
    `O título deve ter no máximo ${LISTING_TITLE_MAX_LENGTH} caracteres`,
  );

export const listingDescriptionSchema = z
  .string()
  .trim()
  .min(
    LISTING_DESCRIPTION_MIN_LENGTH,
    `Descreva o produto com ao menos ${LISTING_DESCRIPTION_MIN_LENGTH} caracteres`,
  )
  .max(LISTING_DESCRIPTION_MAX_LENGTH, "A descrição deve ter no máximo 5.000 caracteres");

export const createListingSchema = z.object({
  supplierProductId: z.uuid(),
  title: listingTitleSchema,
  description: listingDescriptionSchema,
  priceCents: z.number().int().positive("Informe o preço de venda"),
  storeConnectionIds: z.array(z.uuid()).min(1, "Escolha ao menos uma loja de destino"),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const LISTING_SORTS = ["recent", "best_selling"] as const;
export const listingSortSchema = z.enum(LISTING_SORTS);
export type ListingSort = z.infer<typeof listingSortSchema>;

export const LISTING_SORT_LABELS: Record<ListingSort, string> = {
  recent: "Mais recentes",
  best_selling: "Mais vendidos",
};

/** Listings show as a three-column grid, so a page holds a multiple of three. */
export const listingsSearchSchema = z.object({
  status: optionalParameter(listingStatusSchema),
  query: optionalParameter(z.string().trim().max(100)),
  sort: optionalParameter(listingSortSchema),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(6).max(48).default(12), 12),
});
export type ListingsSearch = z.infer<typeof listingsSearchSchema>;
