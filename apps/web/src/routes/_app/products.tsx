import { sellerProductListSearchSchema } from "@sellbridge/shared/seller-catalog-schemas";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ProductEditor } from "@/components/seller-products/product-editor";
import {
  ProductsToolbar,
  ProductCards,
  ProductPager,
} from "@/components/seller-products/product-list";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { sellerListProductsFn } from "@/features/seller-products/products.functions";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/products")({
  validateSearch: sellerProductListSearchSchema.extend({ product: optionalParameter(z.uuid()) }),
  head: () => ({ meta: [{ title: "Meus produtos | SellBridge" }] }),
  component: SellerProductsPage,
});

function SellerProductsPage() {
  const { product, ...search } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const open = (id: string | undefined) =>
    void navigate({ search: (previous) => ({ ...previous, product: id }) });
  const query = useQuery({
    queryKey: ["seller-products", "list", search],
    queryFn: () => sellerListProductsFn({ data: search }),
  });
  if (product !== undefined)
    return (
      <ProductEditor
        key={product}
        productId={product}
        onBack={() => open(undefined)}
        onOpen={open}
      />
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus produtos"
        description="Cadastre e gerencie seu próprio estoque. Os produtos de fornecedores continuam disponíveis no catálogo."
        actions={<Button onClick={() => open(crypto.randomUUID())}>Cadastrar produto</Button>}
      />
      <ProductsToolbar
        search={search}
        onChange={(change) =>
          void navigate({ search: (previous) => ({ ...previous, ...change }), replace: true })
        }
      />
      {query.isPending ? <output>Carregando produtos…</output> : null}
      {query.isError ? <p role="alert">{errorMessage(query.error)}</p> : null}
      {query.data ? (
        <>
          <ProductCards products={query.data.items} onOpen={open} />
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
