import { createHash } from "node:crypto";
import { assertCents } from "@sellbridge/shared/money";
import { z } from "zod";
import {
  hasMarketplaceCause,
  isMarketplaceAuthError,
  isMarketplaceError,
  marketplaceError,
  marketplaceListingEndedError,
} from "../errors.ts";
import type {
  DescriptionUpdate,
  PublishedListing,
  PublishOptions,
  PublishProductInput,
  StockPriceUpdate,
  StoreCredentials,
} from "../types.ts";
import {
  packageDimensions,
  readListingAttributes,
  readListingBrand,
  readListingChannels,
  recommendCategory,
} from "./catalog.ts";
import { requestShop, type ShopeeContext } from "./client.ts";
import { uploadImages } from "./images.ts";

const numericId = z.number().int().positive();
const createdSchema = z.object({ item_id: numericId });
const searchSchema = z.object({
  item_id_list: z.array(numericId),
  total_count: z.number().int().nonnegative(),
});
const updateSchema = z.object({
  success_list: z.array(z.object({ model_id: z.number().int().nonnegative() })).nullish(),
  failure_list: z.array(z.object({ failed_reason: z.string() })).nullish(),
});
const MAX_STOCK = 2_147_483_647;
const SETTLE_MS = 5 * 60 * 1_000;
const ITEM_GONE = ["error_item_not_found", "product.error_item_not_found"];
const AMBIGUOUS_CREATION_ERRORS = [
  "error_inner",
  "error_server",
  "error_network",
  "error_system_busy",
];

function priceInReais(cents: number): number {
  if (assertCents(cents) <= 0) {
    throw marketplaceError("O preço do anúncio precisa ser maior que zero.", { retryable: false });
  }

  return cents / 100;
}

function stockQuantity(stock: number): number {
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > MAX_STOCK) {
    throw marketplaceError("Informe uma quantidade de estoque válida para a Shopee.", {
      retryable: false,
    });
  }

  return stock;
}

function listedId(externalId: string): number {
  const id = Number(externalId);
  if (!/^\d+$/.test(externalId) || !Number.isSafeInteger(id) || id <= 0) {
    throw marketplaceError("O código do anúncio da Shopee é inválido.", { retryable: false });
  }

  return id;
}

function packageWeight(grams: number | null | undefined): number {
  if (grams === undefined || grams === null || !Number.isSafeInteger(grams) || grams <= 0) {
    throw marketplaceError(
      "A Shopee exige o peso. Informe o peso da embalagem no cadastro do produto.",
      { retryable: false },
    );
  }

  return grams / 1_000;
}

function published(store: StoreCredentials, itemId: number): PublishedListing {
  return {
    externalId: String(itemId),
    externalUrl: `https://shopee.com.br/product/${encodeURIComponent(store.externalShopId)}/${itemId}`,
  };
}

/** Shopee has no creation idempotency key. A stable item SKU lets a retry find its own item. */
function publicationSku(idempotencyKey: string): string {
  return "SB-" + createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24);
}

async function findExisting(context: ShopeeContext, store: StoreCredentials, sku: string) {
  const result = await requestShop(context, {
    accessToken: store.accessToken,
    shopId: store.externalShopId,
    method: "GET",
    path: "/api/v2/product/search_item",
    payload: "response",
    schema: searchSchema,
    query: { page_size: "2", item_sku: sku, item_status: "NORMAL,UNLIST,REVIEWING,BANNED" },
  });
  if (result.total_count > 1 || result.item_id_list.length > 1) {
    throw marketplaceError(
      "A Shopee encontrou mais de um anúncio com o código desta publicação. Confira os anúncios na Central do Vendedor.",
      { retryable: false },
    );
  }

  if (result.total_count > result.item_id_list.length) {
    throw marketplaceError("A Shopee ainda não retornou o anúncio da publicação anterior.", {
      retryable: true,
    });
  }

  return result.item_id_list[0];
}

function creationRefused(error: unknown): boolean {
  if (isMarketplaceAuthError(error)) {
    return true;
  }

  if (
    !isMarketplaceError(error) ||
    AMBIGUOUS_CREATION_ERRORS.some((code) => hasMarketplaceCause(error, code))
  ) {
    return false;
  }

  const status = error.details.status;
  return typeof status === "number" && status >= 200 && status < 500 && status !== 408;
}

function descriptionText(description: string): string {
  const text = description.trim();
  if (text === "") {
    throw marketplaceError("A Shopee exige uma descrição do produto.", { retryable: false });
  }

  return text;
}

function productTaxInfo(input: PublishProductInput) {
  const fiscal = input.productFiscal;
  if (fiscal === undefined || Object.values(fiscal).every((value) => value === null)) {
    return undefined;
  }

  return {
    ncm: fiscal.ncm ?? undefined,
    origin: fiscal.origin === null ? undefined : String(fiscal.origin),
    measure_unit: fiscal.unit ?? undefined,
    cest: fiscal.cest ?? undefined,
  };
}

async function listingBody(
  context: ShopeeContext,
  store: StoreCredentials,
  input: PublishProductInput,
  sku: string,
) {
  const originalPrice = priceInReais(input.priceCents);
  const stock = stockQuantity(input.stock);
  const weight = packageWeight(input.packageWeightGrams);
  const description = descriptionText(input.description);
  const dimensions = packageDimensions(input);
  const logisticInfo = await readListingChannels(context, store, weight, dimensions);
  const images = await uploadImages(context, input.imageUrls);
  const categoryId = await recommendCategory(context, store, input.title, images[0] ?? "");
  const [attributes, brand] = await Promise.all([
    readListingAttributes(context, store, categoryId, input),
    readListingBrand(context, store, categoryId, input.mercadoLivreAttributes?.BRAND),
  ]);
  const gtin = input.mercadoLivreAttributes?.GTIN?.trim();
  return {
    original_price: originalPrice,
    description,
    weight,
    item_name: input.title.trim(),
    item_status: "NORMAL",
    item_sku: sku,
    condition: "NEW",
    dimension: dimensions,
    category_id: categoryId,
    image: { image_id_list: images },
    logistic_info: logisticInfo,
    attribute_list: attributes,
    brand,
    tax_info: productTaxInfo(input),
    gtin_code: gtin && /^\d{8,14}$/.test(gtin) ? gtin : "00",
    seller_stock: [{ stock }],
  };
}

export async function publishProduct(
  context: ShopeeContext,
  store: StoreCredentials,
  input: PublishProductInput,
  options?: PublishOptions,
): Promise<PublishedListing> {
  const sku = publicationSku(input.idempotencyKey);
  if (options?.creationStartedAt != null) {
    const existing = await findExisting(context, store, sku);
    if (existing !== undefined) {
      return { ...published(store, existing), recovered: true };
    }

    if (context.now().getTime() - options.creationStartedAt.getTime() < SETTLE_MS) {
      throw marketplaceError("A Shopee ainda está confirmando o anúncio da tentativa anterior.", {
        retryable: true,
      });
    }

    await options.creationAbsent();
  }

  const body = await listingBody(context, store, input, sku);
  await options?.beforeCreate();
  try {
    const created = await requestShop(context, {
      accessToken: store.accessToken,
      shopId: store.externalShopId,
      method: "POST",
      path: "/api/v2/product/add_item",
      payload: "response",
      schema: createdSchema,
      json: body,
    });
    return published(store, created.item_id);
  } catch (error) {
    if (creationRefused(error)) {
      await options?.creationRejected();
    }

    throw error;
  }
}

function checkUpdate(result: z.output<typeof updateSchema>, field: string): void {
  if (
    (result.failure_list?.length ?? 0) > 0 ||
    !result.success_list?.some((row) => row.model_id === 0)
  ) {
    throw marketplaceError(
      `A Shopee não confirmou a atualização de ${field}. Confira o anúncio na Central do Vendedor.`,
      { retryable: false },
    );
  }
}

async function updateLiveListing(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    if (ITEM_GONE.some((code) => hasMarketplaceCause(error, code))) {
      throw marketplaceListingEndedError("O anúncio não existe mais na Shopee.", {
        status: null,
        cause: error,
      });
    }

    throw error;
  }
}

export async function updateStockPrice(
  context: ShopeeContext,
  store: StoreCredentials,
  update: StockPriceUpdate,
) {
  const itemId = listedId(update.externalId);
  const stock = update.stock === undefined ? undefined : stockQuantity(update.stock);
  const price = update.priceCents === undefined ? undefined : priceInReais(update.priceCents);
  await updateLiveListing(async () => {
    if (stock !== undefined) {
      const result = await requestShop(context, {
        accessToken: store.accessToken,
        shopId: store.externalShopId,
        method: "POST",
        path: "/api/v2/product/update_stock",
        payload: "response",
        schema: updateSchema,
        json: { item_id: itemId, stock_list: [{ model_id: 0, seller_stock: [{ stock }] }] },
      });
      checkUpdate(result, "estoque");
    }

    if (price !== undefined) {
      const result = await requestShop(context, {
        accessToken: store.accessToken,
        shopId: store.externalShopId,
        method: "POST",
        path: "/api/v2/product/update_price",
        payload: "response",
        schema: updateSchema,
        json: { item_id: itemId, price_list: [{ model_id: 0, original_price: price }] },
      });
      checkUpdate(result, "preço");
    }
  });
}

export async function updateDescription(
  context: ShopeeContext,
  store: StoreCredentials,
  update: DescriptionUpdate,
) {
  await updateLiveListing(async () => {
    await requestShop(context, {
      accessToken: store.accessToken,
      shopId: store.externalShopId,
      method: "POST",
      path: "/api/v2/product/update_item",
      payload: "response",
      schema: createdSchema,
      json: {
        item_id: listedId(update.externalId),
        description: descriptionText(update.plainText),
      },
    });
  });
}
