import { describe, expect, test } from "vitest";
import {
  asaasAccountPayload,
  EMPTY_ASAAS_ACCOUNT,
  formatBrazilianDate,
  formatPostalCode,
  initialAsaasAccount,
  stepErrors,
} from "./asaas-account-fields";

const TODAY = new Date("2026-11-16T12:00:00Z");

describe("formatPostalCode", () => {
  test("adds the dash after five numbers", () => {
    expect(formatPostalCode("01001000")).toBe("01001-000");
  });

  test("keeps eight numbers at most and drops letters", () => {
    expect(formatPostalCode("01a001-0009")).toBe("01001-000");
  });
});

describe("formatBrazilianDate", () => {
  test("adds the slashes while typing", () => {
    expect(formatBrazilianDate("3112")).toBe("31/12");
    expect(formatBrazilianDate("31121990")).toBe("31/12/1990");
  });
});

describe("asaasAccountPayload", () => {
  test("sends the birth date only for a person", () => {
    const payload = asaasAccountPayload({
      ...EMPTY_ASAAS_ACCOUNT,
      personType: "person",
      birthDate: "31/12/1990",
      companyType: "MEI",
    });

    expect(payload).toHaveProperty("birthDate", "31/12/1990");
    expect(payload).not.toHaveProperty("companyType");
  });
});

describe("stepErrors", () => {
  test("shows only the problems of the step on screen", () => {
    const errors = stepErrors(EMPTY_ASAAS_ACCOUNT, 0, TODAY);

    expect(Object.keys(errors).toSorted()).toEqual(["companyType", "document", "name"]);
  });

  test("lets a complete first step through even with the rest empty", () => {
    const errors = stepErrors(
      {
        ...EMPTY_ASAAS_ACCOUNT,
        name: "Fornecedor Teste Ltda",
        document: "11.222.333/0001-81",
        companyType: "LIMITED",
      },
      0,
      TODAY,
    );

    expect(errors).toEqual({});
  });

  test("asks for the monthly income on the last step", () => {
    const errors = stepErrors(EMPTY_ASAAS_ACCOUNT, 2, TODAY);

    expect(errors.monthlyIncome).toBe("Informe quanto entra por mês, como 5.000,00");
  });
});

describe("initialAsaasAccount", () => {
  test("starts with the company data razão social next to its CNPJ", () => {
    const values = initialAsaasAccount({
      companyCnpj: "11222333000181",
      companyName: "Olaria Cunha Ltda",
    });

    expect(values.name).toBe("Olaria Cunha Ltda");
    expect(values.document).toBe("11.222.333/0001-81");
  });

  test("starts empty while the contract rules are off", () => {
    expect(initialAsaasAccount(null)).toEqual(EMPTY_ASAAS_ACCOUNT);
  });
});
