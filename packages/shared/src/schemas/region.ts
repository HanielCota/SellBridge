import { z } from "zod";
import { cnpjSchema, phoneSchema } from "../domain/account-documents.ts";
import { billingAddressSchema } from "../domain/billing-address.ts";
import { cpfSchema } from "../domain/cpf.ts";
import { TERMS_VERSION } from "../domain/terms.ts";
import { nameSchema } from "./auth.ts";
import { freeText } from "./common.ts";

const COMPANY_NAME_MAX_LENGTH = 120;

/** Who sells as a company: CNPJ and its legal name (item 26.a, L2). */
export const companySchema = z.strictObject({
  cnpj: cnpjSchema,
  companyName: freeText()
    .trim()
    .min(2, "Informe a razão social")
    .max(COMPANY_NAME_MAX_LENGTH, `Use até ${COMPANY_NAME_MAX_LENGTH} caracteres`),
});

/** Invoices need the holder's legal name, so a first name alone is not enough. */
export const fullNameSchema = nameSchema
  .transform((name) => name.replace(/\s+/g, " "))
  .refine((name) => name.split(" ").length >= 2, "Informe nome e sobrenome");

/**
 * Who invoices and charges go to, how to reach them and where to send the bills: the first
 * onboarding step. Strict, so a CPF-only save never carries stray company fields.
 */
export const billingHolderSchema = z.strictObject({
  fullName: fullNameSchema,
  cpf: cpfSchema,
  phone: phoneSchema,
  /** Null for who sells as a person. */
  company: companySchema.nullable(),
  address: billingAddressSchema,
});
export type BillingHolderInput = z.input<typeof billingHolderSchema>;

/** The supplier picked in the second onboarding step: the first shop the tenant connects sells it. */
export const starterSupplierSchema = z.object({ supplierId: z.uuid() });
export type StarterSupplierInput = z.input<typeof starterSupplierSchema>;

/** Accepting the terms of use and privacy policy in force (item 26.a, L4). */
export const termsAcceptanceSchema = z.object({ version: z.literal(TERMS_VERSION) });
export type TermsAcceptanceInput = z.input<typeof termsAcceptanceSchema>;
