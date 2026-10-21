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
  if (mode === "own") return true;
  if (mode === null) return hasActiveSupplier || hasLegacyStoreSupplier;
  return hasActiveSupplier;
}
