import { environment } from "./environment";

/**
 * Colour and size grids are on (PRODUCT_GRID_ENABLED, decision of 19/11/2026). Off, the
 * spreadsheet has no grid columns and the grid form answers as missing.
 */
export function productGridEnabled(): boolean {
  return environment.PRODUCT_GRID_ENABLED;
}
