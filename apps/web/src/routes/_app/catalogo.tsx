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
import { MagnifyingGlassIcon, MegaphoneIcon, PackageIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { BulkPublishDialog, type PublishStore } from "@/components/catalog/bulk-publish-dialog";
import { CatalogProductCard } from "@/components/catalog/catalog-product-card";
import { PaginationBar } from "@/components/data/pagination-bar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
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
import { regionCatalogQueryOptions } from "@/features/catalog/catalog.queries";
import { getTenantRegion } from "@/features/region/region.functions";
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

function SearchInput() {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => updateSearch({ query }),
  });
  return (
    <div className="relative min-w-0 flex-1 sm:min-w-60">
      <MagnifyingGlassIcon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        aria-label="Buscar produto"
        placeholder="Buscar por produto, SKU ou fornecedor"
        className="pl-9"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
    </div>
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
        <SearchInput />
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

function SelectionBar({
  count,
  onPublish,
  onClear,
}: {
  count: number;
  onPublish: () => void;
  onClear: () => void;
}) {
  if (count === 0) {
    return null;
  }
  return (
    <section
      aria-label="Produtos selecionados"
      className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-full bg-foreground py-2 pr-2 pl-5 text-background shadow-lg shadow-black/20"
    >
      <p className="mr-2 text-sm font-medium">
        {count} {count === 1 ? "selecionado" : "selecionados"}
      </p>
      <Button size="sm" onClick={onPublish}>
        <MegaphoneIcon aria-hidden="true" />
        Publicar selecionados
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Limpar seleção"
        className="text-background hover:bg-background/10 hover:text-background"
        onClick={onClear}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </section>
  );
}

function useProductSelection() {
  const [selected, setSelected] = useState<ReadonlyMap<string, RegionCatalogProduct>>(new Map());
  function toggle(product: RegionCatalogProduct, isSelected: boolean) {
    setSelected((previous) => {
      const next = new Map(previous);
      if (isSelected && next.size < MAX_BULK_PUBLISH) {
        next.set(product.id, product);
      }
      if (!isSelected) {
        next.delete(product.id);
      }
      return next;
    });
  }
  return { selected, toggle, clear: () => setSelected(new Map()) };
}

function ProductGrid({ data, stores }: { data: CatalogData; stores: PublishStore[] }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const selection = useProductSelection();
  const [isPublishing, setIsPublishing] = useState(false);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {data.products.items.map((product) => (
          <li key={product.id}>
            <CatalogProductCard
              product={product}
              selected={selection.selected.has(product.id)}
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
        count={selection.selected.size}
        onPublish={() => setIsPublishing(true)}
        onClear={selection.clear}
      />
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
