import { z } from "zod";
import { freeText, pageNumberSchema } from "./common.ts";
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

/** Cuts at `end`, one code unit earlier when that would split an emoji's surrogate pair. */
function sliceWholeCharacters(text: string, end: number): string {
  const lastCode = text.charCodeAt(end - 1);
  const splitsPair = lastCode >= 0xd800 && lastCode <= 0xdbff;
  return text.slice(0, splitsPair ? end - 1 : end);
}

/**
 * Fits a supplier title into the marketplace limit: cut at the last word that fits, or
 * mid-word when stopping at a space would leave a title shorter than the minimum. Runs of
 * whitespace become one space, and an emoji is never cut in half.
 */
export function fitListingTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (normalized.length <= LISTING_TITLE_MAX_LENGTH) {
    return normalized;
  }
  const lastSpace = normalized.lastIndexOf(" ", LISTING_TITLE_MAX_LENGTH);
  if (lastSpace < LISTING_TITLE_MIN_LENGTH) {
    return sliceWholeCharacters(normalized, LISTING_TITLE_MAX_LENGTH);
  }
  return normalized.slice(0, lastSpace);
}

export const listingTitleSchema = freeText()
  .trim()
  .min(
    LISTING_TITLE_MIN_LENGTH,
    `O título deve ter ao menos ${LISTING_TITLE_MIN_LENGTH} caracteres`,
  )
  .max(
    LISTING_TITLE_MAX_LENGTH,
    `O título deve ter no máximo ${LISTING_TITLE_MAX_LENGTH} caracteres`,
  );

export const listingDescriptionSchema = freeText()
  .trim()
  .min(
    LISTING_DESCRIPTION_MIN_LENGTH,
    `Descreva o produto com ao menos ${LISTING_DESCRIPTION_MIN_LENGTH} caracteres`,
  )
  .max(LISTING_DESCRIPTION_MAX_LENGTH, "A descrição deve ter no máximo 5.000 caracteres");

/** R$ 1.000.000,00: far above any real listing, and well inside the database integer. */
export const LISTING_MAX_PRICE_CENTS = 100_000_000;

export const listingPriceCentsSchema = z
  .number()
  .int()
  .positive("Informe o preço de venda")
  .max(LISTING_MAX_PRICE_CENTS, "O preço de venda pode ser de até R$ 1.000.000,00");

/** Listings one pause, resume or retry acts on at once (the bulk actions bar). */
export const MAX_LISTING_BATCH = 100;

/** Stores one listing may go to at once; a tenant connects far fewer. */
export const MAX_LISTING_STORES = 50;

export const createListingSchema = z.object({
  supplierProductId: z.uuid(),
  title: listingTitleSchema,
  description: listingDescriptionSchema,
  priceCents: listingPriceCentsSchema,
  storeConnectionIds: z
    .array(z.uuid())
    .min(1, "Escolha ao menos uma loja de destino")
    .max(MAX_LISTING_STORES),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const LISTING_SORTS = ["recent", "best_selling"] as const;
export const listingSortSchema = z.enum(LISTING_SORTS);
export type ListingSort = z.infer<typeof listingSortSchema>;

export const LISTING_SORT_LABELS: Record<ListingSort, string> = {
  recent: "Mais recentes",
  best_selling: "Mais vendidos",
};

/**
 * The statuses the listings page can filter by, one tab each. Any other status in the URL
 * falls back to "all", so the highlighted tab always matches the grid.
 */
export const LISTING_FILTER_STATUSES = [
  "published",
  "error",
  "paused",
] as const satisfies readonly ListingStatus[];
export type ListingFilterStatus = (typeof LISTING_FILTER_STATUSES)[number];

/** Listings show as a three-column grid, so a page holds a multiple of three. */
export const listingsSearchSchema = z.object({
  status: optionalParameter(z.enum(LISTING_FILTER_STATUSES)),
  query: optionalParameter(freeText().trim().max(100)),
  sort: optionalParameter(listingSortSchema),
  page: withFallback(pageNumberSchema.default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(6).max(48).default(12), 12),
});
export type ListingsSearch = z.infer<typeof listingsSearchSchema>;
