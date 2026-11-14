/**
 * Each marketplace shop sells the products of the suppliers linked to it. A shop with none yet
 * ("pending": connected before suppliers were linked, or every one it sold was deleted) takes no
 * new publications until the seller picks one; its existing listings keep selling.
 */
export type StoreSupplierRefusal = "supplier_pending" | "other_supplier";

/** Why a product cannot be published in a shop, or null when the shop sells its supplier. */
export function storeSupplierRefusal(
  storeSupplierIds: readonly string[],
  productSupplierId: string,
): StoreSupplierRefusal | null {
  if (storeSupplierIds.length === 0) {
    return "supplier_pending";
  }
  if (!storeSupplierIds.includes(productSupplierId)) {
    return "other_supplier";
  }
  return null;
}

const REFUSAL_MESSAGES: Record<StoreSupplierRefusal, string> = {
  supplier_pending: "Escolha o fornecedor desta loja para continuar publicando nela.",
  other_supplier:
    "Esta loja não vende os produtos deste fornecedor. Adicione o fornecedor à loja na página Lojas.",
};

/** What the seller sees when a publication is refused, and what they can do about it. */
export function storeSupplierRefusalMessage(refusal: StoreSupplierRefusal): string {
  return REFUSAL_MESSAGES[refusal];
}

/** Error left on publications of a supplier the shop stopped selling. */
export const STORE_SUPPLIER_CHANGED_MESSAGE =
  "Esta loja deixou de vender os produtos deste fornecedor. Adicione o fornecedor de volta à loja na página Lojas.";

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
