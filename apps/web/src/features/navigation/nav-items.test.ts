import { describe, expect, it } from "vitest";
import { NAV_ITEMS, SUPPLIER_NAV_ITEMS } from "./nav-items";

// MVP: sellers sell only supplier products, so their own-product page leaves the menu.
describe("seller navigation", () => {
  it("has no tab for the seller's own products", () => {
    expect(NAV_ITEMS.some((item) => item.to === "/products")).toBe(false);
    expect(NAV_ITEMS.some((item) => item.label === "Meus produtos")).toBe(false);
  });

  it("keeps the supplier panel's products tab", () => {
    expect(SUPPLIER_NAV_ITEMS).toContainEqual(
      expect.objectContaining({ label: "Meus produtos", to: "/fornecedor/painel/produtos" }),
    );
  });
});
