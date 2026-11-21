import { optionalParameter } from "@sellbridge/shared/schemas";
import { catalogListSearchSchema } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogProductList } from "@/components/supplier-panel/catalog/catalog-product-list";
import { ProductStepForm } from "@/components/supplier-panel/catalog/product-step-form";
import { ProductGridForm } from "@/components/supplier-panel/catalog/grid/product-grid-form";
import { GroupingSuggestions } from "@/components/supplier-panel/catalog/grouping/grouping-suggestions";
import { SupplierDownloadMenu } from "@/components/supplier-panel/report/supplier-download-menu";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

/** "novo" opens an empty form; a product id opens that product, `field` focuses one field. */
const NEW_PRODUCT = "novo";
const FIELD_NAME_MAX_LENGTH = 64;

const productsSearchSchema = catalogListSearchSchema.extend({
  product: optionalParameter(z.union([z.uuid(), z.literal(NEW_PRODUCT)])),
  /** A product sold in colours and sizes: "novo" opens an empty grid, an id opens that grid. */
  grade: optionalParameter(z.union([z.uuid(), z.literal(NEW_PRODUCT)])),
  field: optionalParameter(z.string().max(FIELD_NAME_MAX_LENGTH)),
  /** "grade" opens the suggestions of products to group into one grid. */
  sugestoes: optionalParameter(z.literal("grade")),
});

export const Route = createFileRoute("/_app/fornecedor/painel/produtos")({
  validateSearch: productsSearchSchema,
  head: () => ({ meta: [{ title: "Produtos | Painel do fornecedor" }] }),
  component: SupplierProductsPage,
});

/** The grid form; a new grid swaps "novo" for its id once saved, so a reload reopens it. */
function GridPage({
  supplierId,
  grade,
  onBack,
  onChooseSingle,
  onCreated,
}: {
  supplierId: string;
  grade: string;
  onBack: () => void;
  onChooseSingle: () => void;
  onCreated: (modelId: string) => void;
}) {
  return (
    <ProductGridForm
      supplierId={supplierId}
      modelId={grade === NEW_PRODUCT ? undefined : grade}
      onBack={onBack}
      onChooseSingle={onChooseSingle}
      onCreated={grade === NEW_PRODUCT ? onCreated : undefined}
    />
  );
}

/** The page's views live in the address: a product, a grid, or the grouping suggestions. */
function useProductsNavigation() {
  const navigate = useNavigate({ from: Route.fullPath });
  return {
    navigate,
    openProduct: (next: string | undefined, focus?: string) =>
      void navigate({
        search: (previous) => ({ ...previous, product: next, grade: undefined, field: focus }),
      }),
    openGrid: (next: string | undefined) =>
      void navigate({
        search: (previous) => ({ ...previous, product: undefined, grade: next, field: undefined }),
      }),
    openGrouping: (open: boolean) =>
      void navigate({
        search: (previous) => ({ ...previous, sugestoes: open ? ("grade" as const) : undefined }),
      }),
  };
}

function SupplierProductsPage() {
  const supplierId = usePanelSupplierId();
  const { product, grade, field, sugestoes, ...listSearch } = Route.useSearch();
  const { navigate, openProduct, openGrid, openGrouping } = useProductsNavigation();
  if (sugestoes !== undefined) {
    return <GroupingSuggestions supplierId={supplierId} onBack={() => openGrouping(false)} />;
  }
  if (grade !== undefined) {
    return (
      <GridPage
        supplierId={supplierId}
        grade={grade}
        onBack={() => openGrid(undefined)}
        onChooseSingle={() => openProduct(NEW_PRODUCT)}
        onCreated={(modelId) => {
          void navigate({ search: (previous) => ({ ...previous, grade: modelId }), replace: true });
        }}
      />
    );
  }
  if (product !== undefined) {
    return (
      <ProductStepForm
        supplierId={supplierId}
        productId={product === NEW_PRODUCT ? undefined : product}
        focusField={field}
        onBack={() => openProduct(undefined)}
        onChooseGrid={() => openGrid(NEW_PRODUCT)}
        onCreated={
          product === NEW_PRODUCT
            ? (productId) => {
                void navigate({
                  search: (previous) => ({ ...previous, product: productId }),
                  replace: true,
                });
              }
            : undefined
        }
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
      onOpenGrid={(modelId) => openGrid(modelId)}
      onCreateProduct={() => openProduct(NEW_PRODUCT)}
      onOpenGrouping={() => openGrouping(true)}
      headerActions={<SupplierDownloadMenu />}
    />
  );
}
