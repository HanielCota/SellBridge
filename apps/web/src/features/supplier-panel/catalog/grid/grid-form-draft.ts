import { parseCsvMoney } from "@sellbridge/shared/product-csv";
import { withFiscalFallback, type FiscalFallback } from "@sellbridge/shared/product-fiscal";
import {
  gridProblems,
  productGridDraftSchema,
  type ProductGridDraft,
} from "@sellbridge/shared/product-grid";
import { defaultSuggestedPriceCents, keepsNegativeShelfOnly } from "@sellbridge/shared/schemas";
import {
  evaluateCompleteness,
  type CompletenessIssue,
  type CompletenessReport,
  type RequiredAttribute,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import {
  modelDraftValuesSchema,
  type ModelDraftValues,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import {
  fieldErrorsOf,
  filledAttributes,
  fiscalCandidate,
  fiscalForCompleteness,
  parseStockCount,
  type PanelFormValues,
} from "../draft-form";
import { saleTermsInput } from "../sale-terms-form";
import type { GridFormCombination, GridFormState } from "./grid-form-state";

const INVALID_VALUE_MESSAGE = "Valor inválido, revise o campo.";
const NEGATIVE_STOCK_MESSAGE = "O estoque não pode ser negativo. Exemplo: 10";

type Pair = Pick<GridFormCombination, "colorKey" | "sizeKey">;

/** The error key of one value of one combination, as the grid shows it under the input. */
export function combinationField(pair: Pair, field: string): string {
  return `grid.${pair.colorKey ?? "-"}.${pair.sizeKey ?? "-"}.${field}`;
}

/** The barcode belongs to each combination: the model's sheet never sends one. */
function sharedAttributes(values: PanelFormValues): Record<string, string> {
  const { GTIN: _barcode, ...shared } = filledAttributes(values.attributes);
  return shared;
}

function sharedCandidate(values: PanelFormValues) {
  return {
    title: values.title,
    description: values.description,
    categoryId: values.categoryId === "" ? null : values.categoryId,
    imageUrls: [...values.imageUrls],
    mercadoLivreAttributes: sharedAttributes(values),
    mercadoLivreCategoryId: values.mercadoLivreCategory?.id ?? null,
    mercadoLivreCategoryName: values.mercadoLivreCategory?.name ?? null,
    ...saleTermsInput(values.saleTerms),
    fiscal: fiscalCandidate(values.fiscal),
  };
}

function moneyCents(text: string): number {
  return text.trim() === "" ? 0 : (parseCsvMoney(text) ?? Number.NaN);
}

/** The typed price, or the one the cost suggests while none was typed. */
function suggestedPriceOf(typed: string, costCents: number): number {
  if (typed.trim() !== "") {
    return moneyCents(typed);
  }
  return costCents > 0 ? defaultSuggestedPriceCents(costCents) : 0;
}

function names(state: GridFormState) {
  return {
    color: new Map(state.colors.map((color) => [color.key, color.name.trim()])),
    size: new Map(state.sizes.map((size) => [size.key, size.name.trim()])),
  };
}

type CombinationParse =
  | { kind: "skipped" }
  | { kind: "invalid"; errors: Record<string, string> }
  | { kind: "parsed"; combination: ProductGridDraft["combinations"][number] };

/**
 * One combination as the draft sends it. A new one without a SKU waits on screen (it has no key
 * yet); a saved one without a SKU, or a half-typed amount, stops the whole save instead, so no
 * stored combination is dropped by mistake.
 */
function parseCombination(
  combination: GridFormCombination,
  optionNames: ReturnType<typeof names>,
): CombinationParse {
  if (combination.sku.trim() === "" && combination.savedStock === null) {
    return { kind: "skipped" };
  }
  const costCents = moneyCents(combination.cost);
  const suggestedPriceCents = suggestedPriceOf(combination.suggestedPrice, costCents);
  const stock = combination.stock.trim() === "" ? 0 : parseStockCount(combination.stock.trim());
  const errors: Record<string, string> = {};
  if (combination.sku.trim() === "") {
    errors[combinationField(combination, "sku")] = "Preencha o código do produto";
  }
  if (Number.isNaN(costCents)) {
    errors[combinationField(combination, "cost")] = INVALID_VALUE_MESSAGE;
  }
  if (Number.isNaN(suggestedPriceCents)) {
    errors[combinationField(combination, "suggestedPrice")] = INVALID_VALUE_MESSAGE;
  }
  if (Number.isNaN(stock)) {
    errors[combinationField(combination, "stock")] = INVALID_VALUE_MESSAGE;
  }
  if (!Number.isNaN(stock) && !keepsNegativeShelfOnly(stock, combination.savedStock ?? undefined)) {
    errors[combinationField(combination, "stock")] = NEGATIVE_STOCK_MESSAGE;
  }
  if (Object.keys(errors).length > 0) {
    return { kind: "invalid", errors };
  }
  return {
    kind: "parsed",
    combination: {
      color:
        combination.colorKey === null
          ? null
          : (optionNames.color.get(combination.colorKey) ?? null),
      size:
        combination.sizeKey === null ? null : (optionNames.size.get(combination.sizeKey) ?? null),
      sku: combination.sku.trim(),
      gtin: combination.gtin.trim() === "" ? null : combination.gtin.trim(),
      costCents,
      suggestedPriceCents,
      stock,
      netWeightGrams: null,
      ...(combination.savedStock === null ? {} : { expectedStock: combination.savedStock }),
    },
  };
}

function gridCandidate(
  state: GridFormState,
):
  | { ok: true; candidate: unknown; sent: readonly GridFormCombination[] }
  | { ok: false; errors: Record<string, string> } {
  const optionNames = names(state);
  const parsed = state.combinations.map((combination) =>
    parseCombination(combination, optionNames),
  );
  const errors: Record<string, string> = {};
  for (const entry of parsed) {
    if (entry.kind === "invalid") {
      Object.assign(errors, entry.errors);
    }
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const sent = state.combinations.filter((_, index) => parsed[index]?.kind === "parsed");
  return {
    ok: true,
    sent,
    candidate: {
      colors: state.colors.map((color) => ({
        name: color.name,
        imageUrls: [...color.imageUrls],
        ...(color.savedName === null || color.savedName === color.name
          ? {}
          : { previousName: color.savedName }),
      })),
      sizes: state.sizes.map((size) => ({
        name: size.name,
        ...(size.savedName === null || size.savedName === size.name
          ? {}
          : { previousName: size.savedName }),
      })),
      combinations: parsed.flatMap((entry) => (entry.kind === "parsed" ? [entry.combination] : [])),
    },
  };
}

function issueKey(
  path: readonly PropertyKey[],
  sent: readonly GridFormCombination[],
  state: GridFormState,
): string {
  const [list, index, field] = path;
  const position = typeof index === "number" ? index : -1;
  const combination = list === "combinations" ? sent[position] : undefined;
  if (combination !== undefined) {
    return combinationField(combination, String(field));
  }
  const color = list === "colors" ? state.colors[position] : undefined;
  if (color !== undefined) {
    return `grid.color.${color.key}`;
  }
  const size = list === "sizes" ? state.sizes[position] : undefined;
  return size === undefined ? "grid" : `grid.size.${size.key}`;
}

/** Schema issues on the grid, keyed as the grid shows them; rules on the whole grid go on top. */
function gridIssueErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  sent: readonly GridFormCombination[],
  state: GridFormState,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    errors[issueKey(issue.path, sent, state)] ??= issue.message;
  }
  return errors;
}

export type ModelDraftParse =
  | {
      ok: true;
      values: ModelDraftValues;
      grid: ProductGridDraft;
      /** The combinations the draft carries, in its order, so the answer can be matched back. */
      sent: readonly GridFormCombination[];
    }
  | { ok: false; errors: Record<string, string> };

/**
 * The model and grid to autosave. A half-typed amount or a repeated name waits for the next
 * keystroke with the reason under the field, as the single product form does.
 */
export function parseModelDraft(values: PanelFormValues, state: GridFormState): ModelDraftParse {
  const shared = modelDraftValuesSchema.safeParse(sharedCandidate(values));
  const grid = gridCandidate(state);
  if (!grid.ok) {
    return {
      ok: false,
      errors: { ...(shared.success ? {} : fieldErrorsOf(shared.error.issues)), ...grid.errors },
    };
  }
  const parsedGrid = productGridDraftSchema.safeParse(grid.candidate);
  if (shared.success && parsedGrid.success) {
    return { ok: true, values: shared.data, grid: parsedGrid.data, sent: grid.sent };
  }
  return {
    ok: false,
    errors: {
      ...(shared.success ? {} : fieldErrorsOf(shared.error.issues)),
      ...(parsedGrid.success ? {} : gridIssueErrors(parsedGrid.error.issues, grid.sent, state)),
    },
  };
}

const GRID_RULE_MESSAGES: Readonly<Record<string, string>> = {
  sku_required: "Preencha o código de cada combinação",
  cost_required: "Informe o custo de cada combinação",
  stock_required: "Informe o estoque de pelo menos uma combinação",
};

const BARCODE_FIELD = "attributes.GTIN";

/** A rule the single product form asks per product, asked here per combination. */
function asGridIssue(issue: CompletenessIssue): CompletenessIssue {
  if (issue.field === BARCODE_FIELD) {
    return {
      ...issue,
      field: "grid",
      message: "Informe o código de barras (GTIN) de cada combinação",
    };
  }
  const message = GRID_RULE_MESSAGES[issue.rule];
  return message === undefined ? issue : { ...issue, field: "grid", message };
}

function namedGrid(state: GridFormState) {
  const optionNames = names(state);
  return {
    colors: state.colors.map((color) => ({
      name: color.name.trim(),
      imageUrls: [...color.imageUrls],
    })),
    sizes: state.sizes.map((size) => size.name.trim()),
    // A combination still without a SKU gets a placeholder of its own, so it is not "repeated".
    combinations: state.combinations.map((combination, index) => ({
      color:
        combination.colorKey === null
          ? null
          : (optionNames.color.get(combination.colorKey) ?? null),
      size:
        combination.sizeKey === null ? null : (optionNames.size.get(combination.sizeKey) ?? null),
      sku: combination.sku.trim() === "" ? ` ${index}` : combination.sku.trim(),
      gtin: null,
      costCents: 0,
      suggestedPriceCents: 0,
      stock: 0,
      netWeightGrams: null,
    })),
  };
}

function positiveCents(text: string): number {
  const cents = moneyCents(text);
  return Number.isFinite(cents) && cents > 0 ? cents : 0;
}

function positiveUnits(text: string): number {
  const units = parseStockCount(text.trim());
  return Number.isInteger(units) && units > 0 ? units : 0;
}

/**
 * The live score of a grid: the model's shared data as one product, with SKU and cost asked of
 * every combination and stock of at least one, plus the grid's own rules.
 */
export function gridCompleteness(
  values: PanelFormValues,
  state: GridFormState,
  options: { required: readonly RequiredAttribute[]; fallback: FiscalFallback | null },
): CompletenessReport {
  const combinations = state.combinations;
  const costs = combinations.map((combination) => positiveCents(combination.cost));
  const report = evaluateCompleteness(
    {
      sku:
        combinations.length > 0 && combinations.every((entry) => entry.sku.trim() !== "")
          ? "ok"
          : "",
      title: values.title,
      description: values.description,
      costCents: costs.length > 0 && costs.every((cost) => cost > 0) ? Math.min(...costs) : 0,
      stock: combinations.reduce((sum, entry) => sum + positiveUnits(entry.stock), 0),
      categoryId: values.categoryId === "" ? null : values.categoryId,
      imageUrls: values.imageUrls,
      mercadoLivreAttributes: sharedAttributes(values),
      fiscal: withFiscalFallback(fiscalForCompleteness(values.fiscal), options.fallback),
      fiscalRequired: true,
    },
    options.required,
  );
  const gridIssues = gridProblems(namedGrid(state)).map((message): CompletenessIssue => ({
    field: "grid",
    rule: "grid",
    severity: "blocking",
    message,
  }));
  const blocking = [...report.blocking.map(asGridIssue), ...gridIssues];
  return {
    ...report,
    blocking,
    improvements: report.improvements.map(asGridIssue),
    canSubmit: blocking.length === 0,
  };
}
