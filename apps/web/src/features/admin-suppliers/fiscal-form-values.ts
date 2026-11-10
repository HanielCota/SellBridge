import { formatCep } from "@sellbridge/shared/billing-address";
import { formatCnpj } from "@sellbridge/shared/account-documents";
import type { TaxRegime } from "@sellbridge/shared/product-fiscal";
import {
  readSupplierFiscalProfile,
  suggestedTaxDefaults,
} from "@sellbridge/shared/supplier-fiscal";

/**
 * "Dados fiscais da empresa" as typed, flat so the brand and team forms compare it field by
 * field like their other values. Every field is text; the tax defaults start with the usual
 * resale codes so most suppliers only fill in the company.
 */
export interface SupplierFiscalFormValues {
  fiscalCnpj: string;
  fiscalLegalName: string;
  fiscalStateRegistration: string;
  fiscalRegime: TaxRegime;
  fiscalCep: string;
  fiscalStreet: string;
  fiscalNumber: string;
  fiscalComplement: string;
  fiscalNeighborhood: string;
  fiscalCity: string;
  fiscalState: string;
  fiscalIbgeCode: string;
  fiscalCfopInState: string;
  fiscalCfopOutOfState: string;
  fiscalIcmsCode: string;
  fiscalPisCofinsCst: string;
  fiscalOrigin: string;
  fiscalUnit: string;
}

/** The company fields: with all of them empty the supplier has not started its fiscal data. */
const COMPANY_FIELDS = [
  "fiscalCnpj",
  "fiscalLegalName",
  "fiscalStateRegistration",
  "fiscalCep",
  "fiscalStreet",
  "fiscalNumber",
  "fiscalNeighborhood",
  "fiscalCity",
] as const satisfies readonly (keyof SupplierFiscalFormValues)[];

function emptyFiscalValues(): SupplierFiscalFormValues {
  const defaults = suggestedTaxDefaults("simples");
  return {
    fiscalCnpj: "",
    fiscalLegalName: "",
    fiscalStateRegistration: "",
    fiscalRegime: "simples",
    fiscalCep: "",
    fiscalStreet: "",
    fiscalNumber: "",
    fiscalComplement: "",
    fiscalNeighborhood: "",
    fiscalCity: "",
    fiscalState: "",
    fiscalIbgeCode: "",
    fiscalCfopInState: defaults.cfopInState,
    fiscalCfopOutOfState: defaults.cfopOutOfState,
    fiscalIcmsCode: defaults.icmsCode,
    fiscalPisCofinsCst: defaults.pisCofinsCst,
    fiscalOrigin: String(defaults.origin),
    fiscalUnit: defaults.unit,
  };
}

/** The stored profile in the form; a missing or broken one starts from the suggestions. */
export function supplierFiscalFormValues(stored: unknown): SupplierFiscalFormValues {
  const profile = readSupplierFiscalProfile(stored ?? null);
  if (profile === null) {
    return emptyFiscalValues();
  }
  const { address, defaults } = profile;
  return {
    fiscalCnpj: formatCnpj(profile.cnpj),
    fiscalLegalName: profile.legalName,
    fiscalStateRegistration: profile.stateRegistration,
    fiscalRegime: profile.regime,
    fiscalCep: formatCep(address.cep),
    fiscalStreet: address.street,
    fiscalNumber: address.number,
    fiscalComplement: address.complement,
    fiscalNeighborhood: address.neighborhood,
    fiscalCity: address.city,
    fiscalState: address.state,
    fiscalIbgeCode: address.ibgeCode,
    fiscalCfopInState: defaults.cfopInState,
    fiscalCfopOutOfState: defaults.cfopOutOfState,
    fiscalIcmsCode: defaults.icmsCode,
    fiscalPisCofinsCst: defaults.pisCofinsCst,
    fiscalOrigin: String(defaults.origin),
    fiscalUnit: defaults.unit,
  };
}

function originInput(text: string): number | string {
  const trimmed = text.trim();
  return /^\d$/.test(trimmed) ? Number(trimmed) : trimmed;
}

/**
 * What the forms send as `fiscalProfile`: null while the company fields are all empty (nothing
 * started), else the whole profile for the schema to check.
 */
export function fiscalProfileInput(values: SupplierFiscalFormValues) {
  if (COMPANY_FIELDS.every((field) => values[field].trim() === "")) {
    return null;
  }
  return {
    cnpj: values.fiscalCnpj,
    legalName: values.fiscalLegalName,
    stateRegistration: values.fiscalStateRegistration,
    regime: values.fiscalRegime,
    address: {
      cep: values.fiscalCep,
      street: values.fiscalStreet,
      number: values.fiscalNumber,
      complement: values.fiscalComplement,
      neighborhood: values.fiscalNeighborhood,
      city: values.fiscalCity,
      state: values.fiscalState,
      ibgeCode: values.fiscalIbgeCode,
    },
    defaults: {
      cfopInState: values.fiscalCfopInState,
      cfopOutOfState: values.fiscalCfopOutOfState,
      icmsCode: values.fiscalIcmsCode,
      pisCofinsCst: values.fiscalPisCofinsCst,
      origin: originInput(values.fiscalOrigin),
      unit: values.fiscalUnit,
    },
  };
}

const ERROR_FIELDS: Readonly<Record<string, keyof SupplierFiscalFormValues>> = {
  cnpj: "fiscalCnpj",
  legalName: "fiscalLegalName",
  stateRegistration: "fiscalStateRegistration",
  regime: "fiscalRegime",
  "address.cep": "fiscalCep",
  "address.street": "fiscalStreet",
  "address.number": "fiscalNumber",
  "address.complement": "fiscalComplement",
  "address.neighborhood": "fiscalNeighborhood",
  "address.city": "fiscalCity",
  "address.state": "fiscalState",
  // Without the IBGE code the city was typed by hand: the CEP is what fills it.
  "address.ibgeCode": "fiscalCep",
  "defaults.cfopInState": "fiscalCfopInState",
  "defaults.cfopOutOfState": "fiscalCfopOutOfState",
  "defaults.icmsCode": "fiscalIcmsCode",
  "defaults.pisCofinsCst": "fiscalPisCofinsCst",
  "defaults.origin": "fiscalOrigin",
  "defaults.unit": "fiscalUnit",
};

/**
 * The form field a `fiscalProfile` issue points at, from its path inside the profile.
 *
 * @throws {Error} When the path has no field: the profile gained a field the form does not show.
 */
export function fiscalErrorField(path: readonly PropertyKey[]): string {
  const key = path.map(String).join(".");
  const field = ERROR_FIELDS[key];
  if (field === undefined) {
    throw new Error(`No form field for the fiscal profile issue at "${key}"`);
  }
  return field;
}

/** Shown under the CEP when the address has no IBGE code yet. */
export const MISSING_IBGE_CODE_MESSAGE =
  "Busque o endereço pelo CEP: a nota precisa do código da cidade.";
