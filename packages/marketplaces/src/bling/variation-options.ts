import { MAX_GRID_OPTION_LENGTH, MAX_MODEL_CODE_LENGTH } from "@sellbridge/shared/product-grid";
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

/** The model's code: the parent's own Bling code, or one made from its Bling id. */
export function blingModelCode(parent: { id: number; codigo?: string | null | undefined }): string {
  const code = parent.codigo?.trim() ?? "";
  if (code === "" || code.length > MAX_MODEL_CODE_LENGTH) {
    return `BLING-${parent.id}`;
  }
  return code;
}
