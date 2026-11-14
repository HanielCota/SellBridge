/** The hint beside "Vender este fornecedor" while no store of the account sells this supplier. */
export const PUBLISH_NEEDS_STORE_HINT =
  "Para publicar, escolha este fornecedor para uma das suas lojas.";

/**
 * A product of this supplier can only be published once one of the account's stores sells it. The server still refuses any other case;
 * this only spares the reseller a form that would be refused at the end.
 */
export function canPublishSupplier(
  stores: readonly { supplierIds: readonly string[] }[],
  supplierId: string,
): boolean {
  return stores.some((store) => store.supplierIds.includes(supplierId));
}
