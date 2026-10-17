import { describe, expect, it } from "vitest";
import {
  cnpjSchema,
  formatCnpj,
  formatPhone,
  isValidCnpj,
  phoneSchema,
} from "./account-documents.ts";
import { TERMS_VERSION } from "./terms.ts";

// Item 26.a (L2): the account asks phone, and CNPJ and company for who sells as a company.
describe("CNPJ", () => {
  it("accepts a CNPJ whose check digits match, typed with or without the mask", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(cnpjSchema.parse("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("refuses wrong check digits, repeated digits and the wrong length", () => {
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(cnpjSchema.safeParse("1122233300018").error?.issues[0]?.message).toBe(
      "Informe os 14 caracteres do CNPJ",
    );
  });

  // Review of 26.a: the Receita issues CNPJs with letters since July 2026 (IN RFB 2.229/2024).
  it("accepts the alphanumeric CNPJ, letters in upper case", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjSchema.parse("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
    expect(formatCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });

  it("masks while typing", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("11222")).toBe("11.222");
  });
});

describe("phone", () => {
  it("keeps the digits of a Brazilian mobile or landline with area code", () => {
    expect(phoneSchema.parse("(11) 98765-4321")).toBe("11987654321");
    expect(phoneSchema.parse("31 3333-4444")).toBe("3133334444");
  });

  it("drops the country code of a pasted number", () => {
    expect(phoneSchema.parse("+55 11 98765-4321")).toBe("11987654321");
    expect(formatPhone("+55 11 98765-4321")).toBe("(11) 98765-4321");
  });

  it("refuses a number without area code, an invalid area code or a mobile without the 9", () => {
    expect(phoneSchema.safeParse("98765-4321").success).toBe(false);
    expect(phoneSchema.safeParse("(01) 98765-4321").success).toBe(false);
    expect(phoneSchema.safeParse("(11) 88765-4321").success).toBe(false);
  });

  it("masks while typing", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("3133334444")).toBe("(31) 3333-4444");
    expect(formatPhone("119")).toBe("(11) 9");
  });
});

describe("terms version", () => {
  it("is the date of the terms in force", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
