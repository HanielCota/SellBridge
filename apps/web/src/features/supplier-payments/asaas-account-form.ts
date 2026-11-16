import { cnpjSchema, phoneSchema } from "@sellbridge/shared/account-documents";
import { cpfSchema } from "@sellbridge/shared/cpf";
import { parseBrlToCents } from "@sellbridge/shared/money";
import { freeText } from "@sellbridge/shared/schemas";
import { z } from "zod";

/** Asaas's kinds of company (`companyType`). */
export const ASAAS_COMPANY_TYPES = ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"] as const;
export type AsaasCompanyType = (typeof ASAAS_COMPANY_TYPES)[number];

/** The names a supplier knows each kind of company by. */
export const ASAAS_COMPANY_TYPE_LABELS: Readonly<Record<AsaasCompanyType, string>> = {
  MEI: "MEI",
  LIMITED: "Limitada (LTDA)",
  INDIVIDUAL: "Empresário individual (EI)",
  ASSOCIATION: "Associação",
};

const ADULT_AGE_IN_YEARS = 18;
const MAX_MONTHLY_INCOME_CENTS = 10_000_000_000;

/** `dd/mm/aaaa` to `aaaa-mm-dd`, or null when it is not a real calendar day. */
export function isoDateFromBrazilian(typed: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(typed.trim());
  if (match === null) {
    return null;
  }
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
}

function isAdultOn(iso: string, today: Date): boolean {
  const birth = new Date(`${iso}T12:00:00Z`);
  const adultFrom = new Date(birth);
  adultFrom.setUTCFullYear(birth.getUTCFullYear() + ADULT_AGE_IN_YEARS);
  return adultFrom.getTime() <= today.getTime();
}

const textField = (label: string, maximum: number) =>
  freeText()
    .trim()
    .min(1, `Informe ${label}`)
    .max(
      maximum,
      `${label[0]?.toUpperCase() ?? ""}${label.slice(1)} pode ter até ${maximum} caracteres`,
    );

const commonFields = {
  name: textField("o nome", 120),
  email: z.email("Informe um e-mail como nome@empresa.com.br").max(200),
  mobilePhone: phoneSchema,
  postalCode: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 8, { message: "Informe os 8 números do CEP" }),
  address: textField("a rua", 200),
  addressNumber: textField("o número (ou s/n)", 30),
  complement: freeText().trim().max(150, "O complemento pode ter até 150 caracteres").default(""),
  province: textField("o bairro", 100),
  monthlyIncome: z.string().transform((value, context) => {
    const cents = parseBrlToCents(value);
    if (cents === null || cents <= 0 || cents > MAX_MONTHLY_INCOME_CENTS) {
      context.addIssue({
        code: "custom",
        message: "Informe quanto entra por mês, como 5.000,00",
      });
      return z.NEVER;
    }
    return cents;
  }),
};

/**
 * What the supplier fills in on Recebimentos to open its Asaas account: as a person (CPF) or as
 * a company (CNPJ). `today` decides the age check, so tests do not depend on the date.
 */
export function asaasAccountFormSchema(today: Date) {
  const person = z.object({
    ...commonFields,
    personType: z.literal("person"),
    document: cpfSchema,
    birthDate: z.string().transform((value, context) => {
      const iso = isoDateFromBrazilian(value);
      if (iso === null || !isAdultOn(iso, today)) {
        context.addIssue({
          code: "custom",
          message: "Informe a data de nascimento como 31/12/1990 (é preciso ter 18 anos)",
        });
        return z.NEVER;
      }
      return iso;
    }),
  });
  const company = z.object({
    ...commonFields,
    personType: z.literal("company"),
    document: cnpjSchema,
    companyType: z.enum(ASAAS_COMPANY_TYPES, {
      message: "Escolha o tipo de empresa",
    }),
  });
  return z.discriminatedUnion("personType", [person, company]);
}

export type AsaasAccountForm = z.output<ReturnType<typeof asaasAccountFormSchema>>;
export type AsaasAccountFormInput = z.input<ReturnType<typeof asaasAccountFormSchema>>;
