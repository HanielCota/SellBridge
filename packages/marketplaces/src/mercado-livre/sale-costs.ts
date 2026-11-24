import { z } from "zod";
import type { StoreCredentials } from "../types.ts";
import { marketplaceError } from "../errors.ts";
import { requestJson, type MercadoLivreConfig, type MercadoLivreContext } from "./client.ts";
import { packageAttributeValue } from "./package-measures.ts";

/** The listing type SellBridge publishes: Clássico (listings.ts). */
const LISTING_TYPE_ID = "gold_special";

const PERCENT_TO_BASIS_POINTS = 100;
const REAIS_TO_CENTS = 100;

function contextOf(config: MercadoLivreConfig): MercadoLivreContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
}

function priceInReais(priceCents: number): string {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw marketplaceError(`Preço inválido para consultar o Mercado Livre: ${priceCents}`, {
      retryable: false,
    });
  }
  return (priceCents / REAIS_TO_CENTS).toFixed(2);
}

/** A commission is a share of the price: anything above the whole price is a broken answer. */
const MAX_COMMISSION_PERCENT = 100;
/** Far above any Mercado Envios cost; a larger answer is refused instead of pricing on it. */
const MAX_SHIPPING_LIST_COST_REAIS = 5_000;

const listingPricesSchema = z.array(
  z.object({
    listing_type_id: z.string(),
    sale_fee_details: z.object({
      percentage_fee: z.number().nonnegative().max(MAX_COMMISSION_PERCENT),
    }),
  }),
);

/**
 * The store's commission for a Clássico listing in the category, in basis points, as
 * `GET /sites/MLB/listing_prices` answers it with the seller's own token
 * (developers.mercadolivre.com.br/pt_br/comissao-por-vender, read 16/11/2026). Only the
 * percentage is read: Mercado Envios 2 items under the free shipping threshold pay no fixed fee
 * (Flex aside), and the seller's shipping is read on its own.
 */
export async function readMercadoLivreCommission(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  query: { categoryId: string; priceCents: number },
): Promise<number> {
  const parameters = new URLSearchParams({
    price: priceInReais(query.priceCents),
    currency_id: "BRL",
    category_id: query.categoryId,
    listing_type_id: LISTING_TYPE_ID,
    // Without these the fixed fee in the answer is not the one charged (same page).
    shipping_mode: "me2",
    logistic_type: "drop_off",
  });
  const prices = await requestJson(contextOf(config), {
    schema: listingPricesSchema,
    path: `/sites/MLB/listing_prices?${parameters.toString()}`,
    init: { accessToken: store.accessToken },
  });
  const classic = prices.find((price) => price.listing_type_id === LISTING_TYPE_ID);
  if (classic === undefined) {
    throw marketplaceError(
      "O Mercado Livre não informou a taxa do anúncio Clássico. Tente de novo em alguns minutos.",
      {
        retryable: false,
      },
    );
  }
  return Math.round(classic.sale_fee_details.percentage_fee * PERCENT_TO_BASIS_POINTS);
}

/** Height, width and length in centimeters and the weight in grams, as whole numbers. */
export interface PackageDimensions {
  heightCentimeters: number;
  widthCentimeters: number;
  lengthCentimeters: number;
  weightGrams: number;
}

function measureOf(attributes: Readonly<Record<string, string>>, id: string): number | null {
  const stored = attributes[id];
  if (stored === undefined) {
    return null;
  }
  const value = packageAttributeValue(id, stored);
  if (value === null) {
    return null;
  }
  return Number.parseInt(value, 10);
}

/**
 * The package the supplier declared in the product's Mercado Livre fields, or null when one of
 * the four measures is missing or unreadable: the shipping quote needs all of them.
 */
export function packageDimensionsOf(
  attributes: Readonly<Record<string, string>>,
): PackageDimensions | null {
  const heightCentimeters = measureOf(attributes, "SELLER_PACKAGE_HEIGHT");
  const widthCentimeters = measureOf(attributes, "SELLER_PACKAGE_WIDTH");
  const lengthCentimeters = measureOf(attributes, "SELLER_PACKAGE_LENGTH");
  const weightGrams = measureOf(attributes, "SELLER_PACKAGE_WEIGHT");
  if (
    heightCentimeters === null ||
    widthCentimeters === null ||
    lengthCentimeters === null ||
    weightGrams === null
  ) {
    return null;
  }
  return { heightCentimeters, widthCentimeters, lengthCentimeters, weightGrams };
}

const freeShippingOptionsSchema = z.object({
  coverage: z.object({
    all_country: z.object({
      list_cost: z.number().nonnegative().max(MAX_SHIPPING_LIST_COST_REAIS),
    }),
  }),
});

/**
 * What the store pays Mercado Livre to ship one unit of the package sold at the price, in cents:
 * `coverage.all_country.list_cost` of `GET /users/{id}/shipping_options/free`
 * (developers.mercadolivre.com.br/pt_br/custos-de-envio, read 16/11/2026). It already holds the
 * store's own discount (reputation, MercadoLíder). Asked with free shipping on: the seller pays
 * that cost even when the buyer pays shipping (mercadolivre.com.br/ajuda/40538).
 */
export async function readMercadoLivreShippingCost(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  query: { dimensions: PackageDimensions; priceCents: number },
): Promise<number> {
  const { heightCentimeters, widthCentimeters, lengthCentimeters, weightGrams } = query.dimensions;
  const parameters = new URLSearchParams({
    dimensions: `${heightCentimeters}x${widthCentimeters}x${lengthCentimeters},${weightGrams}`,
    item_price: priceInReais(query.priceCents),
    listing_type_id: LISTING_TYPE_ID,
    mode: "me2",
    condition: "new",
    free_shipping: "true",
    verbose: "false",
  });
  if (!/^\d+$/.test(store.externalShopId)) {
    throw marketplaceError("Conta do Mercado Livre inválida", { retryable: false });
  }
  const options = await requestJson(contextOf(config), {
    schema: freeShippingOptionsSchema,
    path: `/users/${store.externalShopId}/shipping_options/free?${parameters.toString()}`,
    init: { accessToken: store.accessToken },
  });
  return Math.round(options.coverage.all_country.list_cost * REAIS_TO_CENTS);
}
