import {
  SUPPLIER_SALES_SITUATIONS,
  type SupplierSalesSituation,
} from "@sellbridge/shared/supplier-panel-sales";
import { optionalParameter, periodSearchSchema, withFallback } from "@sellbridge/shared/schemas";
import { z } from "zod";

/**
 * The supplier home's address (item 38): the reseller dashboard's period, plus the product and
 * the situation in place of the store, which the supplier never sees.
 */
export const supplierSalesSearchSchema = periodSearchSchema.omit({ store: true }).extend({
  product: optionalParameter(z.uuid()),
  situation: withFallback(
    z.enum(SUPPLIER_SALES_SITUATIONS).default("sold"),
    "sold" satisfies SupplierSalesSituation,
  ),
});
export type SupplierSalesSearch = z.infer<typeof supplierSalesSearchSchema>;

export const supplierSalesInputSchema = supplierSalesSearchSchema.extend({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
});
