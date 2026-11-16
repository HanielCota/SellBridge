import { describe, expect, test } from "vitest";
import { asaasAccountFormSchema, isoDateFromBrazilian } from "./asaas-account-form";

const TODAY = new Date("2026-11-16T12:00:00Z");

const common = {
  name: "Maria Fornecedora",
  email: "maria@fornecedor.com.br",
  mobilePhone: "(11) 98765-4321",
  postalCode: "01001-000",
  address: "Rua das Flores",
  addressNumber: "100",
  complement: "",
  province: "Centro",
  monthlyIncome: "5.000,00",
};

function parse(input: Record<string, unknown>) {
  return asaasAccountFormSchema(TODAY).safeParse(input);
}

function messages(input: Record<string, unknown>): string[] {
  const result = parse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("isoDateFromBrazilian", () => {
  test("turns dd/mm/aaaa into aaaa-mm-dd", () => {
    expect(isoDateFromBrazilian("31/12/1990")).toBe("1990-12-31");
  });

  test.each(["31/02/1990", "1990-12-31", "3/2/1990", ""])("refuses %s", (typed) => {
    expect(isoDateFromBrazilian(typed)).toBeNull();
  });
});

describe("asaasAccountFormSchema", () => {
  test("reads a person with CPF, keeping digits only and the income in cents", () => {
    const result = parse({
      ...common,
      personType: "person",
      document: "529.982.247-25",
      birthDate: "31/12/1990",
    });

    expect(result.success && result.data).toMatchObject({
      document: "52998224725",
      birthDate: "1990-12-31",
      mobilePhone: "11987654321",
      postalCode: "01001000",
      monthlyIncome: 500_000,
    });
  });

  test("reads a company with CNPJ and its type", () => {
    const result = parse({
      ...common,
      personType: "company",
      document: "11.222.333/0001-81",
      companyType: "MEI",
    });

    expect(result.success && result.data).toMatchObject({
      document: "11222333000181",
      companyType: "MEI",
    });
  });

  test("refuses someone under 18 with the reason", () => {
    const found = messages({
      ...common,
      personType: "person",
      document: "529.982.247-25",
      birthDate: "17/11/2008",
    });

    expect(found).toContain("Informe a data de nascimento como 31/12/1990 (é preciso ter 18 anos)");
  });

  test("accepts someone turning 18 today", () => {
    const result = parse({
      ...common,
      personType: "person",
      document: "529.982.247-25",
      birthDate: "16/11/2008",
    });

    expect(result.success).toBe(true);
  });

  test("refuses a company without its type", () => {
    const found = messages({
      ...common,
      personType: "company",
      document: "11.222.333/0001-81",
      companyType: "",
    });

    expect(found).toContain("Escolha o tipo de empresa");
  });

  test.each(["0,00", "abc", "-10,00"])("refuses a monthly income of %s", (monthlyIncome) => {
    const found = messages({
      ...common,
      monthlyIncome,
      personType: "company",
      document: "11.222.333/0001-81",
      companyType: "MEI",
    });

    expect(found).toContain("Informe quanto entra por mês, como 5.000,00");
  });

  test("refuses a CEP without 8 numbers", () => {
    const found = messages({
      ...common,
      postalCode: "0100",
      personType: "company",
      document: "11.222.333/0001-81",
      companyType: "MEI",
    });

    expect(found).toContain("Informe os 8 números do CEP");
  });
});
