import { describe, expect, it } from "vitest";
import { shippingMethod } from "./shipping-methods";

describe("shippingMethod", () => {
  it.each([
    ["cross_docking", "Coleta"],
    ["xd_drop_off", "Agência"],
    ["drop_off", "Agência"],
    ["self_service", "Flex"],
    ["fulfillment", "Full"],
  ])("names %s as %s", (logisticType, short) => {
    expect(shippingMethod(logisticType)?.short).toBe(short);
  });

  it("explains a pickup in the order's own words", () => {
    expect(shippingMethod("cross_docking")?.long).toBe("Coleta: o Mercado Livre busca");
  });

  it("shows nothing before the marketplace says how the parcel goes", () => {
    expect(shippingMethod(null)).toBeNull();
  });

  it("shows nothing for a method the marketplace adds later", () => {
    expect(shippingMethod("drone")).toBeNull();
  });

  it("does not read object internals as a method", () => {
    expect(shippingMethod("toString")).toBeNull();
  });
});
