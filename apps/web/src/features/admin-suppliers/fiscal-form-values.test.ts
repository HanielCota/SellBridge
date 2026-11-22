import { supplierFiscalProfileSchema } from "@sellbridge/shared/supplier-fiscal";
import { describe, expect, it } from "vitest";
import {
  fiscalErrorField,
  supplierFiscalFormValues,
  fiscalProfileInput,
} from "./fiscal-form-values";

const FILLED = {
  ...supplierFiscalFormValues(null),
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

describe("supplierFiscalFormValues", () => {
  it("starts an empty profile with the usual resale codes", () => {
    expect(supplierFiscalFormValues(null)).toMatchObject({
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

    expect(supplierFiscalFormValues(stored)).toMatchObject({
      fiscalCnpj: "11.222.333/0001-81",
      fiscalCep: "35500-024",
      fiscalIbgeCode: "3122306",
    });
  });
});

describe("fiscalProfileInput", () => {
  it("sends nothing while the company fields are empty, even with the suggested codes", () => {
    expect(fiscalProfileInput(supplierFiscalFormValues(null))).toBeNull();
  });

  it("sends a profile the schema accepts once the company is filled in", () => {
    expect(supplierFiscalProfileSchema.safeParse(fiscalProfileInput(FILLED)).success).toBe(true);
  });
});

describe("venda à ordem CFOPs", () => {
  it("starts with the usual remessa and sale codes", () => {
    expect(supplierFiscalFormValues(null)).toMatchObject({
      fiscalOnBehalfShipmentInState: "5923",
      fiscalOnBehalfShipmentOutOfState: "6923",
      fiscalOnBehalfSaleInState: "5119",
      fiscalOnBehalfSaleOutOfState: "6119",
    });
  });

  it("keeps the codes of a supplier who makes its goods after saving and reading back", () => {
    const own = {
      ...FILLED,
      fiscalOnBehalfSaleInState: "5118",
      fiscalOnBehalfSaleOutOfState: "6118",
    };

    const stored = supplierFiscalProfileSchema.parse(fiscalProfileInput(own));

    expect(supplierFiscalFormValues(stored)).toMatchObject({
      fiscalOnBehalfSaleInState: "5118",
      fiscalOnBehalfSaleOutOfState: "6118",
    });
  });

  it("points a wrong venda à ordem code at its field", () => {
    const parsed = supplierFiscalProfileSchema.safeParse(
      fiscalProfileInput({ ...FILLED, fiscalOnBehalfShipmentOutOfState: "5923" }),
    );

    const [issue] = parsed.error?.issues ?? [];
    expect(issue?.message).toBe("Use um CFOP para outro estado com 4 números, como 6923");
    expect(fiscalErrorField(issue?.path ?? [])).toBe("fiscalOnBehalfShipmentOutOfState");
  });
});

describe("fiscalErrorField", () => {
  it("points an issue inside the profile at its form field", () => {
    expect(fiscalErrorField(["address", "cep"])).toBe("fiscalCep");
    expect(fiscalErrorField(["defaults", "icmsCode"])).toBe("fiscalIcmsCode");
    expect(fiscalErrorField(["address", "ibgeCode"])).toBe("fiscalCep");
  });

  it("has a form field for every issue of a profile left almost blank", () => {
    const input = fiscalProfileInput({ ...supplierFiscalFormValues(null), fiscalCnpj: "1" });

    const parsed = supplierFiscalProfileSchema.safeParse(input);

    expect(parsed.success).toBe(false);
    for (const issue of parsed.error?.issues ?? []) {
      expect(() => fiscalErrorField(issue.path)).not.toThrow();
    }
  });

  it("throws on a path the form has no field for", () => {
    expect(() => fiscalErrorField(["address", "country"])).toThrow(/address\.country/);
  });
});

describe("the invoice model a supplier starts with", () => {
  it("starts a supplier without a saved profile on venda à ordem", () => {
    expect(supplierFiscalFormValues(null).fiscalInvoiceModel).toBe("on_behalf");
  });
});
