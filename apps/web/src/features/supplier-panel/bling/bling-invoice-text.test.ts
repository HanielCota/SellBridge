import { describe, expect, it } from "vitest";
import { enableInvoicingDescription } from "./bling-invoice-text";

describe("enableInvoicingDescription", () => {
  it("names the remessa and the sale to the reseller in venda à ordem", () => {
    const text = enableInvoicingDescription("on_behalf");

    expect(text).toContain("a remessa, que vai na caixa, e a venda para o revendedor");
    expect(text).not.toMatch(/^[^.]*com o comprador como destinatário/);
  });

  it("keeps the buyer as the recipient when the note goes straight to the customer", () => {
    expect(enableInvoicingDescription("direct")).toContain("com o comprador como destinatário");
  });
});
