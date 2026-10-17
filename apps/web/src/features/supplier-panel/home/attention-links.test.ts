import { describe, expect, it } from "vitest";
import { supplierAttentionHref } from "./attention-links";

describe("supplierAttentionHref", () => {
  it("opens one parcel straight away and several on the matching tab", () => {
    expect(
      supplierAttentionHref({ area: "orders", filter: "accept_overdue", shipmentId: "s1" }),
    ).toBe("/fornecedor/painel/pedidos/s1");
    expect(supplierAttentionHref({ area: "orders", filter: "accept_soon" })).toBe(
      "/fornecedor/painel/pedidos?tab=forwarded",
    );
    expect(supplierAttentionHref({ area: "orders", filter: "dispatch_overdue" })).toBe(
      "/fornecedor/painel/pedidos?tab=todo",
    );
  });

  it("filters the stock page, down to one product when there is only one", () => {
    expect(supplierAttentionHref({ area: "stock", filter: "out_of_stock_listed" })).toBe(
      "/fornecedor/painel/estoque?filter=out_of_stock_listed",
    );
    expect(
      supplierAttentionHref({ area: "stock", filter: "out_of_stock_listed", productId: "p1" }),
    ).toBe("/fornecedor/painel/estoque?filter=out_of_stock_listed&product=p1");
  });

  it("opens a rejected product to fix it, or the rejected tab when there are several", () => {
    expect(supplierAttentionHref({ area: "catalog", filter: "rejected" })).toBe(
      "/fornecedor/painel/produtos?status=rejected",
    );
    expect(supplierAttentionHref({ area: "catalog", filter: "rejected", productId: "p1" })).toBe(
      "/fornecedor/painel/produtos?status=rejected&product=p1",
    );
  });

  it("opens the performance page on the metric, under any base path", () => {
    expect(
      supplierAttentionHref({ area: "performance", metric: "dispatch_on_time" }, "/painel"),
    ).toBe("/painel/desempenho?metric=dispatch_on_time");
  });
});
