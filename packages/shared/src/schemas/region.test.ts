import { describe, expect, it } from "vitest";
import { fullNameSchema, updateRegionSchema } from "./region.ts";

const VALID_INPUT = {
  fullName: "  Ana   Souza Lima ",
  cpf: "529.982.247-25",
  cep: "30130-010",
  street: "Avenida Afonso Pena",
  number: "1000",
  neighborhood: "Centro",
};

describe("fullNameSchema", () => {
  it("asks for a surname too", () => {
    expect(fullNameSchema.safeParse("Ana").success).toBe(false);
  });

  it("collapses repeated spaces", () => {
    expect(fullNameSchema.parse(" Ana   Souza ")).toBe("Ana Souza");
  });
});

describe("updateRegionSchema", () => {
  it("stores CPF and CEP as digits and the name tidied", () => {
    expect(updateRegionSchema.parse(VALID_INPUT)).toMatchObject({
      fullName: "Ana Souza Lima",
      cpf: "52998224725",
      cep: "30130010",
    });
  });

  it("rejects a CPF whose check digits do not match", () => {
    const result = updateRegionSchema.safeParse({ ...VALID_INPUT, cpf: "529.982.247-26" });
    expect(result.success).toBe(false);
  });
});
