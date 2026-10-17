import { describe, expect, it } from "vitest";
import { subscriptionSearchSchema } from "./billing-search";

describe("subscriptionSearchSchema", () => {
  it("reads the two Stripe returns", () => {
    expect(subscriptionSearchSchema.parse({ retorno: "sucesso" }).retorno).toBe("sucesso");
    expect(subscriptionSearchSchema.parse({ retorno: "cancelado" }).retorno).toBe("cancelado");
  });

  it("ignores any other value instead of carrying it to the page", () => {
    expect(subscriptionSearchSchema.parse({ retorno: "<script>" }).retorno).toBeUndefined();
    expect(subscriptionSearchSchema.parse({}).retorno).toBeUndefined();
  });
});
