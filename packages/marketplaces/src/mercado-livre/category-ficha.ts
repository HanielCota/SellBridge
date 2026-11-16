import { z } from "zod";
import type { FetchLike, RetryOptions } from "../http.ts";
import { type MercadoLivreContext, requestJson } from "./client.ts";
import { domainDiscoverySchema } from "./schemas.ts";
import { isPackageAttribute } from "./package-measures.ts";

/**
 * A category's technical sheet ("ficha técnica") as the supplier form shows it (official
 * "Atributos" page). Both endpoints answered without a seller token when checked on 2026-11-16,
 * so the supplier panel reads them before any store is connected.
 */

const SITE_ID = "MLB";
/** Suggestions offered when the supplier changes the category. */
const MAX_CATEGORY_SUGGESTIONS = 3;
/** Longest option list kept per field: Mercado Livre's brand lists run into the thousands. */
const MAX_FIELD_OPTIONS = 200;

const valueSchema = z.object({ id: z.string().max(40), name: z.string().max(255) });

export const fichaAttributeSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(255),
  value_type: z.string().max(40).default("string"),
  tags: z.record(z.string(), z.unknown()).default({}),
  values: z.array(valueSchema).default([]),
  allowed_units: z.array(valueSchema).default([]),
  default_unit: z.string().max(40).optional(),
  value_max_length: z.number().int().positive().optional(),
  hint: z.string().max(2000).optional(),
  example: z.string().max(255).optional(),
});
export type FichaAttribute = z.infer<typeof fichaAttributeSchema>;

const fichaAttributesSchema = z.array(fichaAttributeSchema).max(2000);

export type FichaFieldKind = "text" | "choice" | "yes_no" | "measure";

export interface FichaField {
  readonly id: string;
  readonly label: string;
  readonly kind: FichaFieldKind;
  /** Values Mercado Livre knows: the only ones for "choice", suggestions for "text". */
  readonly options: readonly string[];
  readonly units: readonly string[];
  readonly defaultUnit: string | null;
  readonly required: boolean;
  readonly maxLength: number | null;
  readonly hint: string | null;
  readonly example: string | null;
}

export interface MercadoLivreCategory {
  readonly id: string;
  readonly name: string;
}

export interface CategoryFicha {
  readonly category: MercadoLivreCategory;
  readonly fields: readonly FichaField[];
}

/** Attributes the form asks elsewhere or SellBridge fills itself. */
const MANAGED_ATTRIBUTES = new Set(["SELLER_SKU", "GTIN", "EMPTY_GTIN_REASON", "ITEM_CONDITION"]);
/** Tags of attributes a seller never fills: hidden, Mercado Livre's own or fixed by the category. */
const NOT_FILLED_TAGS = ["hidden", "read_only", "fixed", "inferred", "others"];

function hasTag(attribute: FichaAttribute, tag: string): boolean {
  return attribute.tags[tag] === true;
}

/** Required for a new traditional listing; the rest only raise the listing's quality. */
export function isRequiredAttribute(attribute: FichaAttribute): boolean {
  return hasTag(attribute, "required") || hasTag(attribute, "new_required");
}

function kindOf(attribute: FichaAttribute): FichaFieldKind {
  if (attribute.value_type === "boolean") {
    return "yes_no";
  }
  if (attribute.value_type === "list") {
    return "choice";
  }
  if (attribute.value_type === "number_unit") {
    return "measure";
  }
  return "text";
}

function isFilledBySeller(attribute: FichaAttribute): boolean {
  if (MANAGED_ATTRIBUTES.has(attribute.id) || isPackageAttribute(attribute.id)) {
    return false;
  }
  return !NOT_FILLED_TAGS.some((tag) => hasTag(attribute, tag));
}

function toField(attribute: FichaAttribute): FichaField {
  const kind = kindOf(attribute);
  return {
    id: attribute.id,
    label: attribute.name,
    kind,
    options:
      kind === "yes_no"
        ? ["Sim", "Não"]
        : attribute.values.slice(0, MAX_FIELD_OPTIONS).map((value) => value.name),
    units: attribute.allowed_units.map((unit) => unit.id),
    defaultUnit: attribute.default_unit ?? null,
    required: isRequiredAttribute(attribute),
    maxLength: attribute.value_max_length ?? null,
    hint: attribute.hint ?? null,
    example: attribute.example ?? null,
  };
}

/** The fields a supplier fills, required ones first, each group in Mercado Livre's order. */
export function fichaFields(attributes: readonly FichaAttribute[]): FichaField[] {
  const fields = attributes.filter(isFilledBySeller).map(toField);
  const required = fields.filter((field) => field.required);
  const optional = fields.filter((field) => !field.required);
  return [...required, ...optional];
}

export async function readCategoryAttributes(
  context: MercadoLivreContext,
  categoryId: string,
): Promise<FichaAttribute[]> {
  return await requestJson(context, {
    schema: fichaAttributesSchema,
    path: `/categories/${encodeURIComponent(categoryId)}/attributes`,
  });
}

async function suggestCategories(
  context: MercadoLivreContext,
  title: string,
): Promise<MercadoLivreCategory[]> {
  const query = new URLSearchParams([
    ["limit", String(MAX_CATEGORY_SUGGESTIONS)],
    ["q", title],
  ]);
  const suggestions = await requestJson(context, {
    schema: domainDiscoverySchema,
    path: `/sites/${SITE_ID}/domain_discovery/search?${query.toString()}`,
  });
  return suggestions.map((suggestion) => ({
    id: suggestion.category_id,
    name: suggestion.category_name ?? suggestion.category_id,
  }));
}

export interface MercadoLivreCatalogConfig {
  fetchImplementation?: FetchLike;
  retry?: Partial<RetryOptions>;
}

/** Reads categories and their technical sheets; no seller account is needed. */
export function createMercadoLivreCatalog(config: MercadoLivreCatalogConfig = {}) {
  const context: MercadoLivreContext = {
    config: {
      clientId: undefined,
      clientSecret: undefined,
      ...(config.retry === undefined ? {} : { retry: config.retry }),
    },
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: () => new Date(),
  };
  return {
    suggestCategories: async (title: string) => await suggestCategories(context, title),
    categoryFields: async (categoryId: string) =>
      fichaFields(await readCategoryAttributes(context, categoryId)),
  };
}

export type MercadoLivreCatalog = ReturnType<typeof createMercadoLivreCatalog>;
