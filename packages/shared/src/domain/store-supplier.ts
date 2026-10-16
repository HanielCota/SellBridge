/**
 * Each marketplace shop sells a single supplier's products. A shop connected before this rule,
 * whose listings mixed suppliers, has no supplier yet ("pending") and takes no new publications
 * until the seller picks one; its existing listings keep selling.
 */
export type StoreSupplierRefusal = "supplier_pending" | "other_supplier";

/** Why a product cannot be published in a shop, or null when the shop sells its supplier. */
export function storeSupplierRefusal(
  storeSupplierId: string | null,
  productSupplierId: string,
): StoreSupplierRefusal | null {
  if (storeSupplierId === null) {
    return "supplier_pending";
  }
  if (storeSupplierId !== productSupplierId) {
    return "other_supplier";
  }
  return null;
}

const REFUSAL_MESSAGES: Record<StoreSupplierRefusal, string> = {
  supplier_pending: "Escolha o fornecedor desta loja para continuar publicando nela.",
  other_supplier:
    "Esta loja vende os produtos de outro fornecedor. Conecte uma loja para este fornecedor ou troque o fornecedor da loja.",
};

/** What the seller sees when a publication is refused, and what they can do about it. */
export function storeSupplierRefusalMessage(refusal: StoreSupplierRefusal): string {
  return REFUSAL_MESSAGES[refusal];
}

/** Error left on publications a shop stopped selling when its supplier changed. */
export const STORE_SUPPLIER_CHANGED_MESSAGE =
  "Esta loja passou a vender os produtos de outro fornecedor. Publique este produto em uma loja do fornecedor dele.";
