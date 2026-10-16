import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import {
  PRODUCT_SORT_LABELS,
  PRODUCT_SORTS,
  sellableCatalogSearchSchema,
  type SellableCatalogSearch,
  MAX_BULK_PUBLISH,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { MegaphoneIcon, PackageIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { BulkPublishDialog } from "@/components/catalog/bulk-publish-dialog";
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
import { sellableCatalogQueryOptions } from "@/features/catalog/catalog.queries";
import { useSelection, type Selection } from "@/hooks/use-selection";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { feeScheduleQueryOptions } from "@/features/reports/fee-schedule.queries";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL = "__all__";

export const Route = createFileRoute("/_app/catalogo")({
  validateSearch: sellableCatalogSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    Promise.all([
      prefetchOnServer(context.queryClient, sellableCatalogQueryOptions(search)),
      // The cards' margin and the bulk dialog's receipt count every fee the server charges.
      prefetchOnServer(context.queryClient, feeScheduleQueryOptions),
    ]),
  head: () => ({ meta: [{ title: "Catálogo | SellBridge" }] }),
  component: CatalogPage,
});

function useCatalogQuery() {
  return useQuery(sellableCatalogQueryOptions(Route.useSearch()));
}

type CatalogData = NonNullable<ReturnType<typeof useCatalogQuery>["data"]>;

function useUpdateSearch() {
  const navigate = useNavigate({ from: Route.fullPath });
  return (patch: Partial<SellableCatalogSearch>) =>
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
      maxLength={100}
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

function FilterCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: true | undefined) => void;
}) {
  return (
    <div className="flex h-10 items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true ? true : undefined)}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
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
      <FilterCheckbox
        id="in-stock"
        label="Só com estoque"
        checked={search.inStock === true}
        onChange={(inStock) => updateSearch({ inStock })}
      />
      <FilterCheckbox
        id="unpublished"
        label="Ocultar publicados"
        checked={search.unpublished === true}
        onChange={(unpublished) => updateSearch({ unpublished })}
      />
    </div>
  );
}

function productId(product: SellableCatalogProduct): string {
  return product.id;
}

const SELECTION_LIMIT_MESSAGE = `Dá para publicar até ${MAX_BULK_PUBLISH} produtos por vez`;

function ProductGrid({
  data,
  selection,
}: {
  data: CatalogData;
  selection: Selection<SellableCatalogProduct>;
}) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function select(product: SellableCatalogProduct, isSelected: boolean) {
    if (isSelected && selection.selected.size >= MAX_BULK_PUBLISH) {
      toast.info(SELECTION_LIMIT_MESSAGE, { id: "selection-limit" });
      return;
    }
    selection.toggle(product, isSelected);
  }
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {data.products.items.map((product) => (
          <li key={product.id}>
            <CatalogProductCard
              product={product}
              selected={selection.isSelected(product.id)}
              onSelectedChange={(isSelected) => select(product, isSelected)}
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
    </>
  );
}

function hasActiveFilters(search: SellableCatalogSearch): boolean {
  return (
    search.query !== undefined ||
    search.category !== undefined ||
    search.supplier !== undefined ||
    search.inStock !== undefined ||
    search.unpublished !== undefined
  );
}

function NoProducts() {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  if (!hasActiveFilters(search)) {
    return (
      <EmptyState
        icon={PackageIcon}
        title="Nenhum produto no catálogo ainda"
        description="Ainda não há fornecedores com produtos ativos."
      />
    );
  }
  return (
    <EmptyState
      icon={PackageIcon}
      title="Nenhum produto encontrado"
      description="Ajuste a busca ou os filtros."
      action={
        <Button
          variant="outline"
          onClick={() =>
            updateSearch({
              query: undefined,
              category: undefined,
              supplier: undefined,
              inStock: undefined,
              unpublished: undefined,
            })
          }
        >
          Limpar filtros
        </Button>
      }
    />
  );
}

/**
 * The selection lives above the grid, so it survives a search with no results and the
 * products picked on other pages can still be published.
 */
function CatalogResults({ data }: { data: CatalogData }) {
  const search = Route.useSearch();
  const selection = useSelection(productId, { limit: MAX_BULK_PUBLISH });
  const [isPublishing, setIsPublishing] = useState(false);
  const { items, total, totalPages } = data.products;
  // A page past the end (old link, products gone) jumps to the last page that has products.
  if (items.length === 0 && total > 0 && search.page > totalPages) {
    return <Navigate from={Route.fullPath} search={{ ...search, page: totalPages }} replace />;
  }
  return (
    <>
      {items.length === 0 ? <NoProducts /> : <ProductGrid data={data} selection={selection} />}
      <SelectionBar
        label="Produtos selecionados"
        count={selection.selected.size}
        countLabel={{ one: "selecionado", other: "selecionados" }}
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
        stores={data.stores}
      />
    </>
  );
}

function CatalogSkeleton() {
  return (
    <output
      className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Carregando produtos"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="aspect-[3/4] rounded-3xl" />
      ))}
    </output>
  );
}

function CatalogPage() {
  const query = useCatalogQuery();
  return (
    <>
      <PageHeader
        title="Catálogo"
        description="Produtos de fornecedores de todo o Brasil. Selecione vários para publicar de uma vez."
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
