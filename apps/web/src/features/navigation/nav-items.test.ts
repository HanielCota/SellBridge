import { describe, expect, it } from "vitest";
import {
  activeNavItemTo,
  ADMIN_NAV_ITEMS,
  NAV_ITEMS,
  SUPPLIER_NAV_ITEMS,
  SUPPORT_NAV_ITEM,
} from "./nav-items";

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
  it("has the six tabs in the order of the day", () => {
    expect(SUPPLIER_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Início",
      "Pedidos",
      "Mensagens",
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

describe("supplier messages tab", () => {
  it("puts the stores' messages right after the orders tab, with an unread count", () => {
    const labels = SUPPLIER_NAV_ITEMS.map((item) => item.label);
    expect(labels.indexOf("Mensagens")).toBe(labels.indexOf("Pedidos") + 1);
    expect(SUPPLIER_NAV_ITEMS).toContainEqual({
      label: "Mensagens",
      to: "/suporte/revendedores",
      badge: "storeMessages",
    });
  });

  it("lights only the messages tab on a store conversation, not support", () => {
    const sheetItems = [...SUPPLIER_NAV_ITEMS, SUPPORT_NAV_ITEM];
    expect(activeNavItemTo(sheetItems, "/suporte/revendedores")).toBe("/suporte/revendedores");
    expect(activeNavItemTo(sheetItems, "/suporte/revendedores/ticket-1")).toBe(
      "/suporte/revendedores",
    );
    expect(activeNavItemTo(sheetItems, "/suporte/novo")).toBe("/suporte");
  });
});

describe("active tab", () => {
  it("keeps the supplier home lit only on its own page", () => {
    expect(activeNavItemTo(SUPPLIER_NAV_ITEMS, "/fornecedor/painel")).toBe("/fornecedor/painel");
    expect(activeNavItemTo(SUPPLIER_NAV_ITEMS, "/fornecedor/painel/pedidos")).toBe(
      "/fornecedor/painel/pedidos",
    );
  });

  it("lights a tab for the sections that live under it and nothing elsewhere", () => {
    expect(activeNavItemTo(NAV_ITEMS, "/fornecedores/abc")).toBe("/catalogo");
    expect(activeNavItemTo(NAV_ITEMS, "/conta")).toBeNull();
  });
});
