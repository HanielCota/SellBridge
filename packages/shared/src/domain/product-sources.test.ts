import { describe, expect, it } from "vitest";
import { isProductSourceSetupComplete, productSourceChoiceSchema } from "./product-sources.ts";

describe("product source choices", () => {
  it("allows own products without a supplier and requires one for supplier modes", () => {
    expect(productSourceChoiceSchema.safeParse({ mode: "own" }).success).toBe(true);
    for (const mode of ["suppliers", "both"]) {
      expect(productSourceChoiceSchema.safeParse({ mode }).success).toBe(false);
      expect(productSourceChoiceSchema.safeParse({ mode, supplierId: null }).success).toBe(false);
      expect(productSourceChoiceSchema.safeParse({ mode, supplierId: "invalid" }).success).toBe(
        false,
      );
      expect(
        productSourceChoiceSchema.safeParse({ mode, supplierId: crypto.randomUUID() }).success,
      ).toBe(true);
    }
  });

  it("calculates progress from actual requirements without requiring an own-product supplier", () => {
    expect(isProductSourceSetupComplete("own", false)).toBe(true);
    expect(isProductSourceSetupComplete("both", false, true)).toBe(false);
    expect(isProductSourceSetupComplete("suppliers", true)).toBe(true);
    expect(isProductSourceSetupComplete(null, false, true)).toBe(true);
    expect(isProductSourceSetupComplete(null, false)).toBe(false);
  });
});
