import { describe, expect, it } from "vitest";
import { TERMS_VERSION } from "../domain/terms.ts";
import {
  billingHolderSchema,
  fullNameSchema,
  starterSupplierSchema,
  termsAcceptanceSchema,
} from "./region.ts";

describe("fullNameSchema", () => {
  it("asks for a surname too", () => {
    expect(fullNameSchema.safeParse("Ana").success).toBe(false);
  });

  it("collapses repeated spaces", () => {
    expect(fullNameSchema.parse(" Ana   Souza ")).toBe("Ana Souza");
  });
});

const HOLDER = {
  fullName: "  Ana   Souza Lima ",
  cpf: "529.982.247-25",
  phone: "(11) 98765-4321",
  company: null,
  address: {
    cep: "01310-100",
    street: " Avenida Paulista ",
    number: "s/n",
    complement: "",
    neighborhood: "Bela Vista",
    city: "São Paulo",
    state: "SP",
  },
};

describe("billingHolderSchema", () => {
  it("stores the CPF and phone as digits and the name tidied", () => {
    expect(billingHolderSchema.parse(HOLDER)).toEqual({
      fullName: "Ana Souza Lima",
      cpf: "52998224725",
      phone: "11987654321",
      company: null,
      address: { ...HOLDER.address, cep: "01310100", street: "Avenida Paulista" },
    });
  });

  it("asks for the billing address", () => {
    const { address: _address, ...withoutAddress } = HOLDER;
    expect(billingHolderSchema.safeParse(withoutAddress).success).toBe(false);
  });

  it("rejects a CPF whose check digits do not match", () => {
    const result = billingHolderSchema.safeParse({ ...HOLDER, cpf: "529.982.247-26" });
    expect(result.success).toBe(false);
  });

  // Item 26.a (L2): the account is complete with a phone, and a company for who sells as one.
  it("asks for the phone", () => {
    const { phone: _phone, ...withoutPhone } = HOLDER;
    expect(billingHolderSchema.safeParse(withoutPhone).success).toBe(false);
  });

  it("takes a company only with a valid CNPJ and its name", () => {
    const company = { cnpj: "11.222.333/0001-81", companyName: " Ana Modas Ltda " };
    expect(billingHolderSchema.parse({ ...HOLDER, company }).company).toEqual({
      cnpj: "11222333000181",
      companyName: "Ana Modas Ltda",
    });
    expect(
      billingHolderSchema.safeParse({ ...HOLDER, company: { ...company, cnpj: "11222333000182" } })
        .success,
    ).toBe(false);
    expect(
      billingHolderSchema.safeParse({ ...HOLDER, company: { ...company, companyName: "" } })
        .success,
    ).toBe(false);
  });

  // L2-2: what reaches the server never mixes selling as a person and as a company.
  describe("holder type", () => {
    const company = { cnpj: "11.222.333/0001-81", companyName: "Ana Modas Ltda" };

    it("refuses a CNPJ without the legal name", () => {
      const { companyName: _companyName, ...cnpjOnly } = company;
      for (const candidate of [cnpjOnly, { ...company, companyName: "   " }]) {
        expect(billingHolderSchema.safeParse({ ...HOLDER, company: candidate }).success).toBe(
          false,
        );
      }
      expect(
        billingHolderSchema.safeParse({ ...HOLDER, company: { ...company, companyName: null } })
          .success,
      ).toBe(false);
    });

    it("refuses a legal name without the CNPJ", () => {
      for (const cnpj of ["", "   ", null]) {
        expect(
          billingHolderSchema.safeParse({ ...HOLDER, company: { ...company, cnpj } }).success,
        ).toBe(false);
      }
    });

    it("asks whether the holder sells as a company", () => {
      const { company: _company, ...withoutCompany } = HOLDER;
      expect(billingHolderSchema.safeParse(withoutCompany).success).toBe(false);
    });

    it("refuses company fields sent beside a CPF-only holder", () => {
      for (const stray of [
        { cnpj: company.cnpj },
        { companyName: company.companyName },
        { isCompany: true },
      ]) {
        expect(billingHolderSchema.safeParse({ ...HOLDER, ...stray, company: null }).success).toBe(
          false,
        );
      }
    });

    it("refuses extra fields inside the company", () => {
      const mixed = { ...company, cpf: HOLDER.cpf };
      expect(billingHolderSchema.safeParse({ ...HOLDER, company: mixed }).success).toBe(false);
    });

    it("saves company null for who sells with a CPF", () => {
      expect(billingHolderSchema.parse(HOLDER).company).toBeNull();
    });
  });
});

describe("termsAcceptanceSchema", () => {
  it("accepts only the terms in force", () => {
    expect(termsAcceptanceSchema.safeParse({ version: TERMS_VERSION }).success).toBe(true);
    expect(termsAcceptanceSchema.safeParse({ version: "2020-01-01" }).success).toBe(false);
  });
});

describe("starterSupplierSchema", () => {
  it("accepts only a supplier id", () => {
    expect(starterSupplierSchema.safeParse({ supplierId: "fornecedor" }).success).toBe(false);
    expect(
      starterSupplierSchema.parse({ supplierId: "8f8e7c1a-0000-4000-8000-000000000001" }),
    ).toEqual({ supplierId: "8f8e7c1a-0000-4000-8000-000000000001" });
  });
});
