import { describe, expect, it } from "vitest";
import { supplierAttentionHref } from "@/features/supplier-panel/home/attention-links";
import { buildSupplierAttention, type SupplierAttentionInput } from "./supplier-attention";

const quiet: SupplierAttentionInput = {
  ordersToAccept: 0,
  firstAccept: null,
  runningOut: { count: 0, productId: null },
  catalog: [],
  unreadSupportReplies: 0,
};

function build(input: Partial<SupplierAttentionInput>) {
  return buildSupplierAttention({ ...quiet, ...input }, supplierAttentionHref, "/suporte");
}

describe("buildSupplierAttention", () => {
  it("lists nothing when nothing waits for the supplier", () => {
    expect(build({})).toEqual([]);
  });

  it("puts the orders to accept first, with the first deadline", () => {
    const items = build({
      ordersToAccept: 4,
      firstAccept: { label: "Aceite em 3 h", overdue: false },
      unreadSupportReplies: 1,
      runningOut: { count: 2, productId: "p1" },
    });
    expect(items.map((item) => item.key)).toEqual(["accept", "running-out", "support"]);
    expect(items[0]).toMatchObject({
      title: "4 pedidos para aceitar",
      description: "Aceite em 3 h: o primeiro vence antes.",
      tone: "review",
      href: "/fornecedor/painel/pedidos?tab=forwarded",
    });
  });

  it("turns a late accept red", () => {
    const [item] = build({
      ordersToAccept: 1,
      firstAccept: { label: "Aceite atrasado há 2 h", overdue: true },
    });
    expect(item).toMatchObject({ title: "1 pedido para aceitar", tone: "danger" });
  });

  it("opens the one product running out on its stock field", () => {
    const [item] = build({ runningOut: { count: 1, productId: "p1" } });
    expect(item).toMatchObject({
      title: "1 produto acabando",
      href: "/fornecedor/painel/produtos?product=p1&field=stock",
    });
  });

  it("opens a single rejected product on the field the review pointed at", () => {
    const [item] = build({
      catalog: [
        {
          productId: "p2",
          title: "Blusa",
          imageUrl: null,
          kind: "rejected",
          reason: "Revisar foto da capa",
          field: "imageUrls",
        },
      ],
    });
    expect(item).toMatchObject({
      title: "1 produto para corrigir",
      description: "Revisar foto da capa",
      href: "/fornecedor/painel/produtos?status=rejected&product=p2&field=imageUrls",
    });
  });
});
