/**
 * How ready a supplier's product is to be sold. Rules that "block publishing" stop the product
 * from going to review; rules that "improve the listing" only raise the score. Pure: the form
 * runs it on every keystroke and the server runs it again before accepting a submission.
 */

import { findProhibitedProduct, prohibitedProductMessage } from "./prohibited-products.ts";

export type CompletenessSeverity = "blocking" | "improvement";

export interface CompletenessIssue {
  readonly field: string;
  readonly rule: string;
  readonly severity: CompletenessSeverity;
  readonly message: string;
}

export interface CompletenessReport {
  /** 0–100, weighted by rule; 100 means nothing left to fix or improve. */
  readonly score: number;
  readonly blocking: readonly CompletenessIssue[];
  readonly improvements: readonly CompletenessIssue[];
  readonly canSubmit: boolean;
}

export interface CompletenessProduct {
  readonly sku: string;
  readonly title: string;
  readonly description: string;
  readonly costCents: number;
  readonly stock: number;
  readonly categoryId: string | null;
  readonly imageUrls: readonly string[];
  readonly mercadoLivreAttributes: Readonly<Record<string, string>>;
}

export interface RequiredAttribute {
  readonly id: string;
  readonly label: string;
}

export const MIN_TITLE_LENGTH = 10;
export const MIN_DESCRIPTION_LENGTH = 200;
export const RECOMMENDED_IMAGE_COUNT = 3;

const BLOCKING_WEIGHT = 10;
const IMPROVEMENT_WEIGHT = 5;

const PACKAGE_ATTRIBUTES = [
  "SELLER_PACKAGE_WEIGHT",
  "SELLER_PACKAGE_HEIGHT",
  "SELLER_PACKAGE_WIDTH",
  "SELLER_PACKAGE_LENGTH",
] as const;

/**
 * Mercado Livre attributes our categories cannot be listed without. The real list comes from the
 * marketplace per category at publish time (mercado-livre/listings.ts); this keeps the panel from
 * sending products that are certain to be refused.
 */
export const REQUIRED_ATTRIBUTES_BY_CATEGORY_SLUG: Readonly<
  Record<string, readonly RequiredAttribute[]>
> = {
  "moda-feminina": [{ id: "GENDER", label: "Gênero" }],
  "moda-masculina": [{ id: "GENDER", label: "Gênero" }],
  calcados: [
    { id: "GENDER", label: "Gênero" },
    { id: "SIZE", label: "Tamanho" },
  ],
  eletronicos: [
    { id: "BRAND", label: "Marca" },
    { id: "MODEL", label: "Modelo" },
  ],
};

interface Rule {
  readonly field: string;
  readonly rule: string;
  readonly severity: CompletenessSeverity;
  readonly message: string;
  readonly passes: boolean;
}

function blockingRule(field: string, rule: string, message: string, passes: boolean): Rule {
  return { field, rule, severity: "blocking", message, passes };
}

function improvementRule(field: string, rule: string, message: string, passes: boolean): Rule {
  return { field, rule, severity: "improvement", message, passes };
}

function attributeValue(product: CompletenessProduct, id: string): string {
  return (product.mercadoLivreAttributes[id] ?? "").trim();
}

/**
 * Medicines, encapsulated supplements and the other classes the marketplaces refuse. It bars the
 * submission without weighing on the score: a refusal is not a field left to fill in.
 */
function prohibitedIssue(product: CompletenessProduct): CompletenessIssue | null {
  const match = findProhibitedProduct(`${product.title} ${product.description}`);
  if (match === null) {
    return null;
  }
  return {
    field: "title",
    rule: "prohibited_item",
    severity: "blocking",
    message: prohibitedProductMessage(match),
  };
}

function blockingRules(
  product: CompletenessProduct,
  requiredAttributes: readonly RequiredAttribute[],
): Rule[] {
  return [
    blockingRule("sku", "sku_required", "Informe o SKU", product.sku.trim().length > 0),
    blockingRule(
      "title",
      "title_min_length",
      `Use um título com pelo menos ${MIN_TITLE_LENGTH} caracteres`,
      product.title.trim().length >= MIN_TITLE_LENGTH,
    ),
    blockingRule("costCents", "cost_required", "Informe o custo do produto", product.costCents > 0),
    blockingRule("stock", "stock_required", "Informe o estoque disponível", product.stock > 0),
    blockingRule(
      "categoryId",
      "category_required",
      "Escolha a categoria",
      product.categoryId !== null,
    ),
    blockingRule(
      "imageUrls",
      "image_required",
      "Adicione pelo menos 1 imagem",
      product.imageUrls.length > 0,
    ),
    ...requiredAttributes.map((attribute) =>
      blockingRule(
        `attributes.${attribute.id}`,
        "attribute_required",
        `Informe ${attribute.label.toLowerCase()}: o Mercado Livre exige nesta categoria`,
        attributeValue(product, attribute.id).length > 0,
      ),
    ),
  ];
}

function improvementRules(product: CompletenessProduct, requiredIds: ReadonlySet<string>): Rule[] {
  const optionalAttribute = (id: string, label: string): Rule[] =>
    requiredIds.has(id)
      ? []
      : [
          improvementRule(
            `attributes.${id}`,
            `${id.toLowerCase()}_recommended`,
            `Informe ${label}`,
            attributeValue(product, id).length > 0,
          ),
        ];
  const missingPackage = PACKAGE_ATTRIBUTES.find((id) => attributeValue(product, id) === "");
  return [
    improvementRule(
      "description",
      "description_min_length",
      `Escreva uma descrição com pelo menos ${MIN_DESCRIPTION_LENGTH} caracteres`,
      product.description.trim().length >= MIN_DESCRIPTION_LENGTH,
    ),
    improvementRule(
      "imageUrls",
      "images_recommended",
      `Adicione pelo menos ${RECOMMENDED_IMAGE_COUNT} imagens`,
      product.imageUrls.length >= RECOMMENDED_IMAGE_COUNT,
    ),
    ...optionalAttribute("GTIN", "o código de barras (GTIN)"),
    improvementRule(
      `attributes.${missingPackage ?? PACKAGE_ATTRIBUTES[0]}`,
      "package_recommended",
      "Informe peso e medidas da embalagem para calcular o frete",
      missingPackage === undefined,
    ),
    ...optionalAttribute("BRAND", "a marca"),
    ...optionalAttribute("MODEL", "o modelo"),
  ];
}

function toIssue(rule: Rule): CompletenessIssue {
  return { field: rule.field, rule: rule.rule, severity: rule.severity, message: rule.message };
}

function weightOf(rule: Rule): number {
  return rule.severity === "blocking" ? BLOCKING_WEIGHT : IMPROVEMENT_WEIGHT;
}

export function evaluateCompleteness(
  product: CompletenessProduct,
  requiredAttributes: readonly RequiredAttribute[] = [],
): CompletenessReport {
  const requiredIds = new Set(requiredAttributes.map((attribute) => attribute.id));
  const rules = [
    ...blockingRules(product, requiredAttributes),
    ...improvementRules(product, requiredIds),
  ];
  const totalWeight = rules.reduce((sum, rule) => sum + weightOf(rule), 0);
  const passedWeight = rules
    .filter((rule) => rule.passes)
    .reduce((sum, rule) => sum + weightOf(rule), 0);
  const failed = rules.filter((rule) => !rule.passes);
  const prohibited = prohibitedIssue(product);
  const blocking = [
    ...(prohibited === null ? [] : [prohibited]),
    ...failed.filter((rule) => rule.severity === "blocking").map(toIssue),
  ];
  return {
    score: Math.floor((passedWeight / totalWeight) * 100),
    blocking,
    improvements: failed.filter((rule) => rule.severity === "improvement").map(toIssue),
    canSubmit: blocking.length === 0,
  };
}

/** The attributes a category requires, by its slug; unknown or missing slug requires none. */
export function requiredAttributesFor(
  categorySlug: string | null | undefined,
): readonly RequiredAttribute[] {
  if (categorySlug === null || categorySlug === undefined) {
    return [];
  }
  return REQUIRED_ATTRIBUTES_BY_CATEGORY_SLUG[categorySlug] ?? [];
}
