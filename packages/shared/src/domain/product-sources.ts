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
    error: "Escolha um fornecedor para vender os produtos dele.",
  });

export type ProductSourceChoice = z.infer<typeof productSourceChoiceSchema>;

/**
 * What the onboarding accepts in the MVP: the platform sells only supplier products, so even a
 * direct call cannot switch an account back to own or mixed products (the modes stay for data).
 */
export const supplierSourceChoiceSchema = productSourceChoiceSchema.refine(
  (choice) => choice.mode === "suppliers",
  { path: ["mode"], error: "Escolha um fornecedor para vender os produtos dele." },
);

export const PRODUCT_SOURCE_LABELS: Record<ProductSourceMode, string> = {
  own: "Meus próprios produtos",
  suppliers: "Produtos de fornecedores",
  both: "Produtos próprios e de fornecedores",
};

export function isProductSourceSetupComplete(
  mode: ProductSourceMode | null,
  hasActiveSupplier: boolean,
  hasLegacyStoreSupplier = false,
): boolean {
  // The MVP sells only supplier products: an old own-only account picks a supplier too.
  if (mode === null || mode === "own") return hasActiveSupplier || hasLegacyStoreSupplier;
  return hasActiveSupplier;
}
