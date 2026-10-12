import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cepSearchParameter } from "./cep-search-parameter.ts";

const searchSchema = z.object({ cep: cepSearchParameter });

describe("cepSearchParameter", () => {
  it("formats the CEP typed on the landing page", () => {
    expect(searchSchema.parse({ cep: "30130-010" }).cep).toBe("30130-010");
    expect(searchSchema.parse({ cep: "30130010" }).cep).toBe("30130-010");
  });

  it("zero-pads a CEP the router parsed as a number", () => {
    expect(searchSchema.parse({ cep: 1310100 }).cep).toBe("01310-100");
  });

  it("drops an invalid CEP instead of failing the page", () => {
    expect(searchSchema.parse({ cep: "abc" }).cep).toBeUndefined();
    expect(searchSchema.parse({}).cep).toBeUndefined();
  });
});
