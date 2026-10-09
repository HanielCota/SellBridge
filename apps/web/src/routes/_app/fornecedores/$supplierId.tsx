import { formatCents, parseBrlToCents } from "@sellbridge/shared/money";
import {
  catalogSearchSchema,
  PRODUCT_SORT_LABELS,
  PRODUCT_SORTS,
  type CatalogSearch,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, PackageSearch, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { PaginationBar } from "@/components/data/pagination-bar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL_CATEGORIES = "__all__";

export const Route = createFileRoute("/_app/fornecedores/$supplierId")({
  validateSearch: catalogSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    prefetchOnServer(context.queryClient, supplierCatalogQueryOptions(params.supplierId, deps)),
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
          <ArrowLeft aria-hidden="true" />
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

function CatalogFilters({ categories }: { categories: { name: string; slug: string }[] }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [term, setTerm] = useState(search.q ?? "");
  const debouncedTerm = useDebouncedValue(term, 300);

  function updateSearch(patch: Partial<CatalogSearch>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });
  }

  useEffect(() => {
    const q = debouncedTerm.trim().length > 0 ? debouncedTerm.trim() : undefined;
    if (q === search.q) {
      return;
    }
    void navigate({ search: (previous) => ({ ...previous, q, page: 1 }), replace: true });
  }, [debouncedTerm, navigate, search.q]);

  return (
    <div className="grid gap-3 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_auto]">
      <div className="relative md:col-span-2 xl:col-span-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Buscar produto"
          placeholder="Buscar por nome ou SKU"
          className="pl-9"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </div>
      <Select
        value={search.category ?? ALL_CATEGORIES}
        onValueChange={(value) =>
          updateSearch({ category: value === ALL_CATEGORIES ? undefined : value })
        }
      >
        <SelectTrigger aria-label="Filtrar por categoria">
          <SelectValue placeholder="Todas as categorias" />
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
      <CostRangeInputs
        minCost={search.minCost}
        maxCost={search.maxCost}
        onChange={(range) => updateSearch(range)}
      />
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
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRODUCT_SORTS.map((option) => (
            <SelectItem key={option} value={option}>
              {PRODUCT_SORT_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

interface CostRangeInputsProps {
  minCost: number | undefined;
  maxCost: number | undefined;
  onChange: (range: { minCost: number | undefined; maxCost: number | undefined }) => void;
}

function centsToInput(cents: number | undefined): string {
  if (cents === undefined) {
    return "";
  }
  return (cents / 100).toFixed(2).replace(".", ",");
}

function inputToCents(value: string): number | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }
  const cents = parseBrlToCents(value);
  if (cents === null || cents < 0) {
    return undefined;
  }
  return cents;
}

function CostRangeInputs({ minCost, maxCost, onChange }: CostRangeInputsProps) {
  const [min, setMin] = useState(centsToInput(minCost));
  const [max, setMax] = useState(centsToInput(maxCost));

  function commit() {
    onChange({ minCost: inputToCents(min), maxCost: inputToCents(max) });
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
        icon={PackageSearch}
        title="Nenhum produto encontrado"
        description="Ajuste a busca ou os filtros para ver outros produtos deste fornecedor."
      />
    );
  }

  return (
    <div className="space-y-4" aria-busy={query.isFetching}>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.items.map((product) => (
          <li key={product.id}>
            <Card className="h-full overflow-hidden pt-0">
              <img
                src={product.imageUrl ?? "/placeholder-product.svg"}
                alt=""
                loading="lazy"
                className="aspect-square w-full bg-muted object-cover"
              />
              <CardContent className="flex flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  {product.categoryName ? (
                    <Badge variant="secondary">{product.categoryName}</Badge>
                  ) : (
                    <span />
                  )}
                  <span className="text-xs text-muted-foreground">SKU {product.sku}</span>
                </div>
                <h3 className="line-clamp-2 text-sm font-medium">{product.title}</h3>
                <dl className="mt-auto grid grid-cols-2 gap-1 text-sm">
                  <dt className="text-muted-foreground">Custo</dt>
                  <dd className="text-right font-semibold">{formatCents(product.costCents)}</dd>
                  <dt className="text-muted-foreground">Preço sugerido</dt>
                  <dd className="text-right">{formatCents(product.suggestedPriceCents)}</dd>
                  <dt className="text-muted-foreground">Estoque</dt>
                  <dd className={product.stock > 0 ? "text-right" : "text-right text-destructive"}>
                    {product.stock > 0 ? `${product.stock} un.` : "Esgotado"}
                  </dd>
                </dl>
                {product.stock > 0 ? (
                  <Button asChild size="sm" className="mt-2 w-full">
                    <Link to="/publicacoes/nova" search={{ productId: product.id }}>
                      Publicar
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" className="mt-2 w-full" disabled>
                    Sem estoque
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <PaginationBar
        page={products.page}
        totalPages={products.totalPages}
        total={products.total}
        itemLabel="produtos"
        onPageChange={(page) => void navigate({ search: { ...search, page } })}
      />
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Carregando produtos"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="aspect-[3/4] rounded-xl" />
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
