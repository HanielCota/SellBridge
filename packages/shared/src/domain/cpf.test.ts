import { describe, expect, it } from "vitest";
import { formatCpf, isValidCpf, normalizeCpf } from "./cpf.ts";

describe("cpf", () => {
  it("accepts a CPF whose check digits match, masked or not", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejects wrong check digits, repeated digits and wrong lengths", () => {
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });

  it("normalizes to digits only, or null when invalid", () => {
    expect(normalizeCpf(" 529.982.247-25 ")).toBe("52998224725");
    expect(normalizeCpf("123.456.789-00")).toBeNull();
  });

  it("masks partial and full input", () => {
    expect(formatCpf("529")).toBe("529");
    expect(formatCpf("5299")).toBe("529.9");
    expect(formatCpf("5299822")).toBe("529.982.2");
    expect(formatCpf("529982247")).toBe("529.982.247");
    expect(formatCpf("5299822472")).toBe("529.982.247-2");
    expect(formatCpf("52998224725999")).toBe("529.982.247-25");
  });
});
