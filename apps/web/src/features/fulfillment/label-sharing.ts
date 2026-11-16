/** Who would ship on one order's marketplace label (`findOrderLabelParcels`). */
interface LabelParcels {
  parcelCount: number;
  supplierIds: readonly string[];
}

const SPLIT_ORDER_REFUSAL =
  "Este pedido foi dividido entre fornecedores. A etiqueta única do marketplace não pode ser usada em volumes separados; cada fornecedor envia a sua parte com o próprio frete e informa o rastreio.";

const SPLIT_CART_REFUSAL =
  "Este pedido foi comprado num carrinho do Mercado Livre junto com produtos de outro fornecedor. A etiqueta do carrinho é uma só e não pode ser usada em volumes separados; cada fornecedor envia a sua parte com o próprio frete e informa o rastreio.";

/**
 * Why the marketplace label cannot be printed for this order, or null when it can: one label
 * travels on one package, so it serves a single supplier.
 */
export function labelSharingRefusal(parcels: LabelParcels): string | null {
  if (parcels.parcelCount > 1) {
    return SPLIT_ORDER_REFUSAL;
  }
  if (new Set(parcels.supplierIds).size > 1) {
    return SPLIT_CART_REFUSAL;
  }
  return null;
}
