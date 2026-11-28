/**
 * Why the reseller's sale note XML cannot go to this order's marketplace, or null when it can:
 * Mercado Livre and Shopee take the note as XML; elsewhere the reseller types the key.
 */
export function saleNoteXmlRefusal(marketplace: string): string | null {
  if (marketplace === "mercado_livre" || marketplace === "shopee") {
    return null;
  }
  return "O XML da nota só vai para pedidos do Mercado Livre e da Shopee. Neste pedido, cole a chave de acesso da nota.";
}
