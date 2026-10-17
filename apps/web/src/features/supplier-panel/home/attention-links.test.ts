import { describe, expect, it } from "vitest";
import { supplierAttentionHref } from "./attention-links";

describe("supplierAttentionHref", () => {
  it("opens the matching Pedidos tab, for one parcel or several", () => {
    expect(
      supplierAttentionHref({ area: "orders", filter: "accept_overdue", shipmentId: "s1" }),
    ).toBe("/fornecedor/painel/pedidos?tab=forwarded");
    expect(supplierAttentionHref({ area: "orders", filter: "accept_soon" })).toBe(
      "/fornecedor/painel/pedidos?tab=forwarded",
    );
    expect(supplierAttentionHref({ area: "orders", filter: "dispatch_overdue" })).toBe(
      "/fornecedor/painel/pedidos?tab=todo",
    );
  });

  it("opens the product out of stock on its stock field, or the product list for several", () => {
    expect(supplierAttentionHref({ area: "stock", filter: "out_of_stock_listed" })).toBe(
      "/fornecedor/painel/produtos",
    );
    expect(
      supplierAttentionHref({ area: "stock", filter: "out_of_stock_listed", productId: "p1" }),
    ).toBe("/fornecedor/painel/produtos?product=p1&field=stock");
  });

  it("opens a rejected product to fix it, or the rejected tab when there are several", () => {
    expect(supplierAttentionHref({ area: "catalog", filter: "rejected" })).toBe(
      "/fornecedor/painel/produtos?status=rejected",
    );
    expect(supplierAttentionHref({ area: "catalog", filter: "rejected", productId: "p1" })).toBe(
      "/fornecedor/painel/produtos?status=rejected&product=p1",
    );
  });

  it("opens a rejected product on the field of its first reason", () => {
    expect(
      supplierAttentionHref({
        area: "catalog",
        filter: "rejected",
        productId: "p1",
        field: "attributes.BRAND",
      }),
    ).toBe("/fornecedor/painel/produtos?status=rejected&product=p1&field=attributes.BRAND");
  });

  it("opens the performance page on the metric, under any base path", () => {
    expect(
      supplierAttentionHref({ area: "performance", metric: "dispatch_on_time" }, "/painel"),
    ).toBe("/painel/desempenho?metric=dispatch_on_time");
  });
});
