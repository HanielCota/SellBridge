import { validationError } from "@sellbridge/shared/errors";
import {
  fitListingTitle,
  listingDescriptionSchema,
  listingTitleSchema,
} from "@sellbridge/shared/schemas";

/** What a listing draft needs from the catalog product it sells. */
export interface DraftSourceProduct {
  id: string;
  title: string;
  description: string;
  suggestedPriceCents: number;
}

/** Fields the caller chose; any one left out falls back to the product's own. */
export interface DraftOverrides {
  title?: string | undefined;
  description?: string | undefined;
  priceCents?: number | undefined;
}

export interface ListingDraft {
  supplierProductId: string;
  title: string;
  description: string;
  priceCents: number;
}

function validTitle(title: string): string {
  const parsed = listingTitleSchema.safeParse(title);
  if (!parsed.success) {
    throw validationError(
      "O título do produto não serve como título do anúncio; informe um título",
    );
  }
  return parsed.data;
}

function validDescription(description: string): string {
  const parsed = listingDescriptionSchema.safeParse(description);
  if (!parsed.success) {
    throw validationError(
      "A descrição do produto não serve como descrição do anúncio; informe uma descrição",
    );
  }
  return parsed.data;
}

/**
 * Builds the listing from the caller's choices, filling the gaps from the product (title cut
 * to the marketplace limit, description, suggested price). Fallbacks go through the same
 * title and description rules as typed values, so a draft never skips them.
 */
export function resolveListingDraft(
  product: DraftSourceProduct,
  overrides: DraftOverrides,
): ListingDraft {
  return {
    supplierProductId: product.id,
    title: validTitle(overrides.title ?? fitListingTitle(product.title)),
    description: validDescription(overrides.description ?? product.description),
    priceCents: overrides.priceCents ?? product.suggestedPriceCents,
  };
}
