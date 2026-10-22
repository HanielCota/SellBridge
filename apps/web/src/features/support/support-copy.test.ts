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
  it("states the support hours, never a business-day promise", () => {
    expect(responsePromise("normal")).toBe(
      "Atendimento todos os dias, das 8h às 18h (horário de Brasília). A resposta chega por e-mail e no sino.",
    );
  });

  it("leaves the out-of-hours notice to its own line", () => {
    expect(responsePromise("normal")).not.toContain("fora do horário");
    expect(responsePromise("high")).not.toContain("fora do horário");
  });

  it("tells an urgent case it goes first", () => {
    expect(responsePromise("high").startsWith("Casos como o seu são respondidos primeiro.")).toBe(
      true,
    );
  });
});
