import { describe, expect, it } from "vitest";
import { supportTicketSearch } from "./talk-to-support";

const ID = "8d0c0a52-3b4f-4bb0-9a49-2f1f5d1f7c11";

describe("supportTicketSearch", () => {
  it("opens the form about the order, with its category and subject", () => {
    expect(supportTicketSearch({ kind: "order", id: ID, name: "2000001" })).toEqual({
      categoria: "order",
      pedido: ID,
      assunto: "Pedido 2000001",
    });
  });

  it("keeps a long listing title within the subject limit", () => {
    const search = supportTicketSearch({ kind: "listing", id: ID, name: "x".repeat(200) });
    expect(search.assunto?.length).toBe(120);
    expect(search.anuncio).toBe(ID);
    expect(search.categoria).toBe("listing");
  });
});
