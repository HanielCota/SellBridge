import { describe, expect, it } from "vitest";
import { subscriptionSearchSchema } from "./billing-search";

describe("subscriptionSearchSchema", () => {
  it("reads the Stripe returns", () => {
    expect(subscriptionSearchSchema.parse({ retorno: "sucesso" }).retorno).toBe("sucesso");
    expect(subscriptionSearchSchema.parse({ retorno: "cancelado" }).retorno).toBe("cancelado");
    expect(subscriptionSearchSchema.parse({ retorno: "troca" }).retorno).toBe("troca");
  });

  it("ignores any other value instead of carrying it to the page", () => {
    expect(subscriptionSearchSchema.parse({ retorno: "<script>" }).retorno).toBeUndefined();
    expect(subscriptionSearchSchema.parse({}).retorno).toBeUndefined();
  });
});
