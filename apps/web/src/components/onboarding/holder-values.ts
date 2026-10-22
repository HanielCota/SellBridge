import type { BillingHolder } from "@sellbridge/database/repositories";
import { formatCnpj, formatPhone } from "@sellbridge/shared/account-documents";
import { formatCpf } from "@sellbridge/shared/cpf";
import type { BillingHolderInput } from "@sellbridge/shared/schemas";

export interface HolderFormValues {
  fullName: string;
  cpf: string;
  phone: string;
  isCompany: boolean;
  cnpj: string;
  companyName: string;
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
  };
}

/** Ticking or unticking "Vendo como empresa". */
export function switchHolderType(values: HolderFormValues, isCompany: boolean): HolderFormValues {
  return { ...values, isCompany };
}

/** The form's fields as the server takes them: the company only when the box is ticked. */
export function holderInput(values: HolderFormValues): BillingHolderInput {
  const company = values.isCompany ? { cnpj: values.cnpj, companyName: values.companyName } : null;
  return { fullName: values.fullName, cpf: values.cpf, phone: values.phone, company };
}
