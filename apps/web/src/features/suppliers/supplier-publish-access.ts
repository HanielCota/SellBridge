/** The hint beside "Vender este fornecedor" while no store of the account sells this supplier. */
export const PUBLISH_NEEDS_STORE_HINT =
  "Para publicar, escolha este fornecedor para uma das suas lojas.";

/**
 * Each store sells a single supplier (MVP function 1), so a product of this supplier can only be
 * published once one of the account's stores sells it. The server still refuses any other case;
 * this only spares the reseller a form that would be refused at the end.
 */
export function canPublishSupplier(
  stores: readonly { supplierId: string | null }[],
  supplierId: string,
): boolean {
  return stores.some((store) => store.supplierId === supplierId);
}
