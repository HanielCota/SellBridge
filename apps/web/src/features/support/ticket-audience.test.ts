import { describe, expect, it } from "vitest";
import {
  asksForOrderBeforeSending,
  canLinkOrders,
  replyTemplatesFor,
  ticketTopicLabel,
} from "./ticket-audience";

describe("ticketTopicLabel", () => {
  it("names the topic the way the supplier saw it", () => {
    expect(ticketTopicLabel("order", "supplier")).toBe("Pedido encaminhado");
    expect(ticketTopicLabel("order", "seller")).toBe("Pedido ou entrega");
  });
});

describe("replyTemplatesFor", () => {
  it("never offers a supplier the answer about forwarding to the supplier", () => {
    const supplierIds = replyTemplatesFor("supplier").map((template) => template.id);
    expect(supplierIds).not.toContain("supplier");
    expect(supplierIds).toContain("greeting");
    expect(replyTemplatesFor("seller").map((template) => template.id)).toContain("supplier");
  });
});

describe("canLinkOrders", () => {
  it("only offers the order picker to resellers, whose stores have orders", () => {
    expect(canLinkOrders("seller")).toBe(true);
    expect(canLinkOrders("supplier")).toBe(false);
  });
});

describe("asksForOrderBeforeSending", () => {
  it("asks a reseller which order before sending an order ticket", () => {
    expect(
      asksForOrderBeforeSending({
        kind: "seller",
        category: "order",
        openedFromOrderId: undefined,
      }),
    ).toBe(true);
  });

  it("does not ask when the form was opened from an order", () => {
    expect(
      asksForOrderBeforeSending({ kind: "seller", category: "order", openedFromOrderId: "x" }),
    ).toBe(false);
  });

  it("does not ask on other topics or for a supplier", () => {
    expect(
      asksForOrderBeforeSending({
        kind: "seller",
        category: "payment",
        openedFromOrderId: undefined,
      }),
    ).toBe(false);
    expect(
      asksForOrderBeforeSending({
        kind: "supplier",
        category: "order",
        openedFromOrderId: undefined,
      }),
    ).toBe(false);
  });
});
