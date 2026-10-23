import type { BillingHolder } from "@sellbridge/database/repositories";
import { formatCnpj, formatPhone } from "@sellbridge/shared/account-documents";
import { formatCep, type BillingAddressInput } from "@sellbridge/shared/billing-address";
import { formatCpf } from "@sellbridge/shared/cpf";
import type { BillingHolderInput } from "@sellbridge/shared/schemas";

/** The address fields as typed: every field is text, the state "" until one is picked. */
export type AddressFormValues = Required<BillingAddressInput>;

export interface HolderFormValues {
  fullName: string;
  cpf: string;
  phone: string;
  isCompany: boolean;
  cnpj: string;
  companyName: string;
  address: AddressFormValues;
}

const EMPTY_ADDRESS: AddressFormValues = {
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

function addressDefaults(holder: BillingHolder | null): AddressFormValues {
  if (holder === null || holder.address === null) {
    return EMPTY_ADDRESS;
  }
  return { ...holder.address, cep: formatCep(holder.address.cep) };
}

export function holderDefaults(
  holder: BillingHolder | null,
  accountName: string,
): HolderFormValues {
  return {
    fullName: holder?.fullName ?? accountName,
    cpf: holder === null ? "" : formatCpf(holder.cpf),
    phone: holder === null || holder.phone === null ? "" : formatPhone(holder.phone),
    isCompany: holder !== null && holder.company !== null,
    cnpj: holder === null || holder.company === null ? "" : formatCnpj(holder.company.cnpj),
    companyName: holder?.company?.companyName ?? "",
    address: addressDefaults(holder),
  };
}

/**
 * Ticking or unticking "Vendo como empresa": a real switch starts the company fields clean, so
 * a CNPJ typed for one mode never lingers into the other and the seller re-enters it on purpose.
 */
export function switchHolderType(values: HolderFormValues, isCompany: boolean): HolderFormValues {
  if (values.isCompany === isCompany) {
    return { ...values };
  }
  return { ...values, isCompany, cnpj: "", companyName: "" };
}

/** Field errors wait for the first save attempt, so nothing is flagged while the user types. */
export function visibleErrors(
  errors: readonly unknown[],
  hasSubmitted: boolean,
): readonly unknown[] {
  return hasSubmitted ? errors : [];
}

/** The form's fields as the server takes them: the company only when the box is ticked. */
export function holderInput(values: HolderFormValues): BillingHolderInput {
  const company = values.isCompany ? { cnpj: values.cnpj, companyName: values.companyName } : null;
  return {
    fullName: values.fullName,
    cpf: values.cpf,
    phone: values.phone,
    company,
    address: values.address,
  };
}
