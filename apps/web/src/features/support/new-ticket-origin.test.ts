import { describe, expect, it } from "vitest";
import { newTicketOrigin } from "./new-ticket-origin";

const ID = "8d0c0a52-3b4f-4bb0-9a49-2f1f5d1f7c11";

describe("newTicketOrigin", () => {
  it("goes back to Publicações when the ticket is about a listing", () => {
    expect(newTicketOrigin({ categoria: "listing", anuncio: ID })).toEqual({
      to: "/publicacoes",
      label: "Publicações",
    });
  });

  it("goes back to Lojas when the ticket is about a store", () => {
    expect(newTicketOrigin({ categoria: "store", loja: ID })).toEqual({
      to: "/lojas",
      label: "Lojas",
    });
  });

  it("goes back to the order page when the ticket is about an order", () => {
    expect(newTicketOrigin({ categoria: "order", pedido: ID })).toEqual({
      to: "/pedidos/$orderId",
      params: { orderId: ID },
      label: "Pedido",
    });
  });

  it("goes back to Suporte when nothing is attached", () => {
    expect(newTicketOrigin({})).toEqual({ to: "/suporte", label: "Suporte" });
  });
});
