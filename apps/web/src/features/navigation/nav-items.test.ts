import { describe, expect, it } from "vitest";
import {
  ACCOUNT_NAV_ITEMS,
  activeNavItemTo,
  ADMIN_NAV_ITEMS,
  navGroups,
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
  it("has the items in the order of the day", () => {
    expect(SUPPLIER_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Início",
      "Pedidos",
      "Vendas",
      "Mensagens",
      "Recebimentos",
      "Produtos",
      "Importar planilha",
      "Desempenho",
      "Regras de ouro",
    ]);
  });

  // A supplier looked for the spreadsheet import in the menu and did not find it.
  it("gives the spreadsheet import an item of its own in the menu", () => {
    expect(SUPPLIER_NAV_ITEMS).toContainEqual(
      expect.objectContaining({ label: "Importar planilha", to: "/fornecedor/painel/importar" }),
    );
    expect(activeNavItemTo(SUPPLIER_NAV_ITEMS, "/fornecedor/painel/importar")).toBe(
      "/fornecedor/painel/importar",
    );
  });

  it("keeps the brand at the foot of the menu, with support and the profile", () => {
    expect(ACCOUNT_NAV_ITEMS.supplier.map((item) => item.label)).toEqual([
      "Marca",
      "Suporte",
      "Meu perfil",
    ]);
  });
});

describe("menu groups", () => {
  it("splits the reseller's items under their headings, in order", () => {
    expect(
      navGroups(NAV_ITEMS).map((group) => [group.heading, group.items.map((item) => item.label)]),
    ).toEqual([
      [null, ["Visão geral"]],
      ["Vender", ["Catálogo", "Publicações", "Pedidos"]],
      ["Dinheiro", ["Financeiro"]],
      ["Lojas", ["Lojas", "Integrações"]],
    ]);
  });

  it("returns no group for no items", () => {
    expect(navGroups([])).toEqual([]);
  });

  it("starts a new group when a heading comes back after another one", () => {
    const groups = navGroups([
      { label: "A", to: "/dashboard", group: "Um" },
      { label: "B", to: "/catalogo", group: "Dois" },
      { label: "C", to: "/lojas", group: "Um" },
    ]);

    expect(groups.map((group) => group.heading)).toEqual(["Um", "Dois", "Um"]);
  });
});

describe("team pages that only had a link inside another page", () => {
  it("lights the support metrics, not the tickets, on the metrics page", () => {
    expect(activeNavItemTo(ADMIN_NAV_ITEMS, "/admin/chamados/metricas")).toBe(
      "/admin/chamados/metricas",
    );
    expect(activeNavItemTo(ADMIN_NAV_ITEMS, "/admin/chamados/ticket-1")).toBe("/admin/chamados");
  });

  // Since 2026-11-04 products need no team review: the old queue left the menu, so a link into
  // it lights Fornecedores, the page it lives under.
  it("lights the suppliers on the old review queue, which left the menu", () => {
    expect(ADMIN_NAV_ITEMS.map((item) => item.label)).not.toContain("Análise de produtos");
    expect(activeNavItemTo(ADMIN_NAV_ITEMS, "/admin/fornecedores/analise/product-1")).toBe(
      "/admin/fornecedores",
    );
    expect(activeNavItemTo(ADMIN_NAV_ITEMS, "/admin/fornecedores/supplier-1")).toBe(
      "/admin/fornecedores",
    );
  });
});

describe("supplier messages tab", () => {
  it("puts the stores' messages right after orders and sales, with an unread count", () => {
    const labels = SUPPLIER_NAV_ITEMS.map((item) => item.label);
    expect(labels.indexOf("Vendas")).toBe(labels.indexOf("Pedidos") + 1);
    expect(labels.indexOf("Mensagens")).toBe(labels.indexOf("Vendas") + 1);
    expect(SUPPLIER_NAV_ITEMS).toContainEqual({
      label: "Mensagens",
      to: "/suporte/revendedores",
      badge: "storeMessages",
      group: "Vendas",
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
