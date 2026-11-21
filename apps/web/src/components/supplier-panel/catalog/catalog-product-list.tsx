import { MissingFiscalNotice } from "./missing-fiscal-notice";
import type {
  CatalogListSearch,
  CatalogStatusFilter,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { PackageIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FilterTabs } from "@/components/data/filter-tabs";
import { SearchInput } from "@/components/data/search-input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { supplierPanelListProducts } from "@/features/supplier-panel/catalog/catalog.functions";
import { supplierPanelProductsQueryOptions } from "@/features/supplier-panel/catalog/catalog.queries";
import { usePanelSupplierActive } from "@/features/supplier-panel/use-panel-supplier";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { CatalogProductTable, type OpenGrid, type OpenProduct } from "./catalog-product-table";
import { ProductSpreadsheetMenu } from "./product-spreadsheet-menu";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";

/** Work first: what needs the supplier comes before what is already live. */
const STATUS_TABS: readonly { value: CatalogStatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "rejected", label: "Reprovados" },
  { value: "draft", label: "Rascunhos" },
  { value: "approved", label: "Aprovados" },
];

const SORT_OPTIONS: readonly (Pick<CatalogListSearch, "sort" | "direction"> & { label: string })[] =
  [
    { sort: "updatedAt", direction: "desc", label: "Atualizados recentemente" },
    { sort: "title", direction: "asc", label: "Título de A a Z" },
    { sort: "stock", direction: "asc", label: "Menor estoque" },
    { sort: "stock", direction: "desc", label: "Maior estoque" },
    { sort: "costCents", direction: "desc", label: "Maior custo" },
    { sort: "sku", direction: "asc", label: "Código de A a Z" },
  ];

function sortKey(option: Pick<CatalogListSearch, "sort" | "direction">): string {
  return `${option.sort}:${option.direction}`;
}

/** Phones have no column headers: the same sorting lives in a select above the list. */
function MobileSortSelect({
  search,
  onChange,
}: {
  search: CatalogListSearch;
  onChange: (change: Partial<CatalogListSearch>) => void;
}) {
  return (
    <div className="md:hidden">
      <Select
        value={sortKey(search)}
        onValueChange={(value) => {
          const option = SORT_OPTIONS.find((candidate) => sortKey(candidate) === value);
          if (option !== undefined) {
            onChange({ sort: option.sort, direction: option.direction, page: 1 });
          }
        }}
      >
        <SelectTrigger aria-label="Ordenar produtos" className="w-full">
          <SelectValue placeholder="Ordenar" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={sortKey(option)} value={sortKey(option)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type CatalogListQuery = UseQueryResult<Awaited<ReturnType<typeof supplierPanelListProducts>>>;

function CatalogListBody({
  query,
  search,
  onSearchChange,
  onOpenProduct,
  onOpenGrid,
  onCreateProduct,
}: Omit<CatalogProductListProps, "supplierId" | "onOpenGrouping"> & { query: CatalogListQuery }) {
  const canAddProducts = usePanelSupplierActive();
  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando produtos" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    const filtered = search.query !== undefined || search.status !== "all";
    return (
      <EmptyState
        icon={PackageIcon}
        title={filtered ? "Nenhum resultado" : "Nenhum produto"}
        description={
          filtered
            ? "Nenhum produto com este status ou busca. Ajuste os filtros."
            : "Os produtos que você cadastrar aparecem aqui."
        }
        action={
          filtered ? (
            <Button
              variant="outline"
              onClick={() => onSearchChange({ query: undefined, status: "all", page: 1 })}
            >
              Limpar filtros
            </Button>
          ) : canAddProducts ? (
            <Button onClick={onCreateProduct}>Cadastrar produto</Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <CatalogProductTable
      data={query.data}
      sort={{ sort: search.sort, direction: search.direction }}
      onSort={(sort) => onSearchChange({ ...sort, page: 1 })}
      onOpen={onOpenProduct}
      onOpenGrid={onOpenGrid}
      onPageChange={(page) => onSearchChange({ page })}
    />
  );
}

interface CatalogProductListProps {
  supplierId: string;
  search: CatalogListSearch;
  onSearchChange: (change: Partial<CatalogListSearch>) => void;
  onOpenProduct: OpenProduct;
  /** Opens a colour and size grid in its own form. */
  onOpenGrid: OpenGrid;
  onCreateProduct: () => void;
  /** Opens "Sugestões de grade"; shown while grids are on. */
  onOpenGrouping: () => void;
  /** More header actions, before "Cadastrar produto" (the page's "Baixar"). */
  headerActions?: ReactNode;
}

const CreateProductIcon = ACTION_ICONS.createProduct.icon;

/**
 * The header's product actions: the spreadsheet menu (download, import, template) and
 * "Cadastrar produto". A switched-off supplier keeps only the downloads (the server refuses
 * new products too).
 */
function ProductListActions({
  supplierId,
  search,
  productCount,
  canGroup,
  onCreateProduct,
  onOpenGrouping,
}: {
  supplierId: string;
  search: CatalogListSearch;
  productCount: number | undefined;
  /** Grids are on: the supplier can group products already registered. */
  canGroup: boolean;
  onCreateProduct: () => void;
  onOpenGrouping: () => void;
}) {
  const canAddProducts = usePanelSupplierActive();
  return (
    <div className="flex flex-wrap gap-3">
      <ProductSpreadsheetMenu
        supplierId={supplierId}
        filters={{ status: search.status, query: search.query, fiscal: search.fiscal }}
        productCount={productCount}
        canImport={canAddProducts}
      />
      {canAddProducts && canGroup ? (
        <Button variant="outline" onClick={onOpenGrouping}>
          <SquaresFourIcon aria-hidden="true" />
          Juntar cores e tamanhos
        </Button>
      ) : null}
      {canAddProducts ? <CreateProductButton onCreateProduct={onCreateProduct} /> : null}
    </div>
  );
}

function CreateProductButton({ onCreateProduct }: { onCreateProduct: () => void }) {
  return (
    <Hint label={ACTION_ICONS.createProduct.hint} openOnTap={false}>
      <Button onClick={onCreateProduct}>
        <CreateProductIcon aria-hidden="true" />
        Cadastrar produto
      </Button>
    </Hint>
  );
}

/** The status tabs and the search box above the list. */
function CatalogFilters({
  counts,
  search,
  onSearchChange,
}: {
  counts: Partial<Record<CatalogStatusFilter, number>> | undefined;
  search: CatalogListSearch;
  onSearchChange: (change: Partial<CatalogListSearch>) => void;
}) {
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (value) => onSearchChange({ query: value, page: 1 }),
  });
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-full overflow-x-auto">
        <FilterTabs
          legend="Situação dos produtos"
          tabs={STATUS_TABS.map((tab) => ({ ...tab, count: counts?.[tab.value] }))}
          value={search.status}
          onChange={(status) => onSearchChange({ status, page: 1 })}
        />
      </div>
      <SearchInput
        label="Buscar produtos"
        placeholder="Buscar por código ou título"
        value={term}
        onValueChange={setTerm}
        maxLength={100}
        className="lg:w-80"
      />
    </div>
  );
}

function fiscalFilter(filtering: boolean): Partial<CatalogListSearch> {
  return { fiscal: filtering ? "missing" : "all", page: 1 };
}

export function CatalogProductList({
  supplierId,
  search,
  onSearchChange,
  onOpenProduct,
  onOpenGrid,
  onCreateProduct,
  onOpenGrouping,
  headerActions,
}: CatalogProductListProps) {
  const query = useQuery(supplierPanelProductsQueryOptions(supplierId, search));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos"
        description="Só os aprovados aparecem para os revendedores."
        actions={
          <>
            {headerActions}
            <ProductListActions
              supplierId={supplierId}
              search={search}
              productCount={query.data?.total}
              canGroup={query.data?.productGridEnabled ?? false}
              onCreateProduct={onCreateProduct}
              onOpenGrouping={onOpenGrouping}
            />
          </>
        }
      />
      <MissingFiscalNotice
        count={query.data?.missingFiscalCount ?? 0}
        filtering={search.fiscal === "missing"}
        brandHasFiscalDefaults={query.data?.brandHasFiscalDefaults ?? false}
        onFilterChange={(filtering) => onSearchChange(fiscalFilter(filtering))}
      />
      <CatalogFilters counts={query.data?.counts} search={search} onSearchChange={onSearchChange} />
      <MobileSortSelect search={search} onChange={onSearchChange} />
      <div aria-busy={query.isFetching}>
        <CatalogListBody
          query={query}
          search={search}
          onSearchChange={onSearchChange}
          onOpenProduct={onOpenProduct}
          onOpenGrid={onOpenGrid}
          onCreateProduct={onCreateProduct}
        />
      </div>
    </div>
  );
}
