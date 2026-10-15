import { describe, expect, it } from "vitest";
import { billingHolderSchema, fullNameSchema, starterSupplierSchema } from "./region.ts";

describe("fullNameSchema", () => {
  it("asks for a surname too", () => {
    expect(fullNameSchema.safeParse("Ana").success).toBe(false);
  });

  it("collapses repeated spaces", () => {
    expect(fullNameSchema.parse(" Ana   Souza ")).toBe("Ana Souza");
  });
});

describe("billingHolderSchema", () => {
  it("stores the CPF as digits and the name tidied", () => {
    expect(
      billingHolderSchema.parse({ fullName: "  Ana   Souza Lima ", cpf: "529.982.247-25" }),
    ).toEqual({ fullName: "Ana Souza Lima", cpf: "52998224725" });
  });

  it("rejects a CPF whose check digits do not match", () => {
    const result = billingHolderSchema.safeParse({ fullName: "Ana Souza", cpf: "529.982.247-26" });
    expect(result.success).toBe(false);
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
