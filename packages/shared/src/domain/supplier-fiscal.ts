import { z } from "zod";
import { cnpjSchema } from "./account-documents.ts";
import { billingAddressSchema, ibgeCityCodeSchema } from "./billing-address.ts";
import {
  cfopInStateSchema,
  cfopOutOfStateSchema,
  icmsCodeFitsRegime,
  icmsCodeLabel,
  pisCofinsCstSchema,
  productOriginSchema,
  productUnitSchema,
  TAX_REGIMES,
  type TaxRegime,
} from "./product-fiscal.ts";
import { freeText } from "../schemas/common.ts";

/**
 * The supplier's company as its NF-e names it, plus the tax codes its products use unless a
 * product overrides them. Only the supplier's own members and the team read it.
 */

const LEGAL_NAME_MAX_LENGTH = 120;
const STATE_REGISTRATION_EXEMPT = "ISENTO";

/** Digits (2 to 14) or "ISENTO" for a company without a state registration. */
export const stateRegistrationSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) =>
    value === STATE_REGISTRATION_EXEMPT ? value : value.replace(/[.\-/\s]/g, ""),
  )
  .refine(
    (value) => value === STATE_REGISTRATION_EXEMPT || /^\d{2,14}$/.test(value),
    "Informe a inscrição estadual só com números, ou escreva ISENTO",
  );

export const taxRegimeSchema = z.enum(TAX_REGIMES, "Escolha o regime tributário");

export const supplierTaxDefaultsSchema = z.object({
  cfopInState: cfopInStateSchema,
  cfopOutOfState: cfopOutOfStateSchema,
  icmsCode: z.string().trim(),
  pisCofinsCst: pisCofinsCstSchema,
  origin: productOriginSchema,
  unit: productUnitSchema,
});
export type SupplierTaxDefaults = z.infer<typeof supplierTaxDefaultsSchema>;

export const supplierFiscalProfileSchema = z
  .object({
    cnpj: cnpjSchema,
    legalName: freeText()
      .trim()
      .min(2, "Informe a razão social")
      .max(LEGAL_NAME_MAX_LENGTH, `Use até ${LEGAL_NAME_MAX_LENGTH} caracteres`),
    stateRegistration: stateRegistrationSchema,
    regime: taxRegimeSchema,
    address: billingAddressSchema.extend({ ibgeCode: ibgeCityCodeSchema }),
    defaults: supplierTaxDefaultsSchema,
  })
  .superRefine((profile, context) => {
    if (!icmsCodeFitsRegime(profile.defaults.icmsCode, profile.regime)) {
      context.addIssue({
        code: "custom",
        path: ["defaults", "icmsCode"],
        message: `Use um ${icmsCodeLabel(profile.regime)} válido para ${regimeName(profile.regime)}, como ${defaultIcmsCode(profile.regime)}`,
      });
    }
  });
export type SupplierFiscalProfile = z.infer<typeof supplierFiscalProfileSchema>;
export type SupplierFiscalProfileInput = z.input<typeof supplierFiscalProfileSchema>;

/** The regime and default tax codes a supplier's products follow unless one overrides them. */
export type SupplierTaxSetup = Pick<SupplierFiscalProfile, "regime" | "defaults">;

function regimeName(regime: TaxRegime): string {
  return regime === "simples" ? "o Simples Nacional" : "o seu regime";
}

/** The code most suppliers reselling third-party goods use: 102 (Simples) or 00 (others). */
export function defaultIcmsCode(regime: TaxRegime): string {
  return regime === "simples" ? "102" : "00";
}

/** What the form starts with: the usual resale codes from the fiscal report. */
export function suggestedTaxDefaults(regime: TaxRegime): SupplierTaxDefaults {
  return {
    cfopInState: "5102",
    cfopOutOfState: "6102",
    icmsCode: defaultIcmsCode(regime),
    pisCofinsCst: "49",
    origin: 0,
    unit: "UN",
  };
}

/** The stored profile, or null when it is missing or no longer passes the rules. */
export function readSupplierFiscalProfile(stored: unknown): SupplierFiscalProfile | null {
  if (stored === null || stored === undefined) {
    return null;
  }
  const parsed = supplierFiscalProfileSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}
