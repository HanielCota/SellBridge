import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export interface PublishStore {
  id: string;
  shopName: string;
  marketplace: string;
  /** Each store sells a single supplier; null while the seller has not picked one. */
  supplierId: string | null;
}

/** The supplier every chosen product shares; undefined when they come from several. */
function sharedSupplierOf(products: readonly SellableCatalogProduct[]): string | undefined {
  const supplierIds = new Set(products.map((product) => product.supplierId));
  const [only] = supplierIds;
  return supplierIds.size === 1 ? only : undefined;
}

/** Stores that sell the supplier of every chosen product; none when they come from several. */
export function storesForProducts(
  products: readonly SellableCatalogProduct[],
  stores: readonly PublishStore[],
): PublishStore[] {
  const only = sharedSupplierOf(products);
  if (only === undefined) {
    return [];
  }
  return stores.filter((store) => store.supplierId === only);
}

function noStoresMessage(products: readonly SellableCatalogProduct[], hasStores: boolean) {
  if (new Set(products.map((product) => product.supplierId)).size > 1) {
    return "Os produtos escolhidos são de fornecedores diferentes, e cada loja vende um único fornecedor. Selecione produtos de um fornecedor por vez.";
  }
  if (hasStores) {
    return "Nenhuma loja vende este fornecedor. Conecte uma loja para ele antes de publicar.";
  }
  return "Conecte uma loja antes de publicar.";
}

export function NoStores({
  products,
  hasStores,
}: {
  products: readonly SellableCatalogProduct[];
  hasStores: boolean;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p>{noStoresMessage(products, hasStores)}</p>
      <Button asChild size="sm">
        {/* The new store comes with this supplier picked, so it can publish these products. */}
        <Link to="/lojas" search={{ fornecedor: sharedSupplierOf(products) }} hash="adicionar-loja">
          Conectar loja
        </Link>
      </Button>
    </div>
  );
}
