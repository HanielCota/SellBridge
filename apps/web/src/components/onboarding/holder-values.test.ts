import { billingHolderSchema } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import {
  holderDefaults,
  holderInput,
  switchHolderType,
  type HolderFormValues,
} from "@/components/onboarding/holder-values";

const PERSON: HolderFormValues = {
  fullName: "Ana Souza Lima",
  cpf: "529.982.247-25",
  phone: "(11) 98765-4321",
  isCompany: false,
  cnpj: "",
  companyName: "",
};

const COMPANY: HolderFormValues = {
  ...PERSON,
  isCompany: true,
  cnpj: "11.222.333/0001-81",
  companyName: "Ana Modas Ltda",
};

describe("switchHolderType", () => {
  it("brings the company fields back empty after unticking and ticking again", () => {
    const unticked = switchHolderType(COMPANY, false);
    const ticked = switchHolderType(unticked, true);
    expect(ticked).toEqual({ ...PERSON, isCompany: true });
  });

  it("clears the company fields when switching to CPF", () => {
    expect(switchHolderType(COMPANY, false)).toEqual(PERSON);
  });

  it("clears leftovers when switching to CNPJ", () => {
    const leftover = { ...COMPANY, isCompany: false };
    expect(switchHolderType(leftover, true)).toEqual({ ...PERSON, isCompany: true });
  });

  it("keeps the person fields on both switches", () => {
    const switched = switchHolderType(switchHolderType(COMPANY, false), true);
    expect(switched.fullName).toBe(COMPANY.fullName);
    expect(switched.cpf).toBe(COMPANY.cpf);
    expect(switched.phone).toBe(COMPANY.phone);
  });

  it("keeps the typed company when the box stays as it was", () => {
    expect(switchHolderType(COMPANY, true)).toEqual(COMPANY);
  });

  it("returns a new object and leaves the given values untouched", () => {
    const original = { ...COMPANY };
    const switched = switchHolderType(COMPANY, false);
    expect(switched).not.toBe(COMPANY);
    expect(COMPANY).toEqual(original);
  });
});

describe("holderInput", () => {
  it("sends company null when saving as CPF after typing a CNPJ", () => {
    const input = holderInput(switchHolderType(COMPANY, false));
    expect(input.company).toBeNull();
    expect(JSON.stringify(input)).not.toContain("11.222.333");
    expect(JSON.stringify(input)).not.toContain("Ana Modas");
  });

  it("sends company null for leftover company text while the box is unticked", () => {
    expect(holderInput({ ...COMPANY, isCompany: false }).company).toBeNull();
  });

  it("sends only the four fields the server takes", () => {
    expect(Object.keys(holderInput(COMPANY)).toSorted()).toEqual([
      "company",
      "cpf",
      "fullName",
      "phone",
    ]);
  });

  it("is accepted by the server schema in both modes", () => {
    expect(billingHolderSchema.safeParse(holderInput(PERSON)).success).toBe(true);
    expect(billingHolderSchema.safeParse(holderInput(COMPANY)).success).toBe(true);
  });

  it("is refused by the server schema for a CNPJ without the legal name", () => {
    const input = holderInput({ ...COMPANY, companyName: "" });
    expect(billingHolderSchema.safeParse(input).success).toBe(false);
  });
});

describe("holderDefaults", () => {
  it("starts unticked and empty without a saved holder", () => {
    expect(holderDefaults(null, "Ana")).toEqual({ ...PERSON, fullName: "Ana", cpf: "", phone: "" });
  });

  it("starts unticked for a saved holder without a company", () => {
    const holder = { fullName: "Ana Souza Lima", cpf: "52998224725", phone: null, company: null };
    expect(holderDefaults(holder, "Ana")).toEqual({ ...PERSON, phone: "" });
  });

  it("starts ticked with the saved company", () => {
    const company = { cnpj: "11222333000181", companyName: "Ana Modas Ltda" };
    const holder = {
      fullName: "Ana Souza Lima",
      cpf: "52998224725",
      phone: "11987654321",
      company,
    };
    expect(holderDefaults(holder, "Ana")).toEqual(COMPANY);
  });
});
