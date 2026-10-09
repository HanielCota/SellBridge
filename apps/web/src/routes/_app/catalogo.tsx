import type { RegionCatalogProduct } from "@sellbridge/database/repositories";
import {
  PRODUCT_SORT_LABELS,
  PRODUCT_SORTS,
  regionCatalogSearchSchema,
  type RegionCatalogSearch,
  MAX_BULK_PUBLISH,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { MegaphoneIcon, PackageIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { BulkPublishDialog, type PublishStore } from "@/components/catalog/bulk-publish-dialog";
import { CatalogProductCard } from "@/components/catalog/catalog-product-card";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { SelectionBar } from "@/components/data/selection-bar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { regionCatalogQueryOptions } from "@/features/catalog/catalog.queries";
import { getTenantRegion } from "@/features/region/region.functions";
import { useSelection } from "@/hooks/use-selection";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL = "__all__";

export const Route = createFileRoute("/_app/catalogo")({
  validateSearch: regionCatalogSearchSchema,
  beforeLoad: async ({ location }) => {
    const region = await getTenantRegion();
    if (!region) {
      throw redirect({ to: "/onboarding", search: { redirect: location.href } });
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, regionCatalogQueryOptions(search)),
  head: () => ({ meta: [{ title: "Catálogo | SellBridge" }] }),
  component: CatalogPage,
});

function useCatalogQuery() {
  return useQuery(regionCatalogQueryOptions(Route.useSearch()));
}

type CatalogData = NonNullable<ReturnType<typeof useCatalogQuery>["data"]>;

function useUpdateSearch() {
  const navigate = useNavigate({ from: Route.fullPath });
  return (patch: Partial<RegionCatalogSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });
}

function CatalogSearchInput() {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => updateSearch({ query }),
  });
  return (
    <SearchInput
      label="Buscar produto"
      placeholder="Buscar por produto, SKU ou fornecedor"
      className="min-w-0 flex-1 sm:min-w-60"
      value={term}
      onValueChange={setTerm}
    />
  );
}

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  allLabel?: string;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : next)}
    >
      <SelectTrigger className="w-full sm:w-auto sm:min-w-44" aria-label={label}>
        <SelectValue>
          {options.find((option) => option.value === value)?.label ?? allLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allLabel ? <SelectItem value={ALL}>{allLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CatalogFilters({ data }: { data: CatalogData }) {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  return (
    <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
      <div className="col-span-2 flex sm:flex-1">
        <CatalogSearchInput />
      </div>
      <FilterSelect
        label="Categoria"
        value={search.category}
        allLabel="Categorias"
        options={data.categories.map((category) => ({
          value: category.slug,
          label: category.name,
        }))}
        onChange={(category) => updateSearch({ category })}
      />
      <FilterSelect
        label="Fornecedor"
        value={search.supplier}
        allLabel="Fornecedores"
        options={data.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
        onChange={(supplier) => updateSearch({ supplier })}
      />
      <FilterSelect
        label="Ordenar"
        value={search.sort}
        options={PRODUCT_SORTS.map((sort) => ({ value: sort, label: PRODUCT_SORT_LABELS[sort] }))}
        onChange={(sort) =>
          updateSearch({ sort: PRODUCT_SORTS.find((option) => option === sort) ?? "title" })
        }
      />
      <div className="flex h-10 items-center gap-2">
        <Checkbox
          id="in-stock"
          checked={search.inStock === true}
          onCheckedChange={(checked) =>
            updateSearch({ inStock: checked === true ? true : undefined })
          }
        />
        <Label htmlFor="in-stock" className="font-normal">
          Só com estoque
        </Label>
      </div>
    </div>
  );
}

function productId(product: RegionCatalogProduct): string {
  return product.id;
}

function ProductGrid({ data, stores }: { data: CatalogData; stores: PublishStore[] }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const selection = useSelection(productId, { limit: MAX_BULK_PUBLISH });
  const [isPublishing, setIsPublishing] = useState(false);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {data.products.items.map((product) => (
          <li key={product.id}>
            <CatalogProductCard
              product={product}
              selected={selection.isSelected(product.id)}
              onSelectedChange={(isSelected) => selection.toggle(product, isSelected)}
            />
          </li>
        ))}
      </ul>
      <PaginationBar
        page={data.products.page}
        totalPages={data.products.totalPages}
        total={data.products.total}
        itemLabel={{ one: "produto", other: "produtos" }}
        onPageChange={(page) => void navigate({ search: { ...search, page } })}
      />
      <SelectionBar
        label="Produtos selecionados"
        count={selection.selected.size}
        summary={`${selection.selected.size} ${selection.selected.size === 1 ? "selecionado" : "selecionados"}`}
        onClear={selection.clear}
      >
        <Button size="sm" onClick={() => setIsPublishing(true)}>
          <MegaphoneIcon aria-hidden="true" />
          Publicar selecionados
        </Button>
      </SelectionBar>
      <BulkPublishDialog
        open={isPublishing}
        onOpenChange={setIsPublishing}
        products={[...selection.selected.values()]}
        stores={stores}
      />
    </>
  );
}

function CatalogResults({ data }: { data: CatalogData }) {
  const search = Route.useSearch();
  if (data.products.items.length === 0) {
    const isFiltered =
      search.query !== undefined ||
      search.category !== undefined ||
      search.supplier !== undefined ||
      search.inStock !== undefined;
    return (
      <EmptyState
        icon={PackageIcon}
        title={isFiltered ? "Nenhum produto encontrado" : "Nenhum produto na sua região ainda"}
        description={
          isFiltered
            ? "Ajuste a busca ou os filtros."
            : "Ainda não há fornecedores entregando na sua região."
        }
      />
    );
  }
  return <ProductGrid data={data} stores={data.stores} />;
}

function CatalogSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Carregando produtos"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="aspect-[3/4] rounded-3xl" />
      ))}
    </div>
  );
}

function CatalogPage() {
  const query = useCatalogQuery();
  const city = query.data ? `${query.data.region.city} - ${query.data.region.state}` : "sua região";
  return (
    <>
      <PageHeader
        title="Catálogo"
        description={`Produtos de todos os fornecedores que entregam em ${city}. Selecione vários para publicar de uma vez.`}
        actions={
          <Button asChild variant="outline">
            <Link to="/fornecedores">Ver por fornecedor</Link>
          </Button>
        }
      />
      {query.isPending ? <CatalogSkeleton /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess ? (
        <>
          <CatalogFilters data={query.data} />
          <CatalogResults data={query.data} />
        </>
      ) : null}
    </>
  );
}
