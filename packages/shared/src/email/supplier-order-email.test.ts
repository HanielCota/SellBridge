import { describe, expect, it } from "vitest";
import { supplierOrderEmail } from "./supplier-order-email.ts";

const order = {
  externalOrderId: "2000012345",
  items: [
    { title: "Vestido midi", sku: "VM-01", quantity: 2 },
    { title: "Blusa <b>linho</b>", sku: "", quantity: 1 },
  ],
  acceptWithinHours: 12,
  dispatchWithinHours: 48,
  link: "https://app.sellbridge.com.br/fornecedor/pedido/token-secreto",
};

describe("supplierOrderEmail", () => {
  it("names the order, lists the items and states both deadlines", () => {
    const email = supplierOrderEmail(order, "https://app.sellbridge.com.br");
    expect(email.subject).toBe("Novo pedido #2000012345 para separar");
    expect(email.text).toContain("2 × Vestido midi (VM-01)");
    expect(email.text).toContain("1 × Blusa <b>linho</b>");
    expect(email.text).toContain("aceite em até 12 horas");
    expect(email.text).toContain("despache em até 48 horas");
    expect(email.text).toContain(order.link);
  });

  it("links to the order in the HTML and escapes what came from the marketplace", () => {
    const email = supplierOrderEmail(order, "https://app.sellbridge.com.br");
    expect(email.html).toContain(`href="${order.link}"`);
    expect(email.html).toContain("Blusa &lt;b&gt;linho&lt;/b&gt;");
    expect(email.html).not.toContain("<b>linho</b>");
  });

  it("speaks of days when a deadline is a whole number of days", () => {
    const email = supplierOrderEmail(
      { ...order, acceptWithinHours: 24, dispatchWithinHours: 72 },
      "https://app.sellbridge.com.br",
    );
    expect(email.text).toContain("aceite em até 1 dia");
    expect(email.text).toContain("despache em até 3 dias");
  });

  it("never carries the buyer's address: the supplier reads it behind the link", () => {
    const email = supplierOrderEmail(order, "https://app.sellbridge.com.br");
    expect(email.text).toContain("O endereço de entrega está no link");
  });
});
