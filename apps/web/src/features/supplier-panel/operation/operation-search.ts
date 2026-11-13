import { periodSearchSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";

/** The operation row reads the home's period only. */
export const supplierOperationInputSchema = periodSearchSchema.omit({ store: true }).extend({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
});
export type SupplierOperationSearch = Omit<
  z.infer<typeof supplierOperationInputSchema>,
  "supplierId"
>;
