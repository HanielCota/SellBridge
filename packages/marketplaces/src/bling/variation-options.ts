import {
  MAX_GRID_COMBINATIONS,
  MAX_GRID_OPTION_LENGTH,
  MAX_MODEL_CODE_LENGTH,
  optionKey,
} from "@sellbridge/shared/product-grid";
import { stripAccents } from "@sellbridge/shared/text";

export interface VariationOptions {
  readonly color: string | null;
  readonly size: string | null;
}

/** How Bling suppliers name the two options a grid has: "Numeração" is a shoe's size. */
const AXIS_OF_KEY: ReadonlyMap<string, keyof VariationOptions> = new Map([
  ["cor", "color"],
  ["tamanho", "size"],
  ["numeracao", "size"],
]);

function keyOf(name: string): string {
  return stripAccents(name).trim().toLowerCase();
}

const unfitForGrid = (value: string): boolean =>
  value === "" || value.length > MAX_GRID_OPTION_LENGTH;

/**
 * A variation's colour and size from Bling's name for it ("Cor:Preto;Tamanho:38"); null when it
 * names anything else (Voltagem, Sabor), the same option twice, or a value too long for a grid.
 */
export function readVariationOptions(name: string): VariationOptions | null {
  const options: { color: string | null; size: string | null } = { color: null, size: null };
  for (const part of name.split(";")) {
    if (part.trim() === "") {
      continue;
    }
    const separator = part.indexOf(":");
    if (separator === -1) {
      return null;
    }
    const axis = AXIS_OF_KEY.get(keyOf(part.slice(0, separator)));
    const value = part.slice(separator + 1).trim();
    if (axis === undefined || options[axis] !== null || unfitForGrid(value)) {
      return null;
    }
    options[axis] = value;
  }
  return options.color === null && options.size === null ? null : options;
}

const COLOR_IN_NAME = /(?:^|[\s;])cor\s*:\s*([^;]+)/i;

/**
 * The colour a Bling variation names in its full name ("BABUCHE NUVEM Cor:MARINHO;Tamanho:33/34"
 * is MARINHO), or null when the name has none, one too long to be a colour, or one another
 * option runs into ("Cor:Preto Tamanho:38" has no ";" to tell where the colour ends).
 */
export function colorInBlingName(name: string): string | null {
  const color = COLOR_IN_NAME.exec(name)?.[1]?.trim() ?? "";
  return unfitForGrid(color) || color.includes(":") ? null : color;
}

/** The model's code: the parent's own Bling code, or one made from its Bling id. */
export function blingModelCode(parent: { id: number; codigo?: string | null | undefined }): string {
  const code = parent.codigo?.trim() ?? "";
  if (code === "" || code.length > MAX_MODEL_CODE_LENGTH) {
    return `BLING-${parent.id}`;
  }
  return code;
}

function partly(count: number, total: number): boolean {
  return count > 0 && count < total;
}

/**
 * Whether variations read one by one still fail as a grid: some with a size and some without
 * (or a colour), the same colour and size twice, or more combinations than a grid takes. Such a
 * product comes in one product per variation, as before grids, instead of failing whole.
 */
export function failsAsGrid(options: readonly VariationOptions[]): boolean {
  const colored = options.filter((option) => option.color !== null).length;
  const sized = options.filter((option) => option.size !== null).length;
  const pairs = new Set(
    options.map((option) => `${optionKey(option.color ?? "")}|${optionKey(option.size ?? "")}`),
  );
  return (
    partly(colored, options.length) ||
    partly(sized, options.length) ||
    pairs.size < options.length ||
    options.length > MAX_GRID_COMBINATIONS
  );
}
