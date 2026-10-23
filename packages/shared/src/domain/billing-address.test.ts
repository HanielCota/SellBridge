import { describe, expect, it } from "vitest";
import {
  billingAddressSchema,
  cepSchema,
  formatBillingAddress,
  formatCep,
  maskBillingAddress,
} from "./billing-address.ts";

const ADDRESS = {
  cep: "01310-100",
  street: "Avenida Paulista",
  number: "1578",
  complement: "Sala 4",
  neighborhood: "Bela Vista",
  city: "São Paulo",
  state: "SP",
} as const;

describe("cepSchema", () => {
  it("stores the 8 digits", () => {
    expect(cepSchema.parse(" 01310-100 ")).toBe("01310100");
  });

  it("refuses a CEP with missing digits", () => {
    const result = cepSchema.safeParse("01310-10");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Informe os 8 números do CEP, como 01310-100");
  });
});

describe("formatCep", () => {
  it("masks while typing", () => {
    expect(formatCep("0131")).toBe("0131");
    expect(formatCep("013101")).toBe("01310-1");
    expect(formatCep("01310100999")).toBe("01310-100");
  });
});

describe("billingAddressSchema", () => {
  it("takes s/n as the number and an empty complement", () => {
    const parsed = billingAddressSchema.parse({ ...ADDRESS, number: "s/n", complement: "" });
    expect(parsed.number).toBe("s/n");
    expect(parsed.complement).toBe("");
  });

  it("asks for street, number, district and city", () => {
    for (const key of ["street", "number", "neighborhood", "city"] as const) {
      expect(billingAddressSchema.safeParse({ ...ADDRESS, [key]: "  " }).success).toBe(false);
    }
  });

  it("asks for one of the 27 states", () => {
    const result = billingAddressSchema.safeParse({ ...ADDRESS, state: "" });
    expect(result.error?.issues[0]?.message).toBe("Escolha o estado");
    expect(billingAddressSchema.safeParse({ ...ADDRESS, state: "XX" }).success).toBe(false);
  });

  it("refuses fields it does not know", () => {
    expect(billingAddressSchema.safeParse({ ...ADDRESS, phone: "11987654321" }).success).toBe(
      false,
    );
  });
});

describe("address display", () => {
  const address = billingAddressSchema.parse(ADDRESS);

  it("hides street, number, district and CEP until revealed", () => {
    const masked = maskBillingAddress(address);
    expect(masked).toBe("•••, ••• · São Paulo/SP");
    for (const hidden of ["Paulista", "1578", "Bela Vista", "01310"]) {
      expect(masked).not.toContain(hidden);
    }
  });

  it("shows the whole address in two lines when revealed", () => {
    expect(formatBillingAddress(address)).toEqual([
      "Avenida Paulista, 1578, Sala 4",
      "Bela Vista · São Paulo/SP · CEP 01310-100",
    ]);
  });
});
