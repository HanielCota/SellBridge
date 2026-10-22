import { describe, expect, it } from "vitest";
import { canPublishSupplier } from "./supplier-publish-access";

const SUPPLIER_X = "00000000-0000-4000-8000-00000000000a";
const SUPPLIER_Y = "00000000-0000-4000-8000-00000000000b";

// Coordinator decision (function 1, finding 8): the supplier directory stays open, but its
// "Publicar" only works for a supplier that one of the account's stores sells.
describe("canPublishSupplier", () => {
  it("allows publishing a supplier one of the stores sells", () => {
    expect(
      canPublishSupplier([{ supplierId: SUPPLIER_Y }, { supplierId: SUPPLIER_X }], SUPPLIER_X),
    ).toBe(true);
  });

  it("refuses a supplier no store sells", () => {
    expect(canPublishSupplier([{ supplierId: SUPPLIER_Y }, { supplierId: null }], SUPPLIER_X)).toBe(
      false,
    );
  });

  it("refuses while the account has no store", () => {
    expect(canPublishSupplier([], SUPPLIER_X)).toBe(false);
  });
});
