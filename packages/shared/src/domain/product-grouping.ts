import { z } from "zod";
import { freeText } from "../schemas/common.ts";
import {
  combinationLabel,
  isKnownSizeName,
  MAX_GRID_COMBINATIONS,
  MAX_GRID_OPTION_LENGTH,
  MAX_MODEL_TITLE_LENGTH,
  sortSizeNames,
} from "./product-grid.ts";
import { formatNcm } from "./product-fiscal.ts";
import { stripAccents } from "./text.ts";

/**
 * Grouping products a supplier already has into one grid (decision of 20/11/2026): the screen
 * suggests groups from names, the supplier checks each one and confirms one grid at a time.
 */
export const MAX_GROUPING_PRODUCTS = MAX_GRID_COMBINATIONS;
export const MIN_GROUPING_PRODUCTS = 2;
/** Products of one model share the start of their SKU ("TEN-PRE-38", "TEN-BRA-39"). */
export const SHARED_SKU_PREFIX_LENGTH = 3;

const ENVIO_VELOX_SEPARATOR = " - ";
/** Bling's variation names: "BABUCHE NUVEM Cor:MARINHO;Tamanho:33/34". */
const BLING_OPTIONS_START = /(?:^|\s)(?:cor|tamanho|numera[cç][aã]o)\s*:/iu;
const BLING_AXIS_OF_KEY: ReadonlyMap<string, "color" | "size"> = new Map([
  ["cor", "color"],
  ["tamanho", "size"],
  ["numeracao", "size"],
]);

/** A product's name split into the model's name and its colour and size (null when unread). */
export interface GroupedTitle {
  readonly baseName: string;
  readonly color: string | null;
  readonly size: string | null;
}

interface Options {
  color: string | null;
  size: string | null;
}

const NO_OPTIONS: Options = { color: null, size: null };

function fitsGrid(value: string): boolean {
  return value !== "" && value.length <= MAX_GRID_OPTION_LENGTH;
}

function blingOptions(tail: string): Options {
  const options: Options = { color: null, size: null };
  for (const part of tail.split(";")) {
    if (part.trim() === "") {
      continue;
    }
    const separator = part.indexOf(":");
    if (separator === -1) {
      return NO_OPTIONS;
    }
    const axis = BLING_AXIS_OF_KEY.get(stripAccents(part.slice(0, separator)).trim().toLowerCase());
    const value = part.slice(separator + 1).trim();
    if (axis === undefined || options[axis] !== null || !fitsGrid(value)) {
      return NO_OPTIONS;
    }
    options[axis] = value;
  }
  return options;
}

/** "Azul Marinho 38": the last word is the size when it reads as one, the rest the colour. */
function envioVeloxOptions(tail: string): Options {
  const words = tail.split(/\s+/).filter((word) => word !== "");
  const last = words.at(-1);
  if (last === undefined) {
    return NO_OPTIONS;
  }
  const hasSize = isKnownSizeName(last);
  const color = (hasSize ? words.slice(0, -1) : words).join(" ");
  const size = hasSize ? last : null;
  if ((color !== "" && !fitsGrid(color)) || (size !== null && !fitsGrid(size))) {
    return NO_OPTIONS;
  }
  return { color: color === "" ? null : color, size };
}

/**
 * Reads the model's name, colour and size from a product name in the formats the imports write:
 * "Tênis Casual - Preto 38" (EnvioVelox, the spreadsheet) or "Tênis Casual Cor:Preto;Tamanho:38"
 * (Bling). Null when the name has neither; colour and size are null when the end cannot be read.
 */
export function readGroupedTitle(title: string): GroupedTitle | null {
  const bling = BLING_OPTIONS_START.exec(title);
  if (bling !== null) {
    const baseName = title.slice(0, bling.index).trim();
    const tail = title.slice(bling.index).trim();
    return baseName === "" ? null : { baseName, ...blingOptions(tail) };
  }
  const separator = title.lastIndexOf(ENVIO_VELOX_SEPARATOR);
  if (separator === -1) {
    return null;
  }
  const baseName = title.slice(0, separator).trim();
  const tail = title.slice(separator + ENVIO_VELOX_SEPARATOR.length).trim();
  return baseName === "" ? null : { baseName, ...envioVeloxOptions(tail) };
}

/** What the suggestions need of a product that is not in a grid yet. */
export interface GroupingCandidate {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly categoryId: string | null;
  /** How filled in the product is; the most complete one is the suggested main product. */
  readonly completeness: number;
}

export interface SuggestedProduct<Candidate extends GroupingCandidate> {
  readonly product: Candidate;
  readonly color: string | null;
  readonly size: string | null;
}

export interface GroupingSuggestion<Candidate extends GroupingCandidate> {
  /** Stable while the products stay the same: the screen keys its cards with it. */
  readonly key: string;
  readonly modelTitle: string;
  readonly mainProductId: string;
  readonly products: readonly SuggestedProduct<Candidate>[];
}

function nameKey(name: string): string {
  return stripAccents(name).trim().replaceAll(/\s+/g, " ").toLowerCase();
}

function groupKey(candidate: GroupingCandidate, title: GroupedTitle): string {
  return [
    nameKey(title.baseName),
    candidate.categoryId ?? "",
    candidate.sku.slice(0, SHARED_SKU_PREFIX_LENGTH).toUpperCase(),
  ].join("\u0000");
}

function positionIn(order: readonly string[], name: string | null): number {
  return name === null ? order.length : order.indexOf(name);
}

/** Colour by colour in the order they first appear, each in size order; unread ones last. */
function inGridOrder<Candidate extends GroupingCandidate>(
  products: readonly SuggestedProduct<Candidate>[],
): SuggestedProduct<Candidate>[] {
  const bySku = products.toSorted((first, second) =>
    first.product.sku.localeCompare(second.product.sku),
  );
  const colors = [...new Set(bySku.map((entry) => entry.color).filter((color) => color !== null))];
  const sizes = sortSizeNames([
    ...new Set(bySku.map((entry) => entry.size).filter((size) => size !== null)),
  ]);
  return bySku.toSorted(
    (first, second) =>
      positionIn(colors, first.color) - positionIn(colors, second.color) ||
      positionIn(sizes, first.size) - positionIn(sizes, second.size),
  );
}

function mostComplete<Candidate extends GroupingCandidate>(
  products: readonly SuggestedProduct<Candidate>[],
): Candidate {
  const [first, ...rest] = products;
  if (first === undefined) {
    throw new Error("a grouping suggestion needs at least one product");
  }
  return rest.reduce(
    (best, entry) => (entry.product.completeness > best.completeness ? entry.product : best),
    first.product,
  );
}

/**
 * Groups of products that look like one model in colours and sizes: the same name before the
 * colour and size, the same category and the same start of SKU. Read-only: nothing is grouped
 * until the supplier confirms. Groups of one product or of more than a grid holds are left out.
 * The caller passes only products outside any grid.
 */
export function suggestGroupings<Candidate extends GroupingCandidate>(
  candidates: readonly Candidate[],
): GroupingSuggestion<Candidate>[] {
  const groups = new Map<string, { baseName: string; products: SuggestedProduct<Candidate>[] }>();
  for (const candidate of candidates) {
    const title = readGroupedTitle(candidate.title);
    if (title === null) {
      continue;
    }
    const key = groupKey(candidate, title);
    const entry = { product: candidate, color: title.color, size: title.size };
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { baseName: title.baseName, products: [entry] });
      continue;
    }
    group.products.push(entry);
  }
  return [...groups.values()]
    .filter(
      (group) =>
        group.products.length >= MIN_GROUPING_PRODUCTS &&
        group.products.length <= MAX_GROUPING_PRODUCTS,
    )
    .map((group) => {
      const products = inGridOrder(group.products);
      return {
        key: products.map((entry) => entry.product.id).join(","),
        modelTitle: group.baseName.slice(0, MAX_MODEL_TITLE_LENGTH),
        mainProductId: mostComplete(products).id,
        products,
      };
    })
    .toSorted(
      (first, second) =>
        second.products.length - first.products.length ||
        first.modelTitle.localeCompare(second.modelTitle),
    );
}

const optionNameSchema = freeText()
  .trim()
  .max(MAX_GRID_OPTION_LENGTH, `Use até ${MAX_GRID_OPTION_LENGTH} letras`)
  .transform((value) => (value === "" ? null : value))
  .nullable();

/** What the supplier confirms: one grid, the products checked and their colour and size. */
export const groupProductsSchema = z.object({
  supplierId: z.uuid(),
  modelTitle: freeText()
    .trim()
    .min(1, "Informe o nome do modelo. Exemplo: Tênis Casual")
    .max(MAX_MODEL_TITLE_LENGTH, `Use até ${MAX_MODEL_TITLE_LENGTH} caracteres no nome`),
  mainProductId: z.uuid(),
  products: z
    .array(z.object({ productId: z.uuid(), color: optionNameSchema, size: optionNameSchema }))
    .min(MIN_GROUPING_PRODUCTS, `Marque pelo menos ${MIN_GROUPING_PRODUCTS} produtos`)
    .max(MAX_GROUPING_PRODUCTS, `Junte até ${MAX_GROUPING_PRODUCTS} produtos numa grade`),
});
export type GroupProductsInput = z.infer<typeof groupProductsSchema>;

/** The NF-e data a grid shares: one model has one NCM, origin and unit. */
export interface SharedFiscal {
  readonly ncm: string | null;
  readonly origin: number | null;
  readonly unit: string | null;
}

/** A product as the checks read it: what the supplier typed and what it already holds. */
export interface GroupingProduct {
  readonly productId: string;
  readonly sku: string;
  readonly color: string | null;
  readonly size: string | null;
  readonly categoryId: string | null;
  /** With the brand's origin and unit filling the product's empty ones, as the NF-e reads it. */
  readonly fiscal: SharedFiscal;
}

export interface GroupingProblems {
  /** About the whole group: the model's name, how many products, the main product. */
  readonly general: readonly string[];
  /** Shown next to each product, by product id. */
  readonly byProduct: Readonly<Record<string, readonly string[]>>;
}

function shown(value: string | number | null, format: (value: string) => string): string {
  return value === null ? "vazio" : format(String(value));
}

function fiscalProblems(product: GroupingProduct, main: GroupingProduct): string[] {
  const fields = [
    { label: "NCM", own: product.fiscal.ncm, main: main.fiscal.ncm, format: formatNcm },
    { label: "Origem", own: product.fiscal.origin, main: main.fiscal.origin, format: String },
    { label: "Unidade", own: product.fiscal.unit, main: main.fiscal.unit, format: String },
  ];
  return fields
    .filter((field) => field.own !== field.main)
    .map(
      (field) =>
        `${field.label} diferente do produto principal (${shown(field.own, field.format)} aqui, ${shown(field.main, field.format)} no principal). Corrija este produto antes de juntar.`,
    );
}

function pairKey(product: GroupingProduct): string {
  return `${nameKey(product.color ?? "")}\u0000${nameKey(product.size ?? "")}`;
}

function axisProblems(product: GroupingProduct, axes: { color: boolean; size: boolean }): string[] {
  if (product.color === null && product.size === null) {
    return ["Informe a cor, o tamanho ou os dois"];
  }
  return [
    ...(axes.color && product.color === null ? ["Informe a cor, como nos outros produtos"] : []),
    ...(axes.size && product.size === null ? ["Informe o tamanho, como nos outros produtos"] : []),
  ];
}

function generalProblems(input: {
  modelTitle: string;
  mainProductId: string;
  products: readonly GroupingProduct[];
}): string[] {
  const { products } = input;
  const title = input.modelTitle.trim();
  return [
    ...(title === "" ? ["Informe o nome do modelo"] : []),
    ...(title.length > MAX_MODEL_TITLE_LENGTH
      ? [`Use até ${MAX_MODEL_TITLE_LENGTH} caracteres no nome do modelo`]
      : []),
    ...(products.length < MIN_GROUPING_PRODUCTS
      ? [`Marque pelo menos ${MIN_GROUPING_PRODUCTS} produtos`]
      : []),
    ...(products.length > MAX_GROUPING_PRODUCTS
      ? [`Junte até ${MAX_GROUPING_PRODUCTS} produtos numa grade (marcados: ${products.length})`]
      : []),
    ...(products.some((product) => product.productId === input.mainProductId)
      ? []
      : ["Escolha o produto principal entre os marcados"]),
    ...(new Set(products.map((product) => product.categoryId)).size > 1
      ? ["Os produtos estão em categorias diferentes: deixe todos na mesma categoria antes"]
      : []),
  ];
}

/**
 * Everything that stops these products from becoming one grid, in words the supplier acts on:
 * a missing or repeated colour and size, and NCM, origin or unit different from the main
 * product's (a model has one fiscal record, so the supplier fixes the product first).
 */
export function groupingProblems(input: {
  modelTitle: string;
  mainProductId: string;
  products: readonly GroupingProduct[];
}): GroupingProblems {
  const { products } = input;
  const main = products.find((product) => product.productId === input.mainProductId);
  const axes = {
    color: products.some((product) => product.color !== null),
    size: products.some((product) => product.size !== null),
  };
  const firstOfPair = new Map<string, GroupingProduct>();
  const byProduct: Record<string, string[]> = {};
  for (const product of products) {
    const repeated = firstOfPair.get(pairKey(product));
    const problems = [
      ...axisProblems(product, axes),
      ...(repeated === undefined || (product.color === null && product.size === null)
        ? []
        : [
            `${combinationLabel(product.color, product.size)} já é o código ${repeated.sku}: corrija a cor ou o tamanho`,
          ]),
      ...(main === undefined ? [] : fiscalProblems(product, main)),
    ];
    if (repeated === undefined) {
      firstOfPair.set(pairKey(product), product);
    }
    if (problems.length > 0) {
      byProduct[product.productId] = problems;
    }
  }
  return { general: generalProblems(input), byProduct };
}

/** True when nothing stops the grouping. */
export function canGroup(problems: GroupingProblems): boolean {
  return problems.general.length === 0 && Object.keys(problems.byProduct).length === 0;
}

/** "8 produtos → 1 produto com 2 cores e 4 tamanhos". */
export function groupingSummary(
  products: readonly { color: string | null; size: string | null }[],
): string {
  const colors = new Set(
    products.flatMap((product) => (product.color === null ? [] : [nameKey(product.color)])),
  );
  const sizes = new Set(
    products.flatMap((product) => (product.size === null ? [] : [nameKey(product.size)])),
  );
  const options = [
    ...(colors.size === 0 ? [] : [`${colors.size} ${colors.size === 1 ? "cor" : "cores"}`]),
    ...(sizes.size === 0 ? [] : [`${sizes.size} ${sizes.size === 1 ? "tamanho" : "tamanhos"}`]),
  ];
  const count = `${products.length} ${products.length === 1 ? "produto" : "produtos"}`;
  return options.length === 0
    ? `${count} → 1 produto`
    : `${count} → 1 produto com ${options.join(" e ")}`;
}
