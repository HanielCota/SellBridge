import { describe, expect, it } from "vitest";
import { noTicketsDescription, responsePromise } from "./support-copy";

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

describe("responsePromise", () => {
  it("promises business days, not hours", () => {
    expect(responsePromise("normal")).toBe(
      "Respondemos em até 1 dia útil. A resposta chega por e-mail e no sino.",
    );
  });

  it("tells an urgent case it goes first", () => {
    expect(responsePromise("high").startsWith("Casos como o seu são respondidos primeiro.")).toBe(
      true,
    );
  });
});
