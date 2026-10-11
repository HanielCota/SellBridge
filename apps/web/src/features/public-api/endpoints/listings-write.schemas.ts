import { validationError } from "@sellbridge/shared/errors";
import {
  LISTING_DESCRIPTION_MAX_LENGTH,
  LISTING_DESCRIPTION_MIN_LENGTH,
  LISTING_TITLE_MAX_LENGTH,
  LISTING_TITLE_MIN_LENGTH,
  listingDescriptionSchema,
  listingPriceCentsSchema,
  listingTitleSchema,
} from "@sellbridge/shared/schemas";
import { z } from "zod";

/** A store can only receive a listing once, and a listing is never sent to hundreds. */
const MAX_STORES_PER_LISTING = 50;

export const createListingBodySchema = z.object({
  productId: z.uuid().describe("ID do produto no catálogo de fornecedores da sua região."),
  title: listingTitleSchema
    .optional()
    .describe(
      `Título do anúncio (${LISTING_TITLE_MIN_LENGTH} a ${LISTING_TITLE_MAX_LENGTH} caracteres). ` +
        `Se omitido, usa o título do produto cortado em ${LISTING_TITLE_MAX_LENGTH} caracteres.`,
    ),
  description: listingDescriptionSchema
    .optional()
    .describe(
      `Descrição do anúncio (${LISTING_DESCRIPTION_MIN_LENGTH} a ` +
        `${LISTING_DESCRIPTION_MAX_LENGTH} caracteres). Se omitida, usa a descrição do produto.`,
    ),
  priceCents: listingPriceCentsSchema
    .optional()
    .describe(
      "Preço de venda em centavos (BRL); precisa ser maior que o custo do fornecedor. " +
        "Se omitido, usa o preço sugerido do produto.",
    ),
  storeIds: z
    .array(z.uuid())
    .min(1, "Escolha ao menos uma loja de destino")
    .max(MAX_STORES_PER_LISTING)
    .describe("IDs das lojas de destino; todas precisam estar conectadas."),
});

export const updateListingBodySchema = z.object({
  priceCents: listingPriceCentsSchema
    .optional()
    .describe("Novo preço de venda em centavos (BRL); precisa ser maior que o custo."),
  paused: z
    .boolean()
    .optional()
    .describe(
      "`true` pausa o anúncio (estoque zero no marketplace); `false` retoma as lojas pausadas.",
    ),
});
export type UpdateListingBody = z.infer<typeof updateListingBodySchema>;

export const listingIdParamsSchema = z.object({
  listingId: z.uuid().describe("ID do anúncio."),
});

/**
 * An empty PATCH is well-formed JSON that asks for nothing, so it is a 422 (understood but
 * not processable) rather than a malformed request.
 */
export function assertHasChanges(body: UpdateListingBody): void {
  if (body.priceCents === undefined && body.paused === undefined) {
    throw validationError("Informe `priceCents` e/ou `paused`");
  }
}
