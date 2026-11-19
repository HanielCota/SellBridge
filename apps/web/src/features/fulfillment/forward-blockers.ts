/** What the forward form knows of each order item. */
export interface ForwardItem {
  title: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierActive: boolean | null;
}

/**
 * Why each item cannot go to a supplier, in the reseller's words, so the form says exactly what
 * stops the forward instead of a generic refusal. Empty when every item can go.
 */
export function forwardBlockers(items: readonly ForwardItem[]): string[] {
  if (items.length === 0) {
    return ["Este pedido chegou sem itens. Fale com o suporte para conferir a venda."];
  }
  return items.flatMap((item) => {
    if (item.supplierId === null) {
      return [
        `“${item.title}” não está ligado a um produto do SellBridge: o fornecedor apagou o produto ou o anúncio foi criado fora daqui.`,
      ];
    }
    if (item.supplierActive === false) {
      return [
        `O fornecedor de “${item.title}” (${item.supplierName ?? "sem nome"}) foi desativado e não recebe pedidos.`,
      ];
    }
    return [];
  });
}
