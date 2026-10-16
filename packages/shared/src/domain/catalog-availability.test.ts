import { describe, expect, it } from "vitest";
import {
  type CatalogAvailability,
  unavailableListingLabel,
  unavailableListingMessage,
  unavailableMessage,
  unavailableReason,
} from "./catalog-availability.ts";

const available: CatalogAvailability = {
  productActive: true,
  supplierActive: true,
};

describe("unavailableReason", () => {
  it("reports nothing for an active product of an active supplier", () => {
    expect(unavailableReason(available)).toBeNull();
  });

  it("names the supplier first, since reactivating the product alone would not help", () => {
    expect(unavailableReason({ ...available, supplierActive: false, productActive: false })).toBe(
      "supplier_inactive",
    );
  });

  it("reports a product the supplier took off the catalog", () => {
    expect(unavailableReason({ ...available, productActive: false })).toBe("product_inactive");
  });
});

describe("unavailableMessage", () => {
  it.each(["supplier_inactive", "product_inactive"] as const)(
    "explains %s and what the reseller can do",
    (reason) => {
      const message = unavailableMessage(reason);
      expect(message).toMatch(/^[A-ZÀ-Ú]/);
      expect(message).toMatch(/\.$/);
      expect(message.split(". ").length).toBeGreaterThanOrEqual(2);
    },
  );
});

describe("unavailable listing wording", () => {
  it("names the cause in a few words for the listing card", () => {
    expect(unavailableListingLabel("supplier_inactive")).toBe("Fornecedor inativo");
    expect(unavailableListingLabel("product_inactive")).toBe("Produto fora do catálogo");
  });

  it("says the listing stays paused and who brings it back", () => {
    expect(unavailableListingMessage("supplier_inactive")).toBe(
      "O fornecedor está inativo. O anúncio fica pausado; reative quando ele voltar ao catálogo.",
    );
    expect(unavailableListingMessage("product_inactive")).toBe(
      "O fornecedor tirou este produto do catálogo. O anúncio fica pausado; reative quando ele voltar.",
    );
  });
});
