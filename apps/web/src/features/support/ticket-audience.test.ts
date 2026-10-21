import { describe, expect, it } from "vitest";
import { canLinkOrders, replyTemplatesFor, ticketTopicLabel } from "./ticket-audience";

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
