import { describe, expect, it } from "vitest";
import { chooseNewListingStores } from "./new-listing-stores";

const SUPPLIER_X = "00000000-0000-4000-8000-00000000000a";
const SUPPLIER_Y = "00000000-0000-4000-8000-00000000000b";
const STORE_X = {
  id: "10000000-0000-4000-8000-000000000001",
  status: "connected",
  supplierId: SUPPLIER_X,
};
const STORE_Y = {
  id: "10000000-0000-4000-8000-000000000002",
  status: "connected",
  supplierId: SUPPLIER_Y,
};
const NO_LISTINGS: ReadonlySet<string> = new Set();

describe("chooseNewListingStores", () => {
  it("offers only the stores that sell the product's supplier", () => {
    const choice = chooseNewListingStores(
      { catalogKind: "supplier", supplierId: SUPPLIER_X },
      [STORE_X, STORE_Y],
      new Set([STORE_X.id]),
    );
    expect(choice.stores).toEqual([{ ...STORE_X, listed: true }]);
    expect(choice.hasOtherStores).toBe(true);
    expect(choice.ownProductClosed).toBe(false);
  });

  // Review finding (function 1): an own product opened by URL showed the whole form and was
  // refused only on submit. The page now says at once that own products are closed.
  it("offers no store for an own product and says own products are closed", () => {
    const choice = chooseNewListingStores(
      { catalogKind: "seller", supplierId: SUPPLIER_X },
      [STORE_X, STORE_Y],
      NO_LISTINGS,
    );
    expect(choice.stores).toEqual([]);
    expect(choice.hasOtherStores).toBe(false);
    expect(choice.ownProductClosed).toBe(true);
  });

  it("leaves out stores that are not connected", () => {
    const paused = { ...STORE_X, status: "error" };
    const choice = chooseNewListingStores(
      { catalogKind: "supplier", supplierId: SUPPLIER_X },
      [paused],
      NO_LISTINGS,
    );
    expect(choice.stores).toEqual([]);
  });
});
