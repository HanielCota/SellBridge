import { type AppError, isAppError } from "@sellbridge/shared/errors";
import { isNoGtin } from "@sellbridge/shared/product-fiscal";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { marketplaceError, marketplaceListingEndedError } from "../errors.ts";
import type {
  DescriptionUpdate,
  PublishedListing,
  PublishProductInput,
  PublishOptions,
  StockPriceUpdate,
  StoreCredentials,
} from "../types.ts";
import { type MercadoLivreContext, requestJson } from "./client.ts";
import { DESCRIPTION_NOT_PLAIN_TEXT, LISTING_ENDED_MESSAGE } from "./error-messages.ts";
import {
  type FichaAttribute,
  fichaAttributeSchema,
  isRequiredAttribute,
} from "./category-ficha.ts";
import {
  kindAttributesFromCategory,
  kindAttributesFromTitle,
  type KindAttribute,
  missingKindDefinitions,
} from "./category-kind.ts";
import { brandToSend } from "./generic-brand.ts";
import { isPackageAttribute, packageAttributeValue } from "./package-measures.ts";
import { saleTermsFor } from "./sale-terms.ts";
import { toMercadoLivrePlainText } from "./plain-text.ts";
import {
  conditionalAttributesSchema,
  createdItemSchema,
  domainDiscoverySchema,
  itemSearchSchema,
  itemStatusSchema,
  reconciledItemSchema,
  sellerCapabilitiesSchema,
} from "./schemas.ts";

const SITE_ID = "MLB";
const MAX_TITLE_LENGTH = 60;
/** Mercado Livre's state for an item closed by the seller, by itself or deleted: it never reopens. */
const ENDED_ITEM_STATUS = "closed";
/** States a recovered item may be adopted in. */
const ADOPTABLE_ITEM_STATUSES: readonly string[] = ["active", "paused"];

/** A refusal that may come from the item's state rather than from the data sent. */
function mayBeEndedItemRefusal(error: unknown): error is AppError {
  if (!isAppError(error) || error.code !== "EXTERNAL_PROVIDER") {
    return false;
  }
  return error.details.status === 400 || error.details.status === 404;
}

/** Whether Mercado Livre shows the item closed; false whenever the reading fails. */
async function itemHasEnded(
  context: MercadoLivreContext,
  store: StoreCredentials,
  externalId: string,
): Promise<boolean> {
  try {
    const item = await requestJson(context, {
      schema: itemStatusSchema,
      path: `/items/${encodeURIComponent(externalId)}`,
      init: { accessToken: store.accessToken },
    });
    return item.status === ENDED_ITEM_STATUS;
  } catch (error) {
    logger.warn("mercado_livre.item_state_unknown", {
      externalShopId: store.externalShopId,
      externalId,
      error,
    });
    return false;
  }
}

/**
 * Runs an update of a live item. When Mercado Livre refuses it and the item turns out closed,
 * the refusal becomes a "listing ended" error, so the caller stops syncing it for good; the
 * refusal's wording alone is not trusted for that.
 */
async function updateLiveItem(
  context: MercadoLivreContext,
  item: { store: StoreCredentials; externalId: string },
  update: () => Promise<void>,
): Promise<void> {
  try {
    await update();
  } catch (error) {
    if (
      mayBeEndedItemRefusal(error) &&
      (await itemHasEnded(context, item.store, item.externalId))
    ) {
      throw marketplaceListingEndedError(LISTING_ENDED_MESSAGE, {
        status: error.details.status ?? null,
        cause: error,
      });
    }
    throw error;
  }
}

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
      "O Mercado Livre não sugeriu uma categoria para este título. Ajuste o título e clique em Tentar de novo.",
      { retryable: false },
    );
  }
  return first.category_id;
}

function itemBody(
  input: PublishProductInput,
  listing: {
    title: string;
    /** The grid's family name; a plain product's family is its own title. */
    familyName: string | null;
    categoryId: string;
    userProducts: boolean;
    definitions: readonly FichaAttribute[];
    kindAttributes: readonly KindAttribute[];
  },
) {
  return {
    ...(listing.userProducts
      ? { family_name: listing.familyName ?? listing.title }
      : { title: listing.title }),
    category_id: listing.categoryId,
    price: input.priceCents / 100,
    currency_id: "BRL",
    available_quantity: input.stock,
    buying_mode: "buy_it_now",
    condition: "new",
    listing_type_id: "gold_special",
    pictures: input.imageUrls.slice(0, 6).map((source) => ({ source })),
    seller_custom_field: input.idempotencyKey,
    ...optionalItemFields(input),
    attributes: [
      ...attributesWithBrand(input, listing.definitions).map((attribute) =>
        withValueId(attribute, listing.definitions),
      ),
      ...listing.kindAttributes,
      { id: "SELLER_SKU", value_name: input.sku },
    ],
  };
}

/** Sale terms and video only when the supplier gave them: an empty list is not "none". */
function optionalItemFields(input: PublishProductInput) {
  const saleTerms = saleTermsFor(input.saleTerms);
  return {
    ...(saleTerms.length === 0 ? {} : { sale_terms: saleTerms }),
    ...(input.videoId === undefined || input.videoId === null ? {} : { video_id: input.videoId }),
  };
}

/** One stored attribute as Mercado Livre takes it, or null when it must be left out. */
function attributeToSend(id: string, value: string): { id: string; value_name: string } | null {
  // "SEM GTIN" is for the NF-e; Mercado Livre refuses it as a barcode, so it is left out.
  if (id === "SELLER_SKU" || (id === "GTIN" && isNoGtin(value))) {
    return null;
  }
  if (isPackageAttribute(id)) {
    return packageAttribute(id, value);
  }
  return { id, value_name: value };
}

function packageAttribute(id: string, value: string): { id: string; value_name: string } | null {
  const packageValue = packageAttributeValue(id, value);
  if (packageValue === null) {
    // A malformed measure would refuse the whole item; without it only the shipping quote waits.
    logger.warn("mercado_livre.package_attribute_skipped", { attributeId: id });
    return null;
  }
  return { id, value_name: packageValue };
}

interface SentAttribute {
  id: string;
  value_name: string;
  value_id?: string;
}

/**
 * A yes/no attribute is only read by its value id ("Atributos" page, boolean type): the stored
 * "Sim"/"Não" gets the category's id for it. Other types are sent by name.
 */
function withValueId(
  attribute: SentAttribute,
  definitions: readonly FichaAttribute[],
): SentAttribute {
  const definition = definitions.find(({ id }) => id === attribute.id);
  if (definition?.value_type !== "boolean") {
    return attribute;
  }
  const value = definition.values.find(({ name }) => name === attribute.value_name);
  return value === undefined ? attribute : { ...attribute, value_id: value.id };
}

function productAttributes(input: PublishProductInput): SentAttribute[] {
  return Object.entries(input.mercadoLivreAttributes ?? {}).flatMap(([id, value]) => {
    const attribute = attributeToSend(id, value);
    return attribute === null ? [] : [attribute];
  });
}

/** The stored attributes with BRAND first, as the category takes it (see `brandToSend`). */
function attributesWithBrand(
  input: PublishProductInput,
  definitions: readonly FichaAttribute[],
): SentAttribute[] {
  const attributes = productAttributes(input).filter(({ id }) => id !== "BRAND");
  const brand = brandToSend(input.mercadoLivreAttributes?.BRAND, definitions);
  return brand === null ? attributes : [brand, ...attributes];
}

/** Why a description did not go through, in the reseller's words (13.a); generic otherwise. */
function descriptionFailure(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  return "O Mercado Livre não recebeu a descrição. Reenvie a descrição.";
}

/** The description as `plain_text` takes it; one with nothing left is refused here, never sent. */
function descriptionBody(description: string): string {
  const plainText = toMercadoLivrePlainText(description);
  if (plainText === "") {
    throw marketplaceError(DESCRIPTION_NOT_PLAIN_TEXT, { retryable: false });
  }
  return JSON.stringify({ plain_text: plainText });
}

/**
 * The description is optional for the listing: a failure never fails the publication, but it
 * is reported back so the reseller sees it and can resend (item 13.b). Null when it went through.
 */
async function postDescription(
  context: MercadoLivreContext,
  description: { store: StoreCredentials; itemId: string; plainText: string },
): Promise<string | null> {
  try {
    await requestJson(context, {
      schema: z.unknown(),
      path: `/items/${encodeURIComponent(description.itemId)}/description`,
      init: {
        method: "POST",
        accessToken: description.store.accessToken,
        headers: { "content-type": "application/json" },
        body: descriptionBody(description.plainText),
      },
    });
    return null;
  } catch (error) {
    logger.warn("mercado_livre.description_failed", {
      error,
      externalShopId: description.store.externalShopId,
      externalId: description.itemId,
    });
    return descriptionFailure(error);
  }
}

/** `updateDescription` for publishing: a refusal is reported, never thrown. */
async function replaceDescription(
  context: MercadoLivreContext,
  store: StoreCredentials,
  update: DescriptionUpdate,
): Promise<string | null> {
  try {
    await updateDescription(context, store, update);
    return null;
  } catch (error) {
    logger.warn("mercado_livre.description_failed", {
      error,
      externalShopId: store.externalShopId,
      externalId: update.externalId,
    });
    return descriptionFailure(error);
  }
}

/**
 * Replaces the description of a live item. The official "Descrição de produtos" page: POST only
 * creates one (a second POST is a bad request), PUT with api_version=2 replaces it.
 */
export async function updateDescription(
  context: MercadoLivreContext,
  store: StoreCredentials,
  update: DescriptionUpdate,
): Promise<void> {
  await updateLiveItem(context, { store, externalId: update.externalId }, async () => {
    await requestJson(context, {
      schema: z.unknown(),
      path: `/items/${encodeURIComponent(update.externalId)}/description?api_version=2`,
      init: {
        method: "PUT",
        accessToken: store.accessToken,
        headers: { "content-type": "application/json" },
        body: descriptionBody(update.plainText),
      },
    });
  });
}

const ITEM_STATUS_WORDS: Readonly<Record<string, string>> = { active: "ativo", paused: "pausado" };

/**
 * A live item with the product's SKU that SellBridge did not create: adopting it could fight
 * another tool over its stock, so the seller closes it and reprocesses (decided on 2026-11-18).
 */
function unmarkedItemError(item: { id: string; status: string }): AppError {
  const statusWord = ITEM_STATUS_WORDS[item.status];
  const listing = statusWord === undefined ? "um anúncio" : `um anúncio ${statusWord}`;
  return marketplaceError(
    `Sua conta do Mercado Livre já tem ${listing} com este código de produto, feito fora do SellBridge (anúncio ${item.id}). Encerre esse anúncio no Mercado Livre e clique em Tentar de novo.`,
    { retryable: false },
  );
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
        "Há muitos anúncios com este código de produto. Confira no Mercado Livre antes de tentar de novo.",
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
      throw marketplaceError(
        "Achamos um anúncio com este código, mas não deu para confirmar que é da sua conta. Confira no Mercado Livre antes de tentar de novo.",
        {
          retryable: false,
        },
      );
    }
    // A closed (or deleted) item never sells again, whoever made it: it neither blocks nor is
    // adopted, and the publication gets a new item.
    if (item.status === ENDED_ITEM_STATUS) {
      continue;
    }
    if (item.seller_custom_field === null || item.seller_custom_field.trim() === "") {
      throw unmarkedItemError(item);
    }
    if (item.seller_custom_field === input.idempotencyKey) {
      matches.push(item);
    }
  }
  if (matches.length > 1 || (matches[0] && !ADOPTABLE_ITEM_STATUSES.includes(matches[0].status))) {
    throw marketplaceError(
      "Achamos anúncios repetidos, ou que não estão ativos nem pausados, no Mercado Livre. Confira no Mercado Livre antes de tentar de novo.",
      { retryable: false },
    );
  }
  const item = matches[0];
  return item ? { externalId: item.id, externalUrl: item.permalink ?? null } : null;
}

function assertRequiredAttributes(
  required: readonly { id: string; name: string }[],
  provided: ReadonlySet<string>,
): void {
  const missing = required.filter(({ id }) => !provided.has(id));
  if (missing.length) {
    throw marketplaceError(
      `Faltam campos que o Mercado Livre exige nesta categoria: ${missing.map(({ name }) => name).join(", ")}. Quem preenche é o fornecedor, no cadastro do produto. Depois, clique em Tentar de novo.`,
      { retryable: false, issues: missing.map(({ id, name }) => `Obrigatório: ${name} (${id})`) },
    );
  }
}

async function readDefinitions(
  context: MercadoLivreContext,
  store: StoreCredentials,
  categoryId: string,
): Promise<FichaAttribute[]> {
  return await requestJson(context, {
    schema: z.array(fichaAttributeSchema),
    path: `/categories/${encodeURIComponent(categoryId)}/attributes`,
    init: { accessToken: store.accessToken },
  });
}

const categoryNameSchema = z.object({ name: z.string().max(255) });

/**
 * The kind fields (see `category-kind.ts`) the supplier left empty, answered by the title, else
 * by the category name. The category is read only when the title answered none.
 */
async function kindAttributesToSend(
  context: MercadoLivreContext,
  store: StoreCredentials,
  item: {
    title: string;
    categoryId: string;
    definitions: readonly FichaAttribute[];
    provided: Readonly<Record<string, string>>;
  },
): Promise<KindAttribute[]> {
  const missing = missingKindDefinitions(item.definitions, item.provided);
  const fromTitle = kindAttributesFromTitle(missing, item.title);
  const answeredIds = new Set(fromTitle.map(({ id }) => id));
  const left = missing.filter(({ id }) => !answeredIds.has(id));
  if (left.length === 0) {
    logFilledKinds(fromTitle, { categoryId: item.categoryId, source: "title" });
    return fromTitle;
  }
  const category = await requestJson(context, {
    schema: categoryNameSchema,
    path: `/categories/${encodeURIComponent(item.categoryId)}`,
    init: { accessToken: store.accessToken },
  });
  const fromCategory = kindAttributesFromCategory(left, category.name);
  logFilledKinds(fromTitle, { categoryId: item.categoryId, source: "title" });
  logFilledKinds(fromCategory, { categoryId: item.categoryId, source: "category" });
  return [...fromTitle, ...fromCategory];
}

function logFilledKinds(
  filled: readonly KindAttribute[],
  context: { categoryId: string; source: "title" | "category" },
): void {
  for (const attribute of filled) {
    logger.info("mercado_livre.kind_attribute_filled", { attributeId: attribute.id, ...context });
  }
}

async function validateAttributes(
  context: MercadoLivreContext,
  store: StoreCredentials,
  item: { body: ReturnType<typeof itemBody>; definitions: readonly FichaAttribute[] },
): Promise<void> {
  const { body, definitions } = item;
  const provided = new Set(
    body.attributes.filter(({ value_name }) => value_name.trim()).map(({ id }) => id),
  );
  assertRequiredAttributes(definitions.filter(isRequiredAttribute), provided);
  if (definitions.some(({ tags }) => tags.conditional_required === true)) {
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
    assertRequiredAttributes(conditional.required_attributes, provided);
  }
  const readOnly = definitions.filter(
    ({ id, tags }) => tags.read_only === true && provided.has(id),
  );
  if (readOnly.length) {
    throw marketplaceError(
      "O cadastro tem campos que o Mercado Livre não aceita receber. Fale com o suporte para corrigir e publique de novo.",
      // The field ids stay in the details, where the team reads which fields to remove.
      { retryable: false, issues: readOnly.map(({ id }) => `Somente leitura: ${id}`) },
    );
  }
}

/**
 * How long a created item may take to show up in the seller's item search. Within it, "not
 * found" is not proof the earlier creation failed.
 */
const CREATION_SETTLE_MILLISECONDS = 10 * 60_000;

/**
 * After an uncertain creation (a timeout or 5xx on POST /items) the item may exist. Search found
 * none: within the settle window that may only be indexing lag, so nothing is created; past it,
 * the creation never landed, the guard is cleared and publishing goes on.
 */
async function confirmEarlierCreationAbsent(
  context: MercadoLivreContext,
  options: PublishOptions | undefined,
): Promise<void> {
  const startedAt = options?.creationStartedAt;
  if (!options || !startedAt) return;
  if (context.now().getTime() - startedAt.getTime() < CREATION_SETTLE_MILLISECONDS) {
    throw marketplaceError(
      "O anúncio pode já ter sido criado, mas ainda não aparece no Mercado Livre. Espere alguns minutos e clique em Tentar de novo: se ele não existir, o SellBridge cria.",
      { retryable: false },
    );
  }
  await options.creationAbsent();
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

/**
 * A grid's colours and sizes only share one page as User Products items (one per combination,
 * same family_name). A seller still on the classic model would get unrelated listings, so the
 * grid is not published there.
 */
const GRID_NEEDS_USER_PRODUCTS =
  "Esta conta do Mercado Livre ainda não usa o modelo de anúncios com cores e tamanhos numa página só. A grade não foi publicada nesta loja.";

/** The item to create, in its category, after the category's required attributes are checked. */
async function checkedItemBody(
  context: MercadoLivreContext,
  store: StoreCredentials,
  input: PublishProductInput,
) {
  const title = input.title.slice(0, MAX_TITLE_LENGTH);
  const categoryId =
    input.mercadoLivreCategoryId ??
    (await predictCategory(context, { title, accessToken: store.accessToken }));
  const definitions = await readDefinitions(context, store, categoryId);
  const seller = await requestJson(context, {
    schema: sellerCapabilitiesSchema,
    path: `/users/${encodeURIComponent(store.externalShopId)}`,
    init: { accessToken: store.accessToken },
  });
  const userProducts = seller.tags.includes("user_product_seller");
  const familyName =
    input.familyName === undefined || input.familyName === null
      ? null
      : input.familyName.slice(0, MAX_TITLE_LENGTH);
  if (familyName !== null && !userProducts) {
    throw marketplaceError(GRID_NEEDS_USER_PRODUCTS, { retryable: false });
  }
  const kindAttributes = await kindAttributesToSend(context, store, {
    title,
    categoryId,
    definitions,
    provided: input.mercadoLivreAttributes ?? {},
  });
  const body = itemBody(input, {
    title,
    familyName,
    categoryId,
    userProducts,
    definitions,
    kindAttributes,
  });
  await validateAttributes(context, store, { body, definitions });
  return body;
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
    // A recovered item may have its description already: replace it, a second POST is refused.
    const descriptionError = await replaceDescription(context, store, {
      externalId: existing.externalId,
      plainText: input.description,
    });
    return { ...existing, descriptionError };
  }
  await confirmEarlierCreationAbsent(context, options);
  const body = await checkedItemBody(context, store, input);
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
  const descriptionError = await postDescription(context, {
    store,
    itemId: item.id,
    plainText: input.description,
  });
  return { externalId: item.id, externalUrl: item.permalink ?? null, descriptionError };
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
  await updateLiveItem(context, { store, externalId: update.externalId }, async () => {
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
  });
}
