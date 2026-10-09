import { describe, expect, it } from "vitest";
import { formatCep, normalizeCep } from "./cep.ts";

describe("cep", () => {
  it("normalizes masked input", () => {
    expect(normalizeCep("35900-560")).toBe("35900560");
  });

  it("returns null for invalid length", () => {
    expect(normalizeCep("1234")).toBeNull();
    expect(normalizeCep("")).toBeNull();
  });

  it("formats digits with mask", () => {
    expect(formatCep("35900560")).toBe("35900-560");
    expect(formatCep("123")).toBe("123");
  });
});
