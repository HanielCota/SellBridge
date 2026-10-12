import { z } from "zod";
import { stateSchema } from "../domain/cep.ts";
import { optionalParameter, withFallback } from "./fallback.ts";

export const MAX_PRODUCT_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_PRODUCT_CSV_ROWS = 1000;
const postgresIntegerSchema = z.number().int().min(0).max(2_147_483_647);
const imageUrlSchema = z.url({ protocol: /^https?$/ });

export const adminSupplierSearchSchema = z.object({
  query: optionalParameter(z.string().trim().max(100)),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(5).max(50).default(20), 20),
});
export type AdminSupplierSearch = z.infer<typeof adminSupplierSearchSchema>;
export const adminSupplierIdSchema = z.object({ supplierId: z.uuid() });
export const adminSupplierProductsSchema = adminSupplierSearchSchema.extend({
  supplierId: z.uuid(),
});

export const supplierCoverageSchema = z.object({
  state: stateSchema,
  city: z.string().trim().min(1).max(120).nullable(),
});

export const adminSupplierValuesSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome").max(150),
    niche: z.string().trim().min(1, "Informe o nicho").max(100),
    description: z.string().trim().max(10_000),
    state: stateSchema,
    city: z.string().trim().min(1, "Informe a cidade").max(120),
    logoUrl: imageUrlSchema.nullable(),
    coverage: z.array(supplierCoverageSchema).min(1, "Informe ao menos uma região").max(200),
  })
  .superRefine(({ coverage }, context) => {
    const seen = new Set<string>();
    for (const [index, region] of coverage.entries()) {
      const key = `${region.state}:${region.city?.toLowerCase() ?? ""}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["coverage", index],
          message: "Cobertura duplicada",
        });
      }
      seen.add(key);
    }
  });
export type AdminSupplierValues = z.infer<typeof adminSupplierValuesSchema>;
export const adminSaveSupplierSchema = adminSupplierValuesSchema.safeExtend({
  supplierId: z.uuid().optional(),
});
export const adminSetSupplierActiveSchema = adminSupplierIdSchema.extend({ active: z.boolean() });

export const adminProductValuesSchema = z.object({
  sku: z.string().trim().min(1, "Informe o SKU").max(100),
  title: z.string().trim().min(1, "Informe o título").max(300),
  description: z.string().trim().max(20_000),
  costCents: postgresIntegerSchema,
  suggestedPriceCents: postgresIntegerSchema,
  stock: postgresIntegerSchema,
  categoryId: z.uuid().nullable(),
  imageUrls: z.array(imageUrlSchema).max(20),
  mercadoLivreAttributes: z
    .record(
      z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/, "Informe o código do atributo, como BRAND"),
      z.string().trim().min(1, "Informe o valor do atributo").max(255),
    )
    .optional(),
});
export type AdminProductValues = z.infer<typeof adminProductValuesSchema>;
export const adminSaveProductSchema = adminProductValuesSchema.extend({
  supplierId: z.uuid(),
  productId: z.uuid().optional(),
});
export const adminSetProductActiveSchema = z.object({
  supplierId: z.uuid(),
  productId: z.uuid(),
  active: z.boolean(),
});
export const adminProductCsvSchema = adminSupplierIdSchema.extend({
  content: z.string().min(1).max(MAX_PRODUCT_CSV_BYTES),
});
export const adminConfirmProductCsvSchema = adminProductCsvSchema.extend({
  previewToken: z.string().regex(/^[a-f0-9]{64}$/),
});
