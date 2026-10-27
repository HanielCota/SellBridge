import type { NewTicketSearch } from "@sellbridge/shared/schemas";

/**
 * The page "Novo chamado" was opened from, read from what the form came about: a listing came
 * from Publicações, a store from Lojas, an order from its own page. With nothing attached, the
 * form was opened from Suporte.
 */
export type NewTicketOrigin =
  | { to: "/suporte"; label: "Suporte" }
  | { to: "/publicacoes"; label: "Publicações" }
  | { to: "/lojas"; label: "Lojas" }
  | { to: "/pedidos/$orderId"; params: { orderId: string }; label: "Pedido" };

export function newTicketOrigin(search: NewTicketSearch): NewTicketOrigin {
  if (search.anuncio !== undefined) {
    return { to: "/publicacoes", label: "Publicações" };
  }
  if (search.loja !== undefined) {
    return { to: "/lojas", label: "Lojas" };
  }
  if (search.pedido !== undefined) {
    return { to: "/pedidos/$orderId", params: { orderId: search.pedido }, label: "Pedido" };
  }
  return { to: "/suporte", label: "Suporte" };
}
