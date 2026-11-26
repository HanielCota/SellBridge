import { isNoBrand, normalizedBrandWords } from "@sellbridge/shared/product-brand";
import { readPackageMeasure } from "@sellbridge/shared/shipping-weight";
import { z } from "zod";
import { marketplaceError } from "../errors.ts";
import type { PublishProductInput, StoreCredentials } from "../types.ts";
import { requestShop, type ShopeeContext } from "./client.ts";

const id = z.number().int().positive();
const BRAZILIAN_PORTUGUESE = "pt-br";
const candidateSchema = z.object({ category_id: z.array(id) });
const translatedName = z.object({ language: z.string(), value: z.string() });
const fieldsSchema = z.object({
  list: z.array(
    z.object({
      category_id: id,
      attribute_tree: z
        .array(
          z.object({
            attribute_id: id,
            name: z.string(),
            mandatory: z.boolean(),
            multi_lang: z.array(translatedName).nullish(),
            attribute_info: z.object({ input_type: z.number().int() }),
            attribute_value_list: z
              .array(
                z.object({
                  value_id: id,
                  name: z.string(),
                  multi_lang: z.array(translatedName).nullish(),
                }),
              )
              .nullish(),
          }),
        )
        .nullish(),
    }),
  ),
});

const brandsSchema = z.object({
  brand_list: z.array(
    z.object({
      brand_id: z.number().int().nonnegative(),
      original_brand_name: z.string(),
      display_brand_name: z.string().optional(),
    }),
  ),
  has_next_page: z.boolean(),
  next_offset: z.number().int().optional(),
});

const channelsSchema = z.object({
  logistics_channel_list: z.array(
    z.object({
      logistics_channel_id: id,
      enabled: z.boolean(),
      force_enable: z.boolean().optional(),
      fee_type: z.string(),
      weight_limit: z
        .object({
          item_min_weight: z.number().optional(),
          item_max_weight: z.number().optional(),
        })
        .nullish(),
      item_max_dimension: z
        .object({
          height: z.number().optional(),
          width: z.number().optional(),
          length: z.number().optional(),
          dimension_sum: z.number().optional(),
          unit: z.string().optional(),
        })
        .nullish(),
    }),
  ),
});

const ATTRIBUTE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  BRAND: ["marca", "brand"],
  MODEL: ["modelo", "model"],
  COLOR: ["cor", "color", "colour"],
  MAIN_COLOR: ["cor principal", "main color", "cor", "color"],
  SIZE: ["tamanho", "size"],
  MATERIAL: ["material"],
  GENDER: ["genero", "gender"],
};

function normalizeName(name: string) {
  return normalizedBrandWords(name.replaceAll("_", " "));
}

function categoryFieldValues(attributes: Readonly<Record<string, string>>, name: string) {
  const normalized = normalizeName(name);
  return Object.entries(attributes)
    .find(
      ([key]) =>
        normalizeName(key) === normalized || ATTRIBUTE_ALIASES[key]?.includes(normalized) === true,
    )?.[1]
    ?.trim();
}

export function packageDimensions(input: PublishProductInput) {
  const attributes = input.mercadoLivreAttributes ?? {};
  const height = readPackageMeasure(attributes.SELLER_PACKAGE_HEIGHT ?? "", "cm");
  const width = readPackageMeasure(attributes.SELLER_PACKAGE_WIDTH ?? "", "cm");
  const length = readPackageMeasure(attributes.SELLER_PACKAGE_LENGTH ?? "", "cm");
  if (height === null || width === null || length === null) {
    return undefined;
  }

  return { package_height: height, package_width: width, package_length: length };
}

export async function recommendCategory(
  context: ShopeeContext,
  store: StoreCredentials,
  title: string,
  coverImage: string,
) {
  const result = await requestShop(context, {
    accessToken: store.accessToken,
    shopId: store.externalShopId,
    method: "GET",
    path: "/api/v2/product/category_recommend",
    payload: "response",
    schema: candidateSchema,
    query: { item_name: title, product_cover_image: coverImage },
  });
  const [category] = result.category_id;
  if (category === undefined) {
    throw marketplaceError(
      "A Shopee não encontrou uma categoria. Use um título que identifique o produto.",
      {
        retryable: false,
      },
    );
  }

  return category;
}

type Category = z.output<typeof fieldsSchema>["list"][number];

function listingAttributes(category: Category, attributes: Readonly<Record<string, string>>) {
  return (category.attribute_tree ?? []).flatMap((attribute) => {
    const name =
      attribute.multi_lang?.find((entry) => entry.language.toLowerCase() === BRAZILIAN_PORTUGUESE)
        ?.value ?? attribute.name;
    const source =
      categoryFieldValues(attributes, name) ?? categoryFieldValues(attributes, attribute.name);
    const selected = source
      ? attribute.attribute_value_list?.find((option) =>
          [option.name, ...(option.multi_lang ?? []).map((entry) => entry.value)].some(
            (label) => normalizeName(label) === normalizeName(source),
          ),
        )
      : undefined;
    if (selected !== undefined) {
      return [
        {
          attribute_id: attribute.attribute_id,
          attribute_value_list: [{ value_id: selected.value_id }],
        },
      ];
    }

    if (source && [2, 3, 5].includes(attribute.attribute_info.input_type)) {
      return [
        {
          attribute_id: attribute.attribute_id,
          attribute_value_list: [{ value_id: 0, original_value_name: source }],
        },
      ];
    }

    if (attribute.mandatory) {
      throw marketplaceError(
        `Preencha o atributo “${name}” exigido pela Shopee para este produto.`,
        {
          retryable: false,
        },
      );
    }

    return [];
  });
}

export async function readListingAttributes(
  context: ShopeeContext,
  store: StoreCredentials,
  categoryId: number,
  input: PublishProductInput,
) {
  const response = await requestShop(context, {
    accessToken: store.accessToken,
    shopId: store.externalShopId,
    method: "GET",
    path: "/api/v2/product/get_attribute_tree",
    payload: "response",
    schema: fieldsSchema,
    query: { category_id_list: String(categoryId), language: BRAZILIAN_PORTUGUESE },
  });
  const category = response.list.find((entry) => entry.category_id === categoryId);
  if (category === undefined) {
    throw marketplaceError("A Shopee não informou os atributos da categoria deste produto.", {
      retryable: false,
    });
  }

  return listingAttributes(category, input.mercadoLivreAttributes ?? {});
}

export async function readListingBrand(
  context: ShopeeContext,
  store: StoreCredentials,
  categoryId: number,
  brand: string | undefined,
) {
  if (isNoBrand(brand)) {
    return { brand_id: 0, original_brand_name: "No Brand" };
  }

  const expected = normalizedBrandWords(brand ?? "");
  let offset = 0;
  for (let page = 0; page < 25; page += 1) {
    const result = await requestShop(context, {
      accessToken: store.accessToken,
      shopId: store.externalShopId,
      method: "GET",
      path: "/api/v2/product/get_brand_list",
      payload: "response",
      schema: brandsSchema,
      query: {
        category_id: String(categoryId),
        offset: String(offset),
        page_size: "100",
        status: "1",
        language: BRAZILIAN_PORTUGUESE,
      },
    });
    const match = result.brand_list.find((entry) =>
      [entry.original_brand_name, entry.display_brand_name ?? ""].some(
        (name) => normalizedBrandWords(name) === expected,
      ),
    );
    if (match !== undefined) {
      return { brand_id: match.brand_id, original_brand_name: match.original_brand_name };
    }

    if (!result.has_next_page || result.next_offset === undefined || result.next_offset <= offset) {
      break;
    }

    offset = result.next_offset;
  }

  throw marketplaceError(
    "A marca do produto não foi encontrada na categoria da Shopee. Confira a marca no cadastro.",
    {
      retryable: false,
    },
  );
}

function withinLimit(value: number, maximum: number | undefined): boolean {
  return maximum === undefined || maximum <= 0 || value <= maximum;
}

function canUseChannel(
  channel: z.output<typeof channelsSchema>["logistics_channel_list"][number],
  weight: number,
  dimensions: ReturnType<typeof packageDimensions>,
) {
  if (
    weight < (channel.weight_limit?.item_min_weight ?? 0) ||
    !withinLimit(weight, channel.weight_limit?.item_max_weight)
  ) {
    return false;
  }

  if (channel.fee_type === "FIXED_DEFAULT_PRICE") {
    return true;
  }

  if (channel.fee_type !== "SIZE_INPUT" || dimensions === undefined) {
    return false;
  }

  const limits = channel.item_max_dimension;
  return (
    withinLimit(dimensions.package_height, limits?.height) &&
    withinLimit(dimensions.package_width, limits?.width) &&
    withinLimit(dimensions.package_length, limits?.length) &&
    withinLimit(
      dimensions.package_height + dimensions.package_width + dimensions.package_length,
      limits?.dimension_sum,
    )
  );
}

export async function readListingChannels(
  context: ShopeeContext,
  store: StoreCredentials,
  weight: number,
  dimensions: ReturnType<typeof packageDimensions>,
) {
  const response = await requestShop(context, {
    accessToken: store.accessToken,
    shopId: store.externalShopId,
    method: "GET",
    path: "/api/v2/logistics/get_channel_list",
    payload: "response",
    schema: channelsSchema,
  });
  const active = response.logistics_channel_list.filter((channel) => channel.enabled);
  const usable = active.filter((channel) => canUseChannel(channel, weight, dimensions));
  if (
    usable.length === 0 ||
    active.some((channel) => channel.force_enable && !usable.includes(channel))
  ) {
    throw marketplaceError(
      "Nenhum canal de envio compatível na Shopee. Confira os canais ativos e informe o peso e as dimensões da embalagem.",
      { retryable: false },
    );
  }

  return usable.map((channel) => ({ logistic_id: channel.logistics_channel_id, enabled: true }));
}
