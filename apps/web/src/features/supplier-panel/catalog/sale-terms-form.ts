import { WARRANTY_TYPES, type WarrantyType } from "@sellbridge/shared/product-sale-terms";

/** Warranty, video, made-to-order time and carrier-only as the form holds them. */
export interface SaleTermsFormValues {
  warrantyType: WarrantyType | "";
  warrantyDays: string;
  videoUrl: string;
  madeToOrder: boolean;
  madeToOrderDays: string;
  carrierOnly: boolean;
}

interface StoredSaleTerms {
  readonly warrantyType?: string | null | undefined;
  readonly warrantyDays?: number | null | undefined;
  readonly videoUrl?: string | null | undefined;
  readonly madeToOrderDays?: number | null | undefined;
  readonly carrierOnly?: boolean | undefined;
}

function knownWarrantyType(stored: string | null | undefined): WarrantyType | "" {
  return WARRANTY_TYPES.find((type) => type === stored) ?? "";
}

function textOf(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export function saleTermsFormValues(product?: StoredSaleTerms | null): SaleTermsFormValues {
  return {
    warrantyType: knownWarrantyType(product?.warrantyType),
    warrantyDays: textOf(product?.warrantyDays),
    videoUrl: product?.videoUrl ?? "",
    madeToOrder: (product?.madeToOrderDays ?? null) !== null,
    madeToOrderDays: textOf(product?.madeToOrderDays),
    carrierOnly: product?.carrierOnly ?? false,
  };
}

/** Whole days; a typo becomes NaN, so the schema names the field instead of saving a guess. */
function daysOrNull(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** The values the draft sends: blanks are null, a switched-off made-to-order clears its days. */
export function saleTermsInput(values: SaleTermsFormValues) {
  const hasWarranty = values.warrantyType === "seller" || values.warrantyType === "factory";
  return {
    warrantyType: values.warrantyType === "" ? null : values.warrantyType,
    warrantyDays: hasWarranty ? daysOrNull(values.warrantyDays) : null,
    videoUrl: values.videoUrl.trim() === "" ? null : values.videoUrl.trim(),
    madeToOrderDays: values.madeToOrder ? daysOrNull(values.madeToOrderDays) : null,
    carrierOnly: values.carrierOnly,
  };
}

/**
 * What is still missing for Mercado Livre to show what the supplier chose. It never blocks the
 * draft from saving: the supplier may be typing the number next.
 */
export function saleTermsMissing(values: SaleTermsFormValues): Record<string, string> {
  const missing: Record<string, string> = {};
  const hasWarranty = values.warrantyType === "seller" || values.warrantyType === "factory";
  if (hasWarranty && values.warrantyDays.trim() === "") {
    missing.warrantyDays = "Informe quantos dias de garantia, como 90.";
  }
  if (values.madeToOrder && values.madeToOrderDays.trim() === "") {
    missing.madeToOrderDays = "Informe em quantos dias o produto fica pronto, como 5.";
  }
  return missing;
}
