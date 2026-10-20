import { optionalParameter } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  adminListCatalogProductsFn,
  adminProductListSearchSchema,
} from "@/features/seller-products/products.functions";
import { ProductEditor } from "@/components/seller-products/product-editor";
import {
  AdminProductsToolbar,
  AdminProductCards,
} from "@/components/seller-products/admin-product-list";
import { ProductPager } from "@/components/seller-products/product-list";
import { PageHeader } from "@/components/layout/page-header";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/admin/products")({
  validateSearch: adminProductListSearchSchema.extend({ product: optionalParameter(z.uuid()) }),
  head: () => ({ meta: [{ title: "Product management | SellBridge" }] }),
  component: AdminProductsPage,
});

function AdminProductsPage() {
  const { product, ...search } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery({
    queryKey: ["admin-catalog", "list", search],
    queryFn: () => adminListCatalogProductsFn({ data: search }),
  });
  if (product !== undefined && search.tenantId !== undefined)
    return (
      <ProductEditor
        key={`${search.tenantId}-${product}`}
        productId={product}
        adminTenantId={search.tenantId}
        onBack={() =>
          void navigate({ search: (previous) => ({ ...previous, product: undefined }) })
        }
        onOpen={(id) => void navigate({ search: (previous) => ({ ...previous, product: id }) })}
      />
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Product management"
        description="Inspect seller-owned inventory and supplier products. Administrative changes require a reason and are audited."
      />
      <AdminProductsToolbar
        search={search}
        onChange={(change) =>
          void navigate({ search: (previous) => ({ ...previous, ...change }), replace: true })
        }
      />
      {query.isPending ? <output>Loading product management…</output> : null}
      {query.isError ? <p role="alert">{errorMessage(query.error)}</p> : null}
      {query.data ? (
        <>
          <AdminProductCards
            products={query.data.items}
            onOpen={(tenantId, productId) =>
              void navigate({
                search: (previous) => ({ ...previous, tenantId, product: productId }),
              })
            }
          />
          <ProductPager
            total={query.data.total}
            page={search.page}
            pageSize={search.pageSize}
            onPage={(page) => void navigate({ search: (previous) => ({ ...previous, page }) })}
          />
        </>
      ) : null}
    </div>
  );
}
