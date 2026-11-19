import { z } from "zod";

/** Refused products kept with their reason; beyond it only the total is kept. */
export const MAX_REFUSED_PRODUCTS_LISTED = 50;

const count = z.number().int().min(0);

const refusedProductSchema = z.object({
  sku: z.string(),
  title: z.string(),
  /** Why the ERP refused it, in the supplier's words. */
  reason: z.string(),
});
export type RefusedErpProduct = z.infer<typeof refusedProductSchema>;

/**
 * What the latest "send what is missing to the ERP" did, as stored on the ERP connection and
 * read back with Zod: the counts and refused products, or why the whole send failed.
 */
export const erpCatalogExportResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("done"),
    created: count,
    alreadyInErp: count,
    refusedTotal: count,
    refused: z.array(refusedProductSchema).max(MAX_REFUSED_PRODUCTS_LISTED),
  }),
  z.object({ kind: z.literal("failed"), reason: z.string() }),
]);
export type ErpCatalogExportResult = z.infer<typeof erpCatalogExportResultSchema>;

/** The stored result, or null when there is none or it no longer matches the schema. */
export function parseErpCatalogExportResult(value: unknown): ErpCatalogExportResult | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = erpCatalogExportResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
