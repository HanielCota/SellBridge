import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { marketplaceError } from "../errors.ts";
import type {
  PublishedListing,
  PublishProductInput,
  StockPriceUpdate,
  StoreCredentials,
} from "../types.ts";
import { type MercadoLivreContext, requestJson } from "./client.ts";
import { createdItemSchema, domainDiscoverySchema } from "./schemas.ts";

const SITE_ID = "MLB";
const MAX_TITLE_LENGTH = 60;

async function predictCategory(
  context: MercadoLivreContext,
  prediction: { title: string; accessToken: string },
): Promise<string> {
  const query = new URLSearchParams([
    ["limit", "1"],
    ["q", prediction.title],
  ]);
  const predictions = await requestJson(context, {
    schema: domainDiscoverySchema,
    path: `/sites/${SITE_ID}/domain_discovery/search?${query.toString()}`,
    init: { accessToken: prediction.accessToken },
  });
  const [first] = predictions;
  if (!first) {
    throw marketplaceError(
      "O Mercado Livre não sugeriu uma categoria para este título. Ajuste o título e reprocesse.",
      { retryable: false },
    );
  }
  return first.category_id;
}

function itemBody(input: PublishProductInput, listing: { title: string; categoryId: string }) {
  return {
    title: listing.title,
    category_id: listing.categoryId,
    price: input.priceCents / 100,
    currency_id: "BRL",
    available_quantity: input.stock,
    buying_mode: "buy_it_now",
    condition: "new",
    listing_type_id: "gold_special",
    pictures: input.imageUrls.slice(0, 6).map((source) => ({ source })),
    attributes: [{ id: "SELLER_SKU", value_name: input.sku }],
  };
}

/** The description is optional for the listing: a failure is logged and publishing goes on. */
async function postDescription(
  context: MercadoLivreContext,
  description: { store: StoreCredentials; itemId: string; plainText: string },
): Promise<void> {
  try {
    await requestJson(context, {
      schema: z.unknown(),
      path: `/items/${description.itemId}/description`,
      init: {
        method: "POST",
        accessToken: description.store.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plain_text: description.plainText }),
      },
    });
  } catch (error) {
    logger.warn("mercado_livre.description_failed", {
      error,
      externalShopId: description.store.externalShopId,
      externalId: description.itemId,
    });
  }
}

export async function publishProduct(
  context: MercadoLivreContext,
  store: StoreCredentials,
  input: PublishProductInput,
): Promise<PublishedListing> {
  const title = input.title.slice(0, MAX_TITLE_LENGTH);
  const categoryId = await predictCategory(context, { title, accessToken: store.accessToken });
  // TODO(user-products): when the seller account migrates to User Products, the title
  // is no longer sent and the family flow applies (see docs/marketplaces/mercado-livre.md).
  // TODO(attributes): required attributes vary by category (BRAND, MODEL...); today the
  // marketplace rejects with a clear message when one is missing.
  // TODO(idempotency): POST /items is not idempotent; a crash between creating the item
  // and saving its id can duplicate the ad. Confirm a documented lookup by SELLER_SKU.
  const item = await requestJson(context, {
    schema: createdItemSchema,
    path: "/items",
    init: {
      method: "POST",
      accessToken: store.accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(itemBody(input, { title, categoryId })),
    },
  });
  await postDescription(context, { store, itemId: item.id, plainText: input.description });
  return { externalId: item.id, externalUrl: item.permalink ?? null };
}

function stockPriceBody(update: StockPriceUpdate): Record<string, number> {
  const body: Record<string, number> = {};
  if (update.priceCents !== undefined) {
    body.price = update.priceCents / 100;
  }
  if (update.stock !== undefined) {
    body.available_quantity = update.stock;
  }
  return body;
}

export async function updateStockPrice(
  context: MercadoLivreContext,
  store: StoreCredentials,
  update: StockPriceUpdate,
): Promise<void> {
  const body = stockPriceBody(update);
  if (Object.keys(body).length === 0) {
    return;
  }
  await requestJson(context, {
    schema: z.unknown(),
    path: `/items/${encodeURIComponent(update.externalId)}`,
    init: {
      method: "PUT",
      accessToken: store.accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  });
}
