import {
  PRODUCT_ORIGIN_LABELS,
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNITS,
} from "@sellbridge/shared/product-fiscal";
import type { SelectOption } from "./select-field";

export const PRODUCT_ORIGIN_OPTIONS: readonly SelectOption[] = PRODUCT_ORIGIN_LABELS.map(
  (label, origin) => ({ value: String(origin), label }),
);

export const PRODUCT_UNIT_OPTIONS: readonly SelectOption[] = PRODUCT_UNITS.map((unit) => ({
  value: unit,
  label: PRODUCT_UNIT_LABELS[unit],
}));
