import { formatCentsForInput } from "@sellbridge/shared/money";
import { sortSizeNames } from "@sellbridge/shared/product-grid";
import { stripAccents } from "@sellbridge/shared/text";

/**
 * The colour and size grid as the supplier edits it. Colours and sizes carry a key of their own,
 * so a combination keeps its values while its colour is renamed; `savedName` is the name the
 * server holds, so a rename reaches it as a rename and not as a new colour.
 */
export interface GridFormColor {
  readonly key: string;
  readonly name: string;
  readonly savedName: string | null;
  readonly imageUrls: readonly string[];
}

export interface GridFormSize {
  readonly key: string;
  readonly name: string;
  readonly savedName: string | null;
}

/** One combination as typed: every value is text, "" while empty. */
export interface GridFormCombination {
  readonly colorKey: string | null;
  readonly sizeKey: string | null;
  readonly sku: string;
  readonly gtin: string;
  readonly cost: string;
  readonly suggestedPrice: string;
  readonly stock: string;
  /** The stock the server last returned; null for a combination never saved. */
  readonly savedStock: number | null;
}

export interface GridFormState {
  readonly colors: readonly GridFormColor[];
  readonly sizes: readonly GridFormSize[];
  readonly combinations: readonly GridFormCombination[];
}

export type CombinationValues = Pick<
  GridFormCombination,
  "sku" | "gtin" | "cost" | "suggestedPrice" | "stock"
>;

export const EMPTY_GRID_FORM_STATE: GridFormState = { colors: [], sizes: [], combinations: [] };

const BLANK_VALUES: CombinationValues = {
  sku: "",
  gtin: "",
  cost: "",
  suggestedPrice: "",
  stock: "",
};

/** The stored grid, as the server returns it, opened for editing. */
interface StoredGrid {
  readonly colors: readonly { name: string; imageUrls: readonly string[] }[];
  readonly sizes: readonly string[];
  readonly combinations: readonly {
    color: string | null;
    size: string | null;
    sku: string;
    gtin: string | null;
    costCents: number;
    suggestedPriceCents: number;
    stock: number;
    active: boolean;
  }[];
}

function storedKey(axis: "color" | "size", name: string): string {
  return `${axis}:${name}`;
}

export function gridFormStateOf(stored: StoredGrid): GridFormState {
  return {
    colors: stored.colors.map((color) => ({
      key: storedKey("color", color.name),
      name: color.name,
      savedName: color.name,
      imageUrls: color.imageUrls,
    })),
    sizes: stored.sizes.map((name) => ({ key: storedKey("size", name), name, savedName: name })),
    // A combination off sale because it was sold and then taken out is no longer part of the grid.
    combinations: stored.combinations
      .filter((combination) => combination.active)
      .map((combination) => ({
        colorKey: combination.color === null ? null : storedKey("color", combination.color),
        sizeKey: combination.size === null ? null : storedKey("size", combination.size),
        sku: combination.sku,
        gtin: combination.gtin ?? "",
        cost: formatCentsForInput(combination.costCents),
        suggestedPrice: formatCentsForInput(combination.suggestedPriceCents),
        stock: String(combination.stock),
        savedStock: combination.stock,
      })),
  };
}

function nameKey(name: string): string {
  return stripAccents(name).trim().replaceAll(/\s+/g, " ").toLowerCase();
}

/**
 * Compares names as people read them, as the server does: "Preto", "preto " and "Azul  Marinho"
 * against "Azul Marinho" are the same colour.
 */
export function sameOptionName(first: string, second: string): boolean {
  return nameKey(first) === nameKey(second);
}

function blankCombination(colorKey: string | null, sizeKey: string | null): GridFormCombination {
  return { colorKey, sizeKey, ...BLANK_VALUES, savedStock: null };
}

function isPair(combination: GridFormCombination, colorKey: string | null, sizeKey: string | null) {
  return combination.colorKey === colorKey && combination.sizeKey === sizeKey;
}

/**
 * Adds a colour sold in every size. The first colour of a grid that had only sizes takes over
 * the combinations already typed, so nothing typed is lost.
 */
export function withColorAdded(state: GridFormState, name: string, key: string): GridFormState {
  if (state.colors.some((color) => sameOptionName(color.name, name))) {
    return state;
  }
  const colors = [...state.colors, { key, name: name.trim(), savedName: null, imageUrls: [] }];
  const sizeKeys = state.sizes.length === 0 ? [null] : state.sizes.map((size) => size.key);
  if (state.colors.length > 0) {
    return {
      ...state,
      colors,
      combinations: [
        ...state.combinations,
        ...sizeKeys.map((sizeKey) => blankCombination(key, sizeKey)),
      ],
    };
  }
  const takenOver = state.combinations.map((combination) => ({ ...combination, colorKey: key }));
  const missing = sizeKeys
    .filter((sizeKey) => !takenOver.some((combination) => combination.sizeKey === sizeKey))
    .map((sizeKey) => blankCombination(key, sizeKey));
  return { ...state, colors, combinations: [...takenOver, ...missing] };
}

/** Sizes keep their natural order (34, 35… or P, M, G), wherever they were typed. */
function sortedSizes(sizes: readonly GridFormSize[]): GridFormSize[] {
  const order = sortSizeNames(sizes.map((size) => size.name));
  return sizes.toSorted((first, second) => order.indexOf(first.name) - order.indexOf(second.name));
}

/** Adds sizes sold in every colour; the first one takes over a grid that had only colours. */
export function withSizesAdded(
  state: GridFormState,
  added: readonly { name: string; key: string }[],
): GridFormState {
  const fresh = added
    .filter((entry) => !state.sizes.some((size) => sameOptionName(size.name, entry.name)))
    .map((entry) => ({ key: entry.key, name: entry.name.trim(), savedName: null }));
  const [first, ...rest] = fresh;
  if (first === undefined) {
    return state;
  }
  const sizes = sortedSizes([...state.sizes, ...fresh]);
  const colorKeys = state.colors.length === 0 ? [null] : state.colors.map((color) => color.key);
  const everyColor = (size: GridFormSize) =>
    colorKeys.map((colorKey) => blankCombination(colorKey, size.key));
  if (state.sizes.length > 0) {
    return { ...state, sizes, combinations: [...state.combinations, ...fresh.flatMap(everyColor)] };
  }
  const takenOver = state.combinations.map((combination) => ({
    ...combination,
    sizeKey: first.key,
  }));
  const missing = colorKeys
    .filter((colorKey) => !takenOver.some((combination) => combination.colorKey === colorKey))
    .map((colorKey) => blankCombination(colorKey, first.key));
  return {
    ...state,
    sizes,
    combinations: [...takenOver, ...missing, ...rest.flatMap(everyColor)],
  };
}

export function withColorRenamed(state: GridFormState, key: string, name: string): GridFormState {
  return {
    ...state,
    colors: state.colors.map((color) => (color.key === key ? { ...color, name } : color)),
  };
}

export function withSizeRenamed(state: GridFormState, key: string, name: string): GridFormState {
  return {
    ...state,
    sizes: state.sizes.map((size) => (size.key === key ? { ...size, name } : size)),
  };
}

export function withColorPhotos(
  state: GridFormState,
  key: string,
  imageUrls: readonly string[],
): GridFormState {
  return {
    ...state,
    colors: state.colors.map((color) => (color.key === key ? { ...color, imageUrls } : color)),
  };
}

/**
 * Removes a colour and its combinations. Removing the last colour of a grid that has sizes
 * leaves one combination per size, so the grid can still be sold by size alone.
 */
export function withColorRemoved(state: GridFormState, key: string): GridFormState {
  const colors = state.colors.filter((color) => color.key !== key);
  const combinations = state.combinations.filter((combination) => combination.colorKey !== key);
  if (colors.length > 0 || state.sizes.length === 0) {
    return { ...state, colors, combinations };
  }
  return {
    ...state,
    colors,
    combinations: state.sizes.map((size) => blankCombination(null, size.key)),
  };
}

/** Same as `withColorRemoved`, for a size. */
export function withSizeRemoved(state: GridFormState, key: string): GridFormState {
  const sizes = state.sizes.filter((size) => size.key !== key);
  const combinations = state.combinations.filter((combination) => combination.sizeKey !== key);
  if (sizes.length > 0 || state.colors.length === 0) {
    return { ...state, sizes, combinations };
  }
  return {
    ...state,
    sizes,
    combinations: state.colors.map((color) => blankCombination(color.key, null)),
  };
}

/** A colour or size taken out of the grid, with the grid as it was, so it can be put back. */
export interface RemovedOption {
  readonly axis: "color" | "size";
  readonly key: string;
  readonly before: GridFormState;
}

function optionsOf(state: GridFormState, axis: RemovedOption["axis"]) {
  return axis === "color" ? state.colors : state.sizes;
}

function optionKeyOf(combination: GridFormCombination, axis: RemovedOption["axis"]) {
  return axis === "color" ? combination.colorKey : combination.sizeKey;
}

function otherKeyOf(combination: GridFormCombination, axis: RemovedOption["axis"]) {
  return axis === "color" ? combination.sizeKey : combination.colorKey;
}

function withOptionInserted<Option extends { key: string }>(
  options: readonly Option[],
  option: Option,
  index: number,
): Option[] {
  return options.toSpliced(Math.min(index, options.length), 0, option);
}

/**
 * Puts back a removed colour or size with the combinations it took along, over the grid as it is
 * now: whatever was typed since stays. A combination whose other option was removed meanwhile
 * stays out, and nothing comes back when an option of the same name was added meanwhile. When
 * it was the last colour (or size), the stand-in combinations made for the other options give
 * way to the ones it had.
 */
export function withOptionRestored(state: GridFormState, removed: RemovedOption): GridFormState {
  const { axis, key, before } = removed;
  const previous = optionsOf(before, axis);
  const index = previous.findIndex((option) => option.key === key);
  const name = previous[index]?.name;
  const current = optionsOf(state, axis);
  if (name === undefined || current.some((entry) => sameOptionName(entry.name, name))) {
    return state;
  }
  const otherKeys = new Set(
    optionsOf(state, axis === "color" ? "size" : "color").map((entry) => entry.key),
  );
  const restored = before.combinations.filter((combination) => {
    const other = otherKeyOf(combination, axis);
    return optionKeyOf(combination, axis) === key && (other === null || otherKeys.has(other));
  });
  const kept =
    current.length === 0
      ? state.combinations.filter((combination) => optionKeyOf(combination, axis) !== null)
      : state.combinations;
  const combinations = [...kept, ...restored];
  const color = before.colors[index];
  if (axis === "color" && color !== undefined) {
    return { ...state, colors: withOptionInserted(state.colors, color, index), combinations };
  }
  const size = before.sizes[index];
  if (axis === "size" && size !== undefined) {
    return { ...state, sizes: withOptionInserted(state.sizes, size, index), combinations };
  }
  return state;
}

/** Turns one pair of colour and size on (blank values) or off ("Não vendo esta"). */
export function withCombinationToggled(
  state: GridFormState,
  pair: { colorKey: string | null; sizeKey: string | null },
  sold: boolean,
): GridFormState {
  const others = state.combinations.filter(
    (combination) => !isPair(combination, pair.colorKey, pair.sizeKey),
  );
  return {
    ...state,
    combinations: sold ? [...others, blankCombination(pair.colorKey, pair.sizeKey)] : others,
  };
}

export function withCombinationChanged(
  state: GridFormState,
  pair: { colorKey: string | null; sizeKey: string | null },
  change: Partial<CombinationValues>,
): GridFormState {
  return {
    ...state,
    combinations: state.combinations.map((combination) =>
      isPair(combination, pair.colorKey, pair.sizeKey)
        ? { ...combination, ...change }
        : combination,
    ),
  };
}

const SKU_PART_LENGTH = 12;

function skuPart(text: string): string {
  return stripAccents(text)
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, "")
    .slice(0, SKU_PART_LENGTH);
}

/** "TEN-CASUAL" + Preto + 38 → "TEN-CASUAL-PRETO-38". */
export function suggestedSku(base: string, color: string | null, size: string | null): string {
  const options = [color, size]
    .filter((part) => part !== null)
    .map(skuPart)
    .filter((part) => part !== "");
  return [base.trim(), ...options].join("-");
}

/** "Preencher todas": what the supplier typed once, for every combination. */
export interface GridFill {
  readonly skuBase: string;
  readonly cost: string;
  readonly suggestedPrice: string;
  readonly stock: string;
}

/**
 * Fills every combination at once: the code only where none was typed (a SKU is the supplier's
 * own and never replaced), cost, price and stock wherever the fill has a value.
 */
export function withCombinationsFilled(state: GridFormState, fill: GridFill): GridFormState {
  const colorName = new Map(state.colors.map((color) => [color.key, color.name]));
  const sizeName = new Map(state.sizes.map((size) => [size.key, size.name]));
  return {
    ...state,
    combinations: state.combinations.map((combination) => ({
      ...combination,
      sku:
        combination.sku.trim() === "" && fill.skuBase.trim() !== ""
          ? suggestedSku(
              fill.skuBase,
              combination.colorKey === null ? null : (colorName.get(combination.colorKey) ?? null),
              combination.sizeKey === null ? null : (sizeName.get(combination.sizeKey) ?? null),
            )
          : combination.sku,
      cost: fill.cost.trim() === "" ? combination.cost : fill.cost,
      suggestedPrice:
        fill.suggestedPrice.trim() === "" ? combination.suggestedPrice : fill.suggestedPrice,
      stock: fill.stock.trim() === "" ? combination.stock : fill.stock,
    })),
  };
}

/** The combinations as the server stored them, after a save. */
interface StoredCombinationStock {
  readonly color: string | null;
  readonly size: string | null;
  readonly stock: number;
}

function sentName(
  options: readonly { key: string; name: string }[],
  key: string | null,
): string | null {
  if (key === null) {
    return null;
  }
  return options.find((option) => option.key === key)?.name.trim() ?? null;
}

/**
 * Takes in a save's answer without touching what the supplier typed meanwhile: colours and sizes
 * learn the name the server now holds, combinations learn they exist and their stored stock. A
 * count left as it was sent shows the stored one, since a sale may have moved it.
 */
export function withSaveAnswer(
  state: GridFormState,
  sent: { grid: GridFormState; combinations: readonly GridFormCombination[] },
  stored: readonly StoredCombinationStock[],
): GridFormState {
  const storedStock = (combination: GridFormCombination) =>
    stored.find(
      (entry) =>
        entry.color === sentName(sent.grid.colors, combination.colorKey) &&
        entry.size === sentName(sent.grid.sizes, combination.sizeKey),
    );
  return {
    colors: state.colors.map((color) => {
      const name = sentName(sent.grid.colors, color.key);
      return name === null ? color : { ...color, savedName: name };
    }),
    sizes: state.sizes.map((size) => {
      const name = sentName(sent.grid.sizes, size.key);
      return name === null ? size : { ...size, savedName: name };
    }),
    combinations: state.combinations.map((combination) => {
      const sentCombination = sent.combinations.find((entry) =>
        isPair(entry, combination.colorKey, combination.sizeKey),
      );
      const saved = sentCombination === undefined ? undefined : storedStock(sentCombination);
      if (sentCombination === undefined || saved === undefined) {
        return combination;
      }
      const untouched = combination.stock === sentCombination.stock;
      return {
        ...combination,
        savedStock: saved.stock,
        stock: untouched ? String(saved.stock) : combination.stock,
      };
    }),
  };
}
