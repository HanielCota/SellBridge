import { type AppError, isAppError } from "@sellbridge/shared/errors";
import { assertCents } from "@sellbridge/shared/money";
import { z } from "zod";
import { marketplaceError, marketplaceListingEndedError } from "../errors.ts";
import type {
  DescriptionUpdate,
  PublishedListing,
  PublishOptions,
  PublishProductInput,
  StockPriceUpdate,
  StoreCredentials,
} from "../types.ts";
import { requestShop, type TikTokShopContext } from "./client.ts";
import { uploadProductImages } from "./images.ts";
import {
  createdProductSchema,
  productSchema,
  recommendedCategorySchema,
  type TikTokShopProduct,
  warehousesSchema,
} from "./schemas.ts";
import { shopCipher } from "./shops.ts";

const CURRENCY = "BRL";
/** Brazil uses the 3-level category tree ("Recommend Category", `category_version`). */
const CATEGORY_VERSION = "v1";
const LOCALE = "pt-BR";
/** Create Product: description up to 10,000 characters; `idempotency_key` up to 128. */
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
/** Update Inventory accepts 0 to 999,999 units per warehouse. */
const MAX_STOCK = 999_999;
/** "The product does not exist" / "The product ID does not exist": the listing is gone. */
const PRODUCT_GONE_CODES: ReadonlySet<string> = new Set(["12052032", "12052260"]);

const WEIGHT_MISSING =
  "O TikTok Shop exige o peso da embalagem. Preencha o peso líquido no cadastro fiscal do produto e publique de novo.";
const DESCRIPTION_MISSING =
  "O TikTok Shop exige uma descrição. Preencha a descrição do produto e publique de novo.";

/** Price as TikTok writes amounts: "59.90". */
export function priceAmount(cents: number): string {
  const whole = assertCents(cents);
  if (whole <= 0) {
    throw marketplaceError("O preço do anúncio precisa ser maior que zero.", { retryable: false });
  }
  return `${Math.trunc(whole / 100)}.${String(whole % 100).padStart(2, "0")}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The stored plain-text description as the HTML TikTok takes: one paragraph per line. */
export function descriptionHtml(plainText: string): string {
  const paragraphs = plainText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => `<p>${escapeHtml(line)}</p>`);
  if (paragraphs.length === 0) {
    throw marketplaceError(DESCRIPTION_MISSING, { retryable: false });
  }
  const html = paragraphs.join("");
  if (html.length > MAX_DESCRIPTION_LENGTH) {
    throw marketplaceError(
      "A descrição passou do limite de 10.000 caracteres do TikTok Shop. Encurte a descrição e publique de novo.",
      { retryable: false },
    );
  }
  return html;
}

function assertStock(stock: number): number {
  if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
    throw marketplaceError("O estoque precisa ficar entre 0 e 999.999 unidades no TikTok Shop.", {
      retryable: false,
    });
  }
  return stock;
}

function packageWeight(grams: number | null | undefined): { value: string; unit: "GRAM" } {
  if (grams === null || grams === undefined || !Number.isInteger(grams) || grams <= 0) {
    throw marketplaceError(WEIGHT_MISSING, { retryable: false });
  }
  return { value: String(grams), unit: "GRAM" };
}

async function recommendCategory(
  context: TikTokShopContext,
  shop: { accessToken: string; cipher: string },
  title: string,
): Promise<string> {
  const result = await requestShop(context, {
    schema: recommendedCategorySchema,
    method: "POST",
    path: "/product/202309/categories/recommend",
    accessToken: shop.accessToken,
    shopCipher: shop.cipher,
    json: { product_title: title, category_version: CATEGORY_VERSION, locale: LOCALE },
  });
  if (result.leaf_category_id === undefined) {
    throw marketplaceError(
      "O TikTok Shop não encontrou uma categoria para este título. Escreva o nome completo do produto no título e publique de novo.",
      { retryable: false },
    );
  }
  return result.leaf_category_id;
}

/** The shop's default sales warehouse, where new listings keep their stock. */
async function defaultWarehouse(
  context: TikTokShopContext,
  shop: { accessToken: string; cipher: string },
): Promise<string> {
  const result = await requestShop(context, {
    schema: warehousesSchema,
    method: "GET",
    path: "/logistics/202309/warehouses",
    accessToken: shop.accessToken,
    shopCipher: shop.cipher,
  });
  const sales = result.warehouses.filter(
    (warehouse) => warehouse.type === "SALES_WAREHOUSE" && warehouse.effect_status === "ENABLED",
  );
  const chosen = sales.find((warehouse) => warehouse.is_default === true) ?? sales[0];
  if (chosen === undefined) {
    throw marketplaceError(
      "A loja não tem armazém de envio ativo no TikTok Shop. Cadastre o endereço de envio no Seller Center e publique de novo.",
      { retryable: false },
    );
  }
  return chosen.id;
}

/** Only a definitive refusal can clear the durable creation guard (as with Mercado Livre). */
function creationWasRefused(error: unknown): boolean {
  if (!isAppError(error)) {
    return false;
  }
  if (error.code === "EXTERNAL_PROVIDER_AUTH") {
    return true;
  }
  if (error.details.retryable === true) {
    return false;
  }
  const status = error.details.status;
  // TikTok answers business refusals with HTTP 200 and a non-zero code.
  return typeof status === "number" && status >= 200 && status < 500 && status !== 408;
}

interface ProductDraft {
  readonly categoryId: string;
  readonly warehouseId: string;
  readonly imageUris: readonly string[];
}

function productBody(input: PublishProductInput, draft: ProductDraft) {
  return {
    save_mode: "LISTING",
    title: input.title,
    description: descriptionHtml(input.description),
    category_id: draft.categoryId,
    category_version: CATEGORY_VERSION,
    main_images: draft.imageUris.map((uri) => ({ uri })),
    package_weight: packageWeight(input.packageWeightGrams),
    skus: [
      {
        seller_sku: input.sku,
        price: { amount: priceAmount(input.priceCents), currency: CURRENCY },
        inventory: [{ warehouse_id: draft.warehouseId, quantity: assertStock(input.stock) }],
      },
    ],
    idempotency_key: input.idempotencyKey.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH),
    locale: LOCALE,
  };
}

async function createProduct(
  context: TikTokShopContext,
  shop: { accessToken: string; cipher: string },
  body: ReturnType<typeof productBody>,
  options: PublishOptions | undefined,
): Promise<string> {
  await options?.beforeCreate();
  try {
    const created = await requestShop(context, {
      schema: createdProductSchema,
      method: "POST",
      path: "/product/202309/products",
      accessToken: shop.accessToken,
      shopCipher: shop.cipher,
      json: body,
    });
    return created.product_id;
  } catch (error) {
    if (creationWasRefused(error)) {
      await options?.creationRejected();
    }
    throw error;
  }
}

/**
 * Publishes one single-SKU product. Every check that can fail before creating (weight, description,
 * stock, category, warehouse, photos) runs first, so a refusal never leaves half a listing. The
 * stable `idempotency_key` is TikTok's documented guard against a duplicate when an uncertain
 * creation is sent again. [live test] what TikTok answers to a repeated key.
 */
export async function publishProduct(
  context: TikTokShopContext,
  store: StoreCredentials,
  input: PublishProductInput,
  options?: PublishOptions,
): Promise<PublishedListing> {
  packageWeight(input.packageWeightGrams);
  descriptionHtml(input.description);
  assertStock(input.stock);
  const shop = { accessToken: store.accessToken, cipher: await shopCipher(context, store) };
  const categoryId = await recommendCategory(context, shop, input.title);
  const warehouseId = await defaultWarehouse(context, shop);
  const imageUris = await uploadProductImages(context, store.accessToken, input.imageUrls);
  const body = productBody(input, { categoryId, warehouseId, imageUris });
  const productId = await createProduct(context, shop, body, options);
  return { externalId: productId, externalUrl: null, descriptionError: null };
}

function isProductGone(error: unknown): error is AppError {
  if (!isAppError(error) || error.code !== "EXTERNAL_PROVIDER") {
    return false;
  }
  const details: object = error.details;
  const causes = "causes" in details ? details.causes : undefined;
  return Array.isArray(causes) && causes.some((cause) => PRODUCT_GONE_CODES.has(String(cause)));
}

/** Runs an update of a live product; a product TikTok no longer has ends the listing for good. */
async function updateLiveProduct<Result>(update: () => Promise<Result>): Promise<Result> {
  try {
    return await update();
  } catch (error) {
    if (isProductGone(error)) {
      throw marketplaceListingEndedError("O anúncio não existe mais no TikTok Shop.", {
        status: error.details.status ?? null,
        cause: error,
      });
    }
    throw error;
  }
}

async function readProduct(
  context: TikTokShopContext,
  shop: { accessToken: string; cipher: string },
  productId: string,
): Promise<TikTokShopProduct> {
  return requestShop(context, {
    schema: productSchema,
    method: "GET",
    path: `/product/202309/products/${encodeURIComponent(productId)}`,
    accessToken: shop.accessToken,
    shopCipher: shop.cipher,
  });
}

/**
 * Updates price and stock of a published product. The SKU id and its warehouse are read from Get
 * Product: SellBridge listings carry one SKU, the first one.
 */
export async function updateStockPrice(
  context: TikTokShopContext,
  store: StoreCredentials,
  update: StockPriceUpdate,
): Promise<void> {
  if (update.priceCents === undefined && update.stock === undefined) {
    return;
  }
  const shop = { accessToken: store.accessToken, cipher: await shopCipher(context, store) };
  const productPath = `/product/202309/products/${encodeURIComponent(update.externalId)}`;
  await updateLiveProduct(async () => {
    const product = await readProduct(context, shop, update.externalId);
    const [sku] = product.skus;
    if (sku === undefined) {
      throw marketplaceError("O anúncio do TikTok Shop está sem variação.", { retryable: false });
    }
    if (update.priceCents !== undefined) {
      await requestShop(context, {
        schema: z.unknown(),
        method: "POST",
        path: `${productPath}/prices/update`,
        accessToken: shop.accessToken,
        shopCipher: shop.cipher,
        json: {
          skus: [
            { id: sku.id, price: { amount: priceAmount(update.priceCents), currency: CURRENCY } },
          ],
        },
      });
    }
    if (update.stock !== undefined) {
      const warehouseId = sku.inventory?.[0]?.warehouse_id;
      const inventory = { quantity: assertStock(update.stock) };
      await requestShop(context, {
        schema: z.unknown(),
        method: "POST",
        path: `${productPath}/inventory/update`,
        accessToken: shop.accessToken,
        shopCipher: shop.cipher,
        json: {
          skus: [
            {
              id: sku.id,
              inventory: [
                warehouseId === undefined ? inventory : { warehouse_id: warehouseId, ...inventory },
              ],
            },
          ],
        },
      });
    }
  });
}

/** Replaces the description of a live product; TikTok audits the new version before showing it. */
export async function updateDescription(
  context: TikTokShopContext,
  store: StoreCredentials,
  update: DescriptionUpdate,
): Promise<void> {
  const description = descriptionHtml(update.plainText);
  const cipher = await shopCipher(context, store);
  await updateLiveProduct(async () => {
    await requestShop(context, {
      schema: z.unknown(),
      method: "POST",
      path: `/product/202509/products/${encodeURIComponent(update.externalId)}/partial_edit`,
      accessToken: store.accessToken,
      shopCipher: cipher,
      json: { description },
    });
  });
}
