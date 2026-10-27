import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEMS, NAV_ITEMS, SUPPLIER_NAV_ITEMS } from "./nav-items";

// MVP: sellers sell only supplier products, so their own-product page leaves the menu.
describe("seller navigation", () => {
  it("has no tab for the seller's own products", () => {
    expect(NAV_ITEMS.some((item) => item.to === "/products")).toBe(false);
    expect(NAV_ITEMS.some((item) => item.label === "Meus produtos")).toBe(false);
  });

  it("keeps the supplier panel's products tab", () => {
    expect(SUPPLIER_NAV_ITEMS).toContainEqual(
      expect.objectContaining({ label: "Produtos", to: "/fornecedor/painel/produtos" }),
    );
  });
});

describe("team navigation", () => {
  it("opens review comments from a tab only moderation sees", () => {
    expect(ADMIN_NAV_ITEMS).toContainEqual(
      expect.objectContaining({
        label: "Avaliações",
        to: "/admin/avaliacoes",
        permission: "reviews.moderate",
      }),
    );
  });
});

describe("supplier navigation", () => {
  it("has the five tabs in the order of the day", () => {
    expect(SUPPLIER_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Início",
      "Pedidos",
      "Produtos",
      "Desempenho",
      "Marca",
    ]);
  });

  it("keeps the spreadsheet import under the products tab", () => {
    const products = SUPPLIER_NAV_ITEMS.find((item) => item.label === "Produtos");
    expect(products?.also).toContain("/fornecedor/painel/importar");
  });
});
