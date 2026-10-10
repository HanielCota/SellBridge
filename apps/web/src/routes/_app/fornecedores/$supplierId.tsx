import { formatCentsForInput, parseOptionalBrlToCents } from "@sellbridge/shared/money";
import {
  catalogSearchSchema,
  PRODUCT_SORT_LABELS,
  PRODUCT_SORTS,
  type CatalogSearch,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, PackageIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { SupplierProductCard } from "@/components/suppliers/supplier-product-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierCatalogQueryOptions } from "@/features/suppliers/suppliers.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL_CATEGORIES = "__all__";

export const Route = createFileRoute("/_app/fornecedores/$supplierId")({
  validateSearch: catalogSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps: search }) =>
    prefetchOnServer(context.queryClient, supplierCatalogQueryOptions(params.supplierId, search)),
  head: () => ({ meta: [{ title: "Catálogo | SellBridge" }] }),
  component: CatalogPage,
});

function useCatalogQuery() {
  const { supplierId } = Route.useParams();
  const search = Route.useSearch();
  return useQuery(supplierCatalogQueryOptions(supplierId, search));
}

function CatalogPage() {
  const query = useCatalogQuery();

  if (query.isPending) {
    return <CatalogSkeleton />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { supplier } = query.data;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/fornecedores">
          <ArrowLeftIcon aria-hidden="true" />
          Fornecedores
        </Link>
      </Button>
      <PageHeader
        title={supplier.name}
        description={`${supplier.niche} · ${supplier.city} - ${supplier.state}. ${supplier.description}`}
      />
      <CatalogFilters categories={query.data.categories} />
      <CatalogResults />
    </>
  );
}

function useCatalogSearchUpdate() {
  const navigate = useNavigate({ from: Route.fullPath });
  return useCallback(
    (patch: Partial<CatalogSearch>) =>
      void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true }),
    [navigate],
  );
}

function CatalogFilters({
  categories,
}: {
  readonly categories: readonly { name: string; slug: string }[];
}) {
  const search = Route.useSearch();
  const updateSearch = useCatalogSearchUpdate();

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_auto]">
      <CatalogSearchInput />
      <CategorySelect categories={categories} />
      <CostRangeInputs
        minCost={search.minCost}
        maxCost={search.maxCost}
        onChange={(range) => updateSearch(range)}
      />
      <SortSelect />
      <div className="flex items-center gap-2">
        <Checkbox
          id="in-stock"
          checked={search.inStock === true}
          onCheckedChange={(checked) =>
            updateSearch({ inStock: checked === true ? true : undefined })
          }
        />
        <Label htmlFor="in-stock" className="font-normal">
          Somente com estoque
        </Label>
      </div>
    </div>
  );
}

function CatalogSearchInput() {
  const search = Route.useSearch();
  const updateSearch = useCatalogSearchUpdate();
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => updateSearch({ query }),
  });

  return (
    <SearchInput
      label="Buscar produto"
      placeholder="Buscar por nome ou SKU"
      className="md:col-span-2 xl:col-span-1"
      value={term}
      onValueChange={setTerm}
    />
  );
}

function CategorySelect({
  categories,
}: {
  readonly categories: readonly { name: string; slug: string }[];
}) {
  const search = Route.useSearch();
  const updateSearch = useCatalogSearchUpdate();
  return (
    <Select
      value={search.category ?? ALL_CATEGORIES}
      onValueChange={(value) =>
        updateSearch({ category: value === ALL_CATEGORIES ? undefined : value })
      }
    >
      <SelectTrigger aria-label="Filtrar por categoria">
        <SelectValue>
          {categories.find((category) => category.slug === search.category)?.name ??
            "Todas as categorias"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_CATEGORIES}>Todas as categorias</SelectItem>
        {categories.map((category) => (
          <SelectItem key={category.slug} value={category.slug}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortSelect() {
  const search = Route.useSearch();
  const updateSearch = useCatalogSearchUpdate();
  return (
    <Select
      value={search.sort}
      onValueChange={(value) => {
        const sort = PRODUCT_SORTS.find((option) => option === value);
        if (!sort) {
          return;
        }
        updateSearch({ sort });
      }}
    >
      <SelectTrigger aria-label="Ordenar produtos">
        <SelectValue>{PRODUCT_SORT_LABELS[search.sort]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PRODUCT_SORTS.map((option) => (
          <SelectItem key={option} value={option}>
            {PRODUCT_SORT_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface CostRangeInputsProps {
  minCost: number | undefined;
  maxCost: number | undefined;
  onChange: (range: { minCost: number | undefined; maxCost: number | undefined }) => void;
}

function CostRangeInputs({ minCost, maxCost, onChange }: CostRangeInputsProps) {
  const [min, setMin] = useState(formatCentsForInput(minCost));
  const [max, setMax] = useState(formatCentsForInput(maxCost));

  function commit() {
    onChange({ minCost: parseOptionalBrlToCents(min), maxCost: parseOptionalBrlToCents(max) });
  }

  return (
    <div className="flex gap-2">
      <Input
        aria-label="Custo mínimo em reais"
        placeholder="Mín. R$"
        inputMode="decimal"
        value={min}
        onChange={(event) => setMin(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
      />
      <Input
        aria-label="Custo máximo em reais"
        placeholder="Máx. R$"
        inputMode="decimal"
        value={max}
        onChange={(event) => setMax(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
      />
    </div>
  );
}

function CatalogResults() {
  const query = useCatalogQuery();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  if (query.isPending) {
    return <ProductGridSkeleton />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const { products } = query.data;
  if (products.items.length === 0) {
    return (
      <EmptyState
        icon={PackageIcon}
        title="Nenhum produto encontrado"
        description="Ajuste a busca ou os filtros."
      />
    );
  }

  return (
    <div className="space-y-4" aria-busy={query.isFetching}>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {products.items.map((product) => (
          <li key={product.id}>
            <SupplierProductCard product={product} />
          </li>
        ))}
      </ul>
      <PaginationBar
        page={products.page}
        totalPages={products.totalPages}
        total={products.total}
        itemLabel={{ one: "produto", other: "produtos" }}
        onPageChange={(page) => void navigate({ search: { ...search, page } })}
      />
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Carregando produtos"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="aspect-[3/4] rounded-3xl" />
      ))}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <ProductGridSkeleton />
    </div>
  );
}
