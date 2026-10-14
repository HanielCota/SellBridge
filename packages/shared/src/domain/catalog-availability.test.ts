import { describe, expect, it } from "vitest";
import {
  type CatalogAvailability,
  unavailableMessage,
  unavailableReason,
} from "./catalog-availability.ts";

const available: CatalogAvailability = {
  productActive: true,
  supplierActive: true,
  regionCovered: true,
};

describe("unavailableReason", () => {
  it("reports nothing for an active product the supplier still delivers", () => {
    expect(unavailableReason(available)).toBeNull();
  });

  it("names the supplier first, since reactivating the product alone would not help", () => {
    expect(unavailableReason({ ...available, supplierActive: false, productActive: false })).toBe(
      "supplier_inactive",
    );
  });

  it("names the product before the region", () => {
    expect(unavailableReason({ ...available, productActive: false, regionCovered: false })).toBe(
      "product_inactive",
    );
  });

  it("reports a supplier that stopped covering the reseller's region", () => {
    expect(unavailableReason({ ...available, regionCovered: false })).toBe("outside_region");
  });
});

describe("unavailableMessage", () => {
  it.each(["supplier_inactive", "product_inactive", "outside_region"] as const)(
    "explains %s and what the reseller can do",
    (reason) => {
      const message = unavailableMessage(reason);
      expect(message).toMatch(/^[A-ZÀ-Ú]/);
      expect(message).toMatch(/\.$/);
      expect(message.split(". ").length).toBeGreaterThanOrEqual(2);
    },
  );
});
