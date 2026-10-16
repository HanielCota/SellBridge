import { z } from "zod";
import { cpfSchema } from "../domain/cpf.ts";
import { nameSchema } from "./auth.ts";

/** Invoices need the holder's legal name, so a first name alone is not enough. */
export const fullNameSchema = nameSchema
  .transform((name) => name.replace(/\s+/g, " "))
  .refine((name) => name.split(" ").length >= 2, "Informe nome e sobrenome");

/** Who invoices and charges go to: the first onboarding step. */
export const billingHolderSchema = z.object({
  fullName: fullNameSchema,
  cpf: cpfSchema,
});
export type BillingHolderInput = z.input<typeof billingHolderSchema>;

/** The supplier picked in the second onboarding step: the first shop the tenant connects sells it. */
export const starterSupplierSchema = z.object({ supplierId: z.uuid() });
export type StarterSupplierInput = z.input<typeof starterSupplierSchema>;
