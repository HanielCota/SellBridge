import { z } from "zod";
import { cnpjSchema, stateRegistrationSchema } from "./account-documents.ts";
import { billingAddressSchema, ibgeCityCodeSchema } from "./billing-address.ts";
import { isCityOfState } from "./brazilian-states.ts";
import {
  cfopInStateSchema,
  cfopOutOfStateSchema,
  icmsCodeFitsRegime,
  icmsCodeLabel,
  pisCofinsCstSchema,
  productOriginSchema,
  productUnitSchema,
  taxRegimeSchema,
  type TaxRegime,
} from "./product-fiscal.ts";
import { freeText } from "../schemas/common.ts";
import { invoiceModelSchema } from "./supplier-invoice.ts";

/**
 * The supplier's company as its NF-e names it, plus the tax codes its products use unless a
 * product overrides them. Only the supplier's own members and the team read it.
 */

const LEGAL_NAME_MAX_LENGTH = 120;
/** Out-of-state sale to a final consumer who pays no ICMS (a person, or a company without IE). */
export const DEFAULT_CFOP_OUT_OF_STATE_CONSUMER = "6108";

export const supplierTaxDefaultsSchema = z.object({
  cfopInState: cfopInStateSchema,
  /** Out-of-state sale to a company with a state registration (an ICMS taxpayer). */
  cfopOutOfState: cfopOutOfStateSchema,
  /** Profiles saved before this field existed read the usual code. */
  cfopOutOfStateConsumer: cfopOutOfStateSchema.default(DEFAULT_CFOP_OUT_OF_STATE_CONSUMER),
  icmsCode: z.string().trim(),
  pisCofinsCst: pisCofinsCstSchema,
  origin: productOriginSchema,
  unit: productUnitSchema,
});
export type SupplierTaxDefaults = z.infer<typeof supplierTaxDefaultsSchema>;

/**
 * The CFOPs of the supplier's two notes in venda à ordem (Ajuste SINIEF 3/2024): the remessa to
 * the buyer (5923/6923) and the sale to the reseller (5119/6119; 5118/6118 for goods the supplier
 * makes itself). Settings, so the accountant's answer is a change of value, not of code.
 */
export const onBehalfCfopsSchema = z.object({
  shipmentInState: cfopInStateSchema.default("5923"),
  shipmentOutOfState: cfopOutOfStateSchema.default("6923"),
  saleInState: cfopInStateSchema.default("5119"),
  saleOutOfState: cfopOutOfStateSchema.default("6119"),
});
export type OnBehalfCfops = z.infer<typeof onBehalfCfopsSchema>;

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
    invoiceModel: invoiceModelSchema.default("direct"),
    /** Profiles saved before venda à ordem existed read the usual codes. */
    onBehalfCfops: onBehalfCfopsSchema.default(() => onBehalfCfopsSchema.parse({})),
  })
  .superRefine((profile, context) => {
    if (!isCityOfState(profile.address.ibgeCode, profile.address.state)) {
      context.addIssue({
        code: "custom",
        path: ["address", "ibgeCode"],
        message: `O código da cidade não é de ${profile.address.state}. Busque o endereço pelo CEP de novo.`,
      });
    }
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
    cfopOutOfStateConsumer: DEFAULT_CFOP_OUT_OF_STATE_CONSUMER,
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
