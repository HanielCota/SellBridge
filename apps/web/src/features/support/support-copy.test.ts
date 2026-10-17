import { describe, expect, it } from "vitest";
import { noTicketsDescription } from "./support-copy";

describe("noTicketsDescription", () => {
  it("talks about stores to a reseller", () => {
    expect(noTicketsDescription("seller")).toBe(
      "Abra um chamado sobre pedidos, lojas ou repasses. A resposta aparece aqui.",
    );
  });

  it("talks about products, not stores, to a supplier", () => {
    expect(noTicketsDescription("supplier")).toBe(
      "Abra um chamado sobre pedidos, produtos ou repasses. A resposta aparece aqui.",
    );
  });
});
