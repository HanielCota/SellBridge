import { describe, expect, it } from "vitest";
import {
  type CatalogAvailability,
  unavailableBellLine,
  unavailableListingLabel,
  unavailableListingMessage,
  unavailableMessage,
  unavailableReason,
} from "./catalog-availability.ts";

const available: CatalogAvailability = {
  productActive: true,
  supplierActive: true,
  priceCoversCost: true,
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

  it("stops a listing whose price no longer pays the supplier's cost", () => {
    expect(unavailableReason({ ...available, priceCoversCost: false })).toBe("cost_above_price");
  });

  it("names an inactive product before the price, which only matters once it can be sold", () => {
    expect(unavailableReason({ ...available, productActive: false, priceCoversCost: false })).toBe(
      "product_inactive",
    );
  });
});

describe("unavailableMessage", () => {
  it.each(["supplier_inactive", "product_inactive", "cost_above_price"] as const)(
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
    expect(unavailableListingLabel("product_inactive")).toBe("Produto indisponível");
    expect(unavailableListingLabel("cost_above_price")).toBe("Custo acima do preço");
  });

  it("says the listing stays paused and who brings it back", () => {
    expect(unavailableListingMessage("supplier_inactive")).toBe(
      "O fornecedor está inativo. O anúncio fica pausado; reative quando ele voltar ao catálogo.",
    );
    expect(unavailableListingMessage("product_inactive")).toBe(
      "Este produto está indisponível. Os anúncios ficam pausados até ele estar disponível novamente e você reativá-los.",
    );
  });

  it("tells the cost change and the fix in two short sentences", () => {
    expect(unavailableListingMessage("cost_above_price")).toBe(
      "O fornecedor subiu o custo. Aumente o preço para voltar a vender.",
    );
  });
});

describe("unavailableBellLine", () => {
  // The bell shows one line of detail; past ~48 characters it is cut and the fix is lost.
  it.each(["supplier_inactive", "product_inactive", "cost_above_price"] as const)(
    "fits %s in one line of the bell",
    (reason) => {
      expect(unavailableBellLine(reason).length).toBeLessThanOrEqual(48);
    },
  );

  it("puts the fix in the line when the reseller can make it", () => {
    expect(unavailableBellLine("cost_above_price")).toBe(
      "Custo subiu. Aumente o preço para vender.",
    );
  });
});
