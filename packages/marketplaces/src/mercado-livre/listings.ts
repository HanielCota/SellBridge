import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { marketplaceError } from "../errors.ts";
import type {
  PublishedListing,
  PublishProductInput,
  PublishOptions,
  StockPriceUpdate,
  StoreCredentials,
} from "../types.ts";
import { type MercadoLivreContext, requestJson } from "./client.ts";
import {
  categoryAttributesSchema,
  conditionalAttributesSchema,
  createdItemSchema,
  domainDiscoverySchema,
  itemSearchSchema,
  reconciledItemSchema,
  sellerCapabilitiesSchema,
} from "./schemas.ts";

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

function itemBody(
  input: PublishProductInput,
  listing: { title: string; categoryId: string; userProducts: boolean },
) {
  return {
    ...(listing.userProducts ? { family_name: listing.title } : { title: listing.title }),
    category_id: listing.categoryId,
    price: input.priceCents / 100,
    currency_id: "BRL",
    available_quantity: input.stock,
    buying_mode: "buy_it_now",
    condition: "new",
    listing_type_id: "gold_special",
    pictures: input.imageUrls.slice(0, 6).map((source) => ({ source })),
    seller_custom_field: input.idempotencyKey,
    attributes: [
      ...Object.entries(input.mercadoLivreAttributes ?? {})
        .filter(([id]) => id !== "SELLER_SKU")
        .map(([id, value_name]) => ({ id, value_name })),
      { id: "SELLER_SKU", value_name: input.sku },
    ],
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

/** Search failures and ambiguous matches must never be interpreted as "not found". */
async function findExistingItem(
  context: MercadoLivreContext,
  store: StoreCredentials,
  input: PublishProductInput,
): Promise<PublishedListing | null> {
  const ids = new Set<string>();
  for (const filter of [{ sku: input.idempotencyKey }, { seller_sku: input.sku }]) {
    const query = new URLSearchParams({ ...filter, limit: "50" });
    const search = await requestJson(context, {
      schema: itemSearchSchema,
      path: `/users/${encodeURIComponent(store.externalShopId)}/items/search?${query.toString()}`,
      init: { accessToken: store.accessToken },
    });
    if (search.paging.total > search.results.length) {
      throw marketplaceError(
        "Há muitos anúncios com este SKU. Confira os anúncios no Mercado Livre antes de reprocessar.",
        { retryable: false },
      );
    }
    for (const id of search.results) ids.add(id);
  }
  const matches = [];
  for (const id of ids) {
    const item = await requestJson(context, {
      schema: reconciledItemSchema,
      path: `/items/${encodeURIComponent(id)}`,
      init: { accessToken: store.accessToken },
    });
    if (String(item.seller_id) !== store.externalShopId || item.id !== id) {
      throw marketplaceError("Não foi possível confirmar o vendedor do anúncio encontrado.", {
        retryable: false,
      });
    }
    if (!item.seller_custom_field) {
      throw marketplaceError(
        "Já existe um anúncio com este SKU sem identificação do SellBridge. Confira-o no Mercado Livre antes de publicar.",
        { retryable: false },
      );
    }
    if (item.seller_custom_field === input.idempotencyKey) matches.push(item);
  }
  if (matches.length > 1 || (matches[0] && !["active", "paused"].includes(matches[0].status))) {
    throw marketplaceError(
      "A conciliação encontrou anúncios duplicados ou encerrados. Confira-os no Mercado Livre antes de reprocessar.",
      { retryable: false },
    );
  }
  const item = matches[0];
  return item ? { externalId: item.id, externalUrl: item.permalink ?? null } : null;
}

function assertRequiredAttributes(
  categoryId: string,
  required: readonly { id: string; name: string }[],
  provided: ReadonlySet<string>,
): void {
  const missing = required.filter(({ id }) => !provided.has(id));
  if (missing.length) {
    throw marketplaceError(
      `Preencha os atributos obrigatórios da categoria ${categoryId} no cadastro do produto: ${missing.map(({ id, name }) => `${name} (${id})`).join(", ")}.`,
      { retryable: false },
    );
  }
}

async function validateAttributes(
  context: MercadoLivreContext,
  store: StoreCredentials,
  body: ReturnType<typeof itemBody>,
): Promise<void> {
  const definitions = await requestJson(context, {
    schema: categoryAttributesSchema,
    path: `/categories/${encodeURIComponent(body.category_id)}/attributes`,
    init: { accessToken: store.accessToken },
  });
  const provided = new Set(
    body.attributes.filter(({ value_name }) => value_name.trim()).map(({ id }) => id),
  );
  const required = definitions.filter(({ tags }) => tags.required || tags.new_required);
  assertRequiredAttributes(body.category_id, required, provided);
  if (definitions.some(({ tags }) => tags.conditional_required)) {
    const conditional = await requestJson(context, {
      schema: conditionalAttributesSchema,
      path: `/categories/${encodeURIComponent(body.category_id)}/attributes/conditional`,
      init: {
        method: "POST",
        accessToken: store.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    });
    assertRequiredAttributes(body.category_id, conditional.required_attributes, provided);
  }
  const readOnly = definitions.filter(({ id, tags }) => tags.read_only && provided.has(id));
  if (readOnly.length) {
    throw marketplaceError(
      `Remova os atributos somente de leitura: ${readOnly.map(({ id }) => id).join(", ")}.`,
      { retryable: false },
    );
  }
}

/** Only a definitive refusal can clear the durable creation guard. */
function creationWasRefused(error: unknown): boolean {
  if (!isAppError(error)) return false;
  if (error.code === "EXTERNAL_PROVIDER_AUTH") return true;
  const status = error.details.status;
  return (
    typeof status === "number" && status >= 400 && status < 500 && ![408, 425].includes(status)
  );
}

export async function publishProduct(
  context: MercadoLivreContext,
  store: StoreCredentials,
  input: PublishProductInput,
  options?: PublishOptions,
): Promise<PublishedListing> {
  const existing = await findExistingItem(context, store, input);
  if (existing) {
    await updateStockPrice(context, store, {
      externalId: existing.externalId,
      priceCents: input.priceCents,
      stock: input.stock,
    });
    await postDescription(context, {
      store,
      itemId: existing.externalId,
      plainText: input.description,
    });
    return existing;
  }
  if (options?.reconcileOnly) {
    throw marketplaceError(
      "Uma criação anterior pode ter sido concluída, mas o anúncio ainda não foi localizado. Aguarde e reprocesse para conciliar; confira o Mercado Livre antes de criar outro anúncio.",
      { retryable: false },
    );
  }
  const title = input.title.slice(0, MAX_TITLE_LENGTH);
  const categoryId = await predictCategory(context, { title, accessToken: store.accessToken });
  const seller = await requestJson(context, {
    schema: sellerCapabilitiesSchema,
    path: `/users/${encodeURIComponent(store.externalShopId)}`,
    init: { accessToken: store.accessToken },
  });
  const body = itemBody(input, {
    title,
    categoryId,
    userProducts: seller.tags.includes("user_product_seller"),
  });
  await validateAttributes(context, store, body);
  await options?.beforeCreate();
  let item;
  try {
    item = await requestJson(context, {
      schema: createdItemSchema,
      path: "/items",
      init: {
        method: "POST",
        accessToken: store.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    });
  } catch (error) {
    if (creationWasRefused(error)) await options?.creationRejected();
    throw error;
  }
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
