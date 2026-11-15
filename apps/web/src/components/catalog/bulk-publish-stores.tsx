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

/** Why no store fits the batch, and the step that fixes it. */
export function noStoresHelp(
  products: readonly Pick<SellableCatalogProduct, "catalogKind" | "supplierId">[],
  hasStores: boolean,
): { message: string; action: string } {
  const external = products.filter((product) => product.catalogKind !== "seller");
  if (new Set(external.map((product) => product.supplierId)).size > 1) {
    return {
      message:
        "Nenhuma loja vende todos estes fornecedores. Adicione os fornecedores à mesma loja na página Lojas, ou publique os produtos de um fornecedor por vez.",
      action: "Ir para Lojas",
    };
  }
  if (hasStores) {
    return {
      message:
        "Nenhuma loja vende este fornecedor. Adicione-o a uma das suas lojas antes de publicar.",
      action: "Escolher a loja",
    };
  }
  return { message: "Conecte uma loja antes de publicar.", action: "Conectar loja" };
}

export function NoStores({
  products,
  hasStores,
}: {
  products: readonly SellableCatalogProduct[];
  hasStores: boolean;
}) {
  const help = noStoresHelp(products, hasStores);
  return (
    <div className="space-y-3 text-sm">
      <p>{help.message}</p>
      <Button asChild size="sm">
        {/* With one supplier, the stores page offers it for an existing store or a new one. */}
        <Link to="/lojas" search={{ fornecedor: sharedSupplierOf(products) }} hash="adicionar-loja">
          {help.action}
        </Link>
      </Button>
    </div>
  );
}
