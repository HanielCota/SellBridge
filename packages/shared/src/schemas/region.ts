import { z } from "zod";
import { cnpjSchema, phoneSchema, stateRegistrationSchema } from "../domain/account-documents.ts";
import { billingAddressSchema, type BillingAddress } from "../domain/billing-address.ts";
import { isCityOfState } from "../domain/brazilian-states.ts";
import { taxRegimeSchema } from "../domain/product-fiscal.ts";
import { cpfSchema } from "../domain/cpf.ts";
import { TERMS_VERSION } from "../domain/terms.ts";
import { nameSchema } from "./auth.ts";
import { freeText } from "./common.ts";

const COMPANY_NAME_MAX_LENGTH = 120;

/**
 * Who sells as a company: CNPJ and legal name (item 26.a, L2), plus the state registration
 * ("ISENTO" without one) and the tax regime its NF-e carries.
 */
export const companySchema = z.strictObject({
  cnpj: cnpjSchema,
  companyName: freeText()
    .trim()
    .min(2, "Informe a razão social")
    .max(COMPANY_NAME_MAX_LENGTH, `Use até ${COMPANY_NAME_MAX_LENGTH} caracteres`),
  stateRegistration: stateRegistrationSchema,
  regime: taxRegimeSchema,
});

export const COMPANY_CITY_FROM_LIST =
  "Escolha a cidade na lista: a nota fiscal precisa do código dela";

/**
 * Why a company's address cannot go on its NF-e, or null when it can: the note needs the city's
 * IBGE code, and the code must belong to the address's state.
 */
function companyAddressProblem(address: BillingAddress): string | null {
  if (address.ibgeCode === undefined) {
    return COMPANY_CITY_FROM_LIST;
  }
  if (!isCityOfState(address.ibgeCode, address.state)) {
    return `A cidade não é de ${address.state}. Busque o endereço pelo CEP de novo.`;
  }
  return null;
}

/** Invoices need the holder's legal name, so a first name alone is not enough. */
export const fullNameSchema = nameSchema
  .transform((name) => name.replace(/\s+/g, " "))
  .refine((name) => name.split(" ").length >= 2, "Informe nome e sobrenome");

/**
 * Who invoices and charges go to, how to reach them and where to send the bills: the first
 * onboarding step. Strict, so a CPF-only save never carries stray company fields.
 */
export const billingHolderSchema = z
  .strictObject({
    fullName: fullNameSchema,
    cpf: cpfSchema,
    phone: phoneSchema,
    /** Null for who sells as a person. */
    company: companySchema.nullable(),
    address: billingAddressSchema,
  })
  .superRefine((holder, context) => {
    if (holder.company === null) {
      return;
    }
    const problem = companyAddressProblem(holder.address);
    if (problem !== null) {
      context.addIssue({ code: "custom", path: ["address", "city"], message: problem });
    }
  });
export type BillingHolderInput = z.input<typeof billingHolderSchema>;

/** The supplier picked in the second onboarding step: the first shop the tenant connects sells it. */
export const starterSupplierSchema = z.object({ supplierId: z.uuid() });
export type StarterSupplierInput = z.input<typeof starterSupplierSchema>;

/** Accepting the terms of use and privacy policy in force (item 26.a, L4). */
export const termsAcceptanceSchema = z.object({ version: z.literal(TERMS_VERSION) });
export type TermsAcceptanceInput = z.input<typeof termsAcceptanceSchema>;
