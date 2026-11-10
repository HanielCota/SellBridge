import { describe, expect, it } from "vitest";
import {
  readSupplierFiscalProfile,
  stateRegistrationSchema,
  suggestedTaxDefaults,
  supplierFiscalProfileSchema,
} from "./supplier-fiscal.ts";

const PROFILE = {
  cnpj: "11.222.333/0001-81",
  legalName: "Ateliê Divinópolis Confecções Ltda",
  stateRegistration: "062.307.904/0081",
  regime: "simples",
  address: {
    cep: "35500-024",
    street: "Rua Goiás",
    number: "120",
    complement: "",
    neighborhood: "Centro",
    city: "Divinópolis",
    state: "MG",
    ibgeCode: "3122306",
  },
  defaults: suggestedTaxDefaults("simples"),
} as const;

describe("stateRegistrationSchema", () => {
  it("keeps the digits of a masked registration", () => {
    expect(stateRegistrationSchema.safeParse("062.307.904/0081")).toEqual({
      success: true,
      data: "0623079040081",
    });
  });

  it("accepts ISENTO in any case", () => {
    expect(stateRegistrationSchema.safeParse("isento")).toEqual({ success: true, data: "ISENTO" });
  });

  it("refuses letters other than ISENTO", () => {
    expect(stateRegistrationSchema.safeParse("ABC123").success).toBe(false);
  });
});

describe("supplierFiscalProfileSchema", () => {
  it("accepts a Simples Nacional company with its suggested defaults", () => {
    const result = supplierFiscalProfileSchema.safeParse(PROFILE);

    expect(result.success).toBe(true);
    expect(result.data?.cnpj).toBe("11222333000181");
  });

  it("refuses a CSOSN for a company outside Simples Nacional", () => {
    const result = supplierFiscalProfileSchema.safeParse({ ...PROFILE, regime: "presumido" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["defaults", "icmsCode"]);
    expect(result.error?.issues[0]?.message).toContain("CST ICMS");
  });

  it("needs the city's IBGE code in the fiscal address", () => {
    const { ibgeCode: _ibgeCode, ...withoutCode } = PROFILE.address;

    const result = supplierFiscalProfileSchema.safeParse({ ...PROFILE, address: withoutCode });

    expect(result.success).toBe(false);
  });
});

describe("readSupplierFiscalProfile", () => {
  it("reads a missing profile as null", () => {
    expect(readSupplierFiscalProfile(null)).toBeNull();
  });

  it("reads a broken stored profile as null instead of failing the page", () => {
    expect(readSupplierFiscalProfile({ cnpj: "1" })).toBeNull();
  });
});
