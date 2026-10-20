import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** The supplier every chosen product shares; undefined when they come from several. */
function sharedSupplierOf(products: readonly SellableCatalogProduct[]): string | undefined {
  const supplierIds = new Set(
    products
      .filter((product) => product.catalogKind !== "seller")
      .map((product) => product.supplierId),
  );
  const [only] = supplierIds;
  return supplierIds.size === 1 ? only : undefined;
}

function noStoresMessage(products: readonly SellableCatalogProduct[], hasStores: boolean) {
  const external = products.filter((product) => product.catalogKind !== "seller");
  if (new Set(external.map((product) => product.supplierId)).size > 1) {
    return "Choose products from one external supplier at a time. You can include your own products in the same batch.";
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
