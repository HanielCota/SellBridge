import { z } from "zod";

export const PRODUCT_SOURCE_MODES = ["own", "suppliers", "both"] as const;
export type ProductSourceMode = (typeof PRODUCT_SOURCE_MODES)[number];

export const productSourceChoiceSchema = z
  .object({
    mode: z.enum(PRODUCT_SOURCE_MODES),
    supplierId: z.uuid().nullable().optional(),
  })
  .refine((choice) => choice.mode === "own" || choice.supplierId != null, {
    path: ["supplierId"],
    error: "Choose a supplier for supplier products.",
  });

export type ProductSourceChoice = z.infer<typeof productSourceChoiceSchema>;

export const PRODUCT_SOURCE_LABELS: Record<ProductSourceMode, string> = {
  own: "My own products",
  suppliers: "Supplier products",
  both: "Own and supplier products",
};

export function isProductSourceSetupComplete(
  mode: ProductSourceMode | null,
  hasActiveSupplier: boolean,
  hasLegacyStoreSupplier = false,
): boolean {
  if (mode === "own") return true;
  if (mode === null) return hasActiveSupplier || hasLegacyStoreSupplier;
  return hasActiveSupplier;
}
