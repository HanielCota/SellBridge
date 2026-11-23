import { formatCnpj } from "@sellbridge/shared/account-documents";
import { asaasAccountFormSchema } from "@/features/supplier-payments/asaas-account-form";

/** What the supplier types, as typed (masks applied); the server reads it again with the schema. */
export interface AsaasAccountValues {
  personType: "person" | "company";
  name: string;
  document: string;
  birthDate: string;
  companyType: string;
  email: string;
  mobilePhone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement: string;
  province: string;
  monthlyIncome: string;
}

export type AsaasAccountField = keyof AsaasAccountValues;

export const EMPTY_ASAAS_ACCOUNT: AsaasAccountValues = {
  personType: "company",
  name: "",
  document: "",
  birthDate: "",
  companyType: "",
  email: "",
  mobilePhone: "",
  postalCode: "",
  address: "",
  addressNumber: "",
  complement: "",
  province: "",
  monthlyIncome: "",
};

/**
 * The contract sign-up rules, when on: the account opens only in the company data's CNPJ, which
 * the form starts with, next to its razão social. Null while the rules are off.
 */
export interface ContractAccountRule {
  readonly companyCnpj: string | null;
  readonly companyName: string | null;
}

/** Where the form starts: the company data's CNPJ and razão social while the rules ask for them. */
export function initialAsaasAccount(rule: ContractAccountRule | null): AsaasAccountValues {
  if (rule?.companyCnpj == null) {
    return EMPTY_ASAAS_ACCOUNT;
  }
  return {
    ...EMPTY_ASAAS_ACCOUNT,
    name: rule.companyName ?? "",
    document: formatCnpj(rule.companyCnpj),
  };
}

/** The three steps of opening the account, one group of questions each. */
export const ASAAS_ACCOUNT_STEPS: readonly {
  title: string;
  fields: readonly AsaasAccountField[];
}[] = [
  {
    title: "Quem recebe",
    fields: ["personType", "name", "document", "birthDate", "companyType"],
  },
  {
    title: "Contato e endereço",
    fields: [
      "email",
      "mobilePhone",
      "postalCode",
      "address",
      "addressNumber",
      "complement",
      "province",
    ],
  },
  { title: "Quanto entra por mês", fields: ["monthlyIncome"] },
];

/** What the server takes: only the fields of the chosen kind of account. */
export function asaasAccountPayload(values: AsaasAccountValues) {
  const { birthDate, companyType, ...common } = values;
  return values.personType === "person" ? { ...common, birthDate } : { ...common, companyType };
}

function isAccountField(name: unknown): name is AsaasAccountField {
  return typeof name === "string" && Object.hasOwn(EMPTY_ASAAS_ACCOUNT, name);
}

/** The first problem of each field of one step, in the schema's own words. */
export function stepErrors(
  values: AsaasAccountValues,
  step: number,
  today: Date,
): Partial<Record<AsaasAccountField, string>> {
  const fields = new Set<string>(ASAAS_ACCOUNT_STEPS[step]?.fields ?? []);
  const parsed = asaasAccountFormSchema(today).safeParse(asaasAccountPayload(values));
  if (parsed.success) {
    return {};
  }
  const errors: Partial<Record<AsaasAccountField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (!isAccountField(field) || !fields.has(field) || errors[field] !== undefined) {
      continue;
    }
    errors[field] = issue.message;
  }
  return errors;
}

/** 01001-000 while typing. */
export function formatPostalCode(typed: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** 31/12/1990 while typing. */
export function formatBrazilianDate(typed: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
  return parts.filter((part) => part !== "").join("/");
}
