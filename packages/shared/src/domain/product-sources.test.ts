import { describe, expect, it } from "vitest";
import {
  isProductSourceSetupComplete,
  productSourceChoiceSchema,
  supplierSourceChoiceSchema,
} from "./product-sources.ts";

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

  // MVP: the platform sells only supplier products, so an old own-only account must pick one.
  it("asks an own-only account for a supplier before the setup counts as done", () => {
    expect(isProductSourceSetupComplete("own", false)).toBe(false);
    expect(isProductSourceSetupComplete("own", true)).toBe(true);
    expect(isProductSourceSetupComplete("own", false, true)).toBe(true);
  });

  it("calculates progress from actual requirements", () => {
    expect(isProductSourceSetupComplete("both", false, true)).toBe(false);
    expect(isProductSourceSetupComplete("suppliers", true)).toBe(true);
    expect(isProductSourceSetupComplete(null, false, true)).toBe(true);
    expect(isProductSourceSetupComplete(null, false)).toBe(false);
  });
});

// MVP function 1 (review finding): the onboarding endpoint saves only the supplier mode.
describe("supplier-only choice", () => {
  it("accepts a supplier and refuses the own and mixed modes, even when called directly", () => {
    const supplierId = crypto.randomUUID();
    expect(supplierSourceChoiceSchema.safeParse({ mode: "suppliers", supplierId }).success).toBe(
      true,
    );
    expect(supplierSourceChoiceSchema.safeParse({ mode: "own" }).success).toBe(false);
    expect(supplierSourceChoiceSchema.safeParse({ mode: "both", supplierId }).success).toBe(false);
    expect(supplierSourceChoiceSchema.safeParse({ mode: "suppliers" }).success).toBe(false);
  });
});
