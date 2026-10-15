import { z } from "zod";
import { freeText, pageNumberSchema } from "./common.ts";
import { stateSchema } from "../domain/cep.ts";
import { optionalParameter, withFallback } from "./fallback.ts";
import { LISTING_MAX_PRICE_CENTS } from "./stores.ts";

export const MAX_PRODUCT_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_PRODUCT_CSV_ROWS = 1000;
const postgresIntegerSchema = z.number().int().min(0).max(2_147_483_647);
/** Cost and suggested price stay within what a listing may charge, so every rule can sell it. */
const productPriceCentsSchema = z
  .number()
  .int()
  .min(0)
  .max(LISTING_MAX_PRICE_CENTS, "O valor pode ser de até R$ 1.000.000,00");
const imageUrlSchema = z
  .url({ protocol: /^https?$/ })
  .max(2000, "Use um link de imagem mais curto");
/** Mercado Livre categories ask for a few dozen attributes at most. */
const MAX_MERCADO_LIVRE_ATTRIBUTES = 100;

export const adminSupplierSearchSchema = z.object({
  query: optionalParameter(freeText().trim().max(100)),
  page: withFallback(pageNumberSchema.default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(5).max(50).default(20), 20),
});
export type AdminSupplierSearch = z.infer<typeof adminSupplierSearchSchema>;
export const adminSupplierIdSchema = z.object({ supplierId: z.uuid() });
export const adminSupplierProductsSchema = adminSupplierSearchSchema.extend({
  supplierId: z.uuid(),
});

/** New suppliers get one day to accept a forwarded order and two to dispatch it. */
export const SUPPLIER_SLA_DEFAULTS = { acceptWithinHours: 24, dispatchWithinHours: 48 } as const;
/** A month is the longest deadline a supplier may have, in hours. */
const SUPPLIER_DEADLINE_MAX_HOURS = 720;
const supplierDeadlineSchema = z
  .number("Informe o prazo em horas")
  .int("Use horas inteiras")
  .min(1, "O prazo é de pelo menos 1 hora")
  .max(SUPPLIER_DEADLINE_MAX_HOURS, "O prazo é de até 720 horas (30 dias)");
const supplierContactEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido").max(254))
  .nullable();

/**
 * A supplier as the admin registers it. State and city say where it ships from; any reseller in
 * Brazil sells any supplier, so there is no delivery area to fill in.
 */
export const adminSupplierValuesSchema = z
  .object({
    name: freeText().trim().min(1, "Informe o nome").max(150),
    niche: freeText().trim().min(1, "Informe o nicho").max(100),
    description: freeText().trim().max(10_000),
    state: stateSchema,
    city: freeText().trim().min(1, "Informe a cidade").max(120),
    logoUrl: imageUrlSchema.nullable(),
    contactEmail: supplierContactEmailSchema,
    acceptWithinHours: supplierDeadlineSchema,
    dispatchWithinHours: supplierDeadlineSchema,
  })
  .superRefine(({ acceptWithinHours, dispatchWithinHours }, context) => {
    if (acceptWithinHours > dispatchWithinHours) {
      context.addIssue({
        code: "custom",
        path: ["acceptWithinHours"],
        message: "O prazo para aceitar não pode passar o prazo para despachar",
      });
    }
  });
export type AdminSupplierValues = z.infer<typeof adminSupplierValuesSchema>;
export const adminSaveSupplierSchema = adminSupplierValuesSchema.safeExtend({
  supplierId: z.uuid().optional(),
});
export const adminSetSupplierActiveSchema = adminSupplierIdSchema.extend({ active: z.boolean() });

export const adminProductValuesSchema = z.object({
  sku: freeText().trim().min(1, "Informe o SKU").max(100),
  title: freeText().trim().min(1, "Informe o título").max(300),
  description: freeText().trim().max(20_000),
  costCents: productPriceCentsSchema,
  suggestedPriceCents: productPriceCentsSchema,
  stock: postgresIntegerSchema,
  categoryId: z.uuid().nullable(),
  imageUrls: z.array(imageUrlSchema).max(20),
  mercadoLivreAttributes: z
    .record(
      z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/, "Informe o código do atributo, como BRAND"),
      freeText().trim().min(1, "Informe o valor do atributo").max(255),
    )
    .refine(
      (attributes) => Object.keys(attributes).length <= MAX_MERCADO_LIVRE_ATTRIBUTES,
      `Informe no máximo ${MAX_MERCADO_LIVRE_ATTRIBUTES} atributos`,
    )
    .optional(),
});
export type AdminProductValues = z.infer<typeof adminProductValuesSchema>;
export const adminSaveProductSchema = adminProductValuesSchema.extend({
  supplierId: z.uuid(),
  productId: z.uuid().optional(),
  /** The shelf count the edit form was opened with; sales may have moved it since. */
  expectedStock: postgresIntegerSchema.optional(),
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
