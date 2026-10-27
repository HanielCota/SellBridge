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

/**
 * MVP (coordinator decision, 2026-10-22): resellers sell only suppliers' products. An own product
 * takes no new publication; listings published before the rule keep selling and syncing.
 */
export const OWN_PRODUCT_PUBLICATION_MESSAGE =
  "Agora o SellBridge vende só produtos de fornecedor. Escolha um produto no Catálogo.";

/** Creating, editing and uploading images of own products is closed for the same reason. */
export const OWN_PRODUCT_WRITE_MESSAGE =
  "O cadastro de produtos próprios foi encerrado. Venda os produtos do seu fornecedor pelo Catálogo.";

/** Why a product source cannot be published, or null when it is a supplier's catalog. */
export function catalogSourceRefusal(catalogKind: "seller" | "supplier"): string | null {
  if (catalogKind === "seller") {
    return OWN_PRODUCT_PUBLICATION_MESSAGE;
  }
  return null;
}
