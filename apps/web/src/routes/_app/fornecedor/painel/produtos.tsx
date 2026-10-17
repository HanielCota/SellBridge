import { optionalParameter } from "@sellbridge/shared/schemas";
import { catalogListSearchSchema } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogProductList } from "@/components/supplier-panel/catalog/catalog-product-list";
import { ProductStepForm } from "@/components/supplier-panel/catalog/product-step-form";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

/** "novo" opens an empty form; a product id opens that product, `field` focuses one field. */
const NEW_PRODUCT = "novo";
const FIELD_NAME_MAX_LENGTH = 64;

const productsSearchSchema = catalogListSearchSchema.extend({
  product: optionalParameter(z.union([z.uuid(), z.literal(NEW_PRODUCT)])),
  field: optionalParameter(z.string().max(FIELD_NAME_MAX_LENGTH)),
});

export const Route = createFileRoute("/_app/fornecedor/painel/produtos")({
  validateSearch: productsSearchSchema,
  head: () => ({ meta: [{ title: "Produtos | Painel do fornecedor" }] }),
  component: SupplierProductsPage,
});

function SupplierProductsPage() {
  const supplierId = usePanelSupplierId();
  const { product, field, ...listSearch } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const openProduct = (next: string | undefined, focus?: string) =>
    void navigate({ search: (previous) => ({ ...previous, product: next, field: focus }) });
  if (product !== undefined) {
    return (
      <ProductStepForm
        supplierId={supplierId}
        productId={product === NEW_PRODUCT ? undefined : product}
        focusField={field}
        onBack={() => openProduct(undefined)}
      />
    );
  }
  return (
    <CatalogProductList
      supplierId={supplierId}
      search={listSearch}
      onSearchChange={(change) =>
        void navigate({ search: (previous) => ({ ...previous, ...change }) })
      }
      onOpenProduct={(productId, focusField) => openProduct(productId, focusField)}
      onCreateProduct={() => openProduct(NEW_PRODUCT)}
    />
  );
}
