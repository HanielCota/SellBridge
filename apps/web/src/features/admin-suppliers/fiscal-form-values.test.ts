import { supplierFiscalProfileSchema } from "@sellbridge/shared/supplier-fiscal";
import { describe, expect, it } from "vitest";
import { fiscalErrorField, fiscalFormValues, fiscalProfileInput } from "./fiscal-form-values";

const FILLED = {
  ...fiscalFormValues(null),
  fiscalCnpj: "11.222.333/0001-81",
  fiscalLegalName: "Ateliê Divinópolis Confecções Ltda",
  fiscalStateRegistration: "0623079040081",
  fiscalCep: "35500-024",
  fiscalStreet: "Rua Goiás",
  fiscalNumber: "120",
  fiscalNeighborhood: "Centro",
  fiscalCity: "Divinópolis",
  fiscalState: "MG",
  fiscalIbgeCode: "3122306",
};

describe("fiscalFormValues", () => {
  it("starts an empty profile with the usual resale codes", () => {
    expect(fiscalFormValues(null)).toMatchObject({
      fiscalCnpj: "",
      fiscalRegime: "simples",
      fiscalCfopInState: "5102",
      fiscalCfopOutOfState: "6102",
      fiscalIcmsCode: "102",
      fiscalPisCofinsCst: "49",
      fiscalOrigin: "0",
      fiscalUnit: "UN",
    });
  });

  it("shows a stored profile with its masks", () => {
    const stored = supplierFiscalProfileSchema.parse(fiscalProfileInput(FILLED));

    expect(fiscalFormValues(stored)).toMatchObject({
      fiscalCnpj: "11.222.333/0001-81",
      fiscalCep: "35500-024",
      fiscalIbgeCode: "3122306",
    });
  });
});

describe("fiscalProfileInput", () => {
  it("sends nothing while the company fields are empty, even with the suggested codes", () => {
    expect(fiscalProfileInput(fiscalFormValues(null))).toBeNull();
  });

  it("sends a profile the schema accepts once the company is filled in", () => {
    expect(supplierFiscalProfileSchema.safeParse(fiscalProfileInput(FILLED)).success).toBe(true);
  });
});

describe("fiscalErrorField", () => {
  it("points an issue inside the profile at its form field", () => {
    expect(fiscalErrorField(["address", "cep"])).toBe("fiscalCep");
    expect(fiscalErrorField(["defaults", "icmsCode"])).toBe("fiscalIcmsCode");
    expect(fiscalErrorField(["address", "ibgeCode"])).toBe("fiscalCep");
  });
});
