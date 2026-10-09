import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import {
  LISTING_STATUS_LABELS,
  LISTING_STATUSES,
  listingsSearchSchema,
  type ListingsSearch,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MegaphoneIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { selectionColumn } from "@/components/data/selection-column";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { BulkActionsBar } from "@/components/listings/bulk-actions-bar";
import { ListingActions } from "@/components/listings/listing-actions";
import { ListingThumb } from "@/components/listings/listing-thumb";
import { StoreStatuses } from "@/components/listings/store-statuses";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listingsQueryOptions } from "@/features/listings/listings.queries";
import { estimateProfit, isLowStock, isThinMargin } from "@/features/listings/profit";
import { useSelection, type Selection } from "@/hooks/use-selection";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relative-time";

const ALL_STATUSES = "__all__";

export const Route = createFileRoute("/_app/publicacoes/")({
  validateSearch: listingsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, listingsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Publicações | SellBridge" }] }),
  component: ListingsPage,
});

const columnHelper = createServerColumnHelper<ListingOverviewRow>();

function PriceCell({ row }: { row: ListingOverviewRow }) {
  const margin = estimateProfit(row.priceCents, row.costCents)?.marginPercent;
  return (
    <div className="space-y-0.5 text-right whitespace-nowrap tabular-nums">
      <p className="text-subhead font-semibold">{formatCents(row.priceCents)}</p>
      {margin === undefined ? null : (
        <p
          className={cn(
            "text-xs",
            isThinMargin(margin) ? "text-amber-700 dark:text-amber-500" : "text-muted-foreground",
          )}
          title="Estimativa com o custo do fornecedor e a taxa média do marketplace"
        >
          margem de {Math.round(margin)}%
        </p>
      )}
    </div>
  );
}

function StockCell({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <p className="text-right whitespace-nowrap">
        <span className="inline-flex h-7 items-center rounded-full bg-destructive/10 px-3 text-footnote font-medium text-destructive">
          Sem estoque
        </span>
      </p>
    );
  }
  return (
    <div className="space-y-0.5 text-right tabular-nums">
      <p className="text-subhead font-medium">{stock.toLocaleString("pt-BR")}</p>
      {isLowStock(stock) ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">estoque baixo</p>
      ) : null}
    </div>
  );
}

/** A product as a card on phones: what it is, its price and where it is live. */
function MobileListingRow({ row }: { row: ListingOverviewRow }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <ListingThumb imageUrl={row.imageUrl} categorySlug={row.categorySlug} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">
            {row.unitsSold} {row.unitsSold === 1 ? "venda" : "vendas"} em 30 dias · estoque{" "}
            {row.stock}
          </p>
        </div>
        <PriceCell row={row} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <StoreStatuses stores={row.stores} />
        <ListingActions row={row} />
      </div>
    </div>
  );
}

function RightHeader({ label }: { label: string }) {
  return <span className="block text-right">{label}</span>;
}

function productColumn() {
  return columnHelper.accessor("title", {
    header: "Anúncio",
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="flex min-w-72 items-center gap-4">
          <ListingThumb imageUrl={row.imageUrl} categorySlug={row.categorySlug} />
          <div className="min-w-0 space-y-1">
            <p className="text-subhead leading-snug font-medium whitespace-normal">
              {info.getValue()}
            </p>
            <p className="text-xs text-muted-foreground">
              SKU {row.sku} · <UpdatedAt date={row.updatedAt} />
            </p>
          </div>
        </div>
      );
    },
  });
}

function UpdatedAt({ date }: { date: Date }) {
  // Relative time depends on "now", so server and browser may differ by a minute.
  return (
    <time dateTime={date.toISOString()} title={formatAbsoluteTime(date)} suppressHydrationWarning>
      atualizado {formatRelativeTime(date)}
    </time>
  );
}

function buildColumns(selection: Selection<ListingOverviewRow>, pageRows: ListingOverviewRow[]) {
  return columnHelper.columns([
    selectionColumn({
      selection,
      pageRows,
      getId: listingId,
      getLabel: (row) => row.title,
    }),
    productColumn(),
    columnHelper.accessor("stores", {
      header: "Lojas",
      cell: (info) => <StoreStatuses stores={info.getValue()} />,
    }),
    columnHelper.accessor("priceCents", {
      header: () => <RightHeader label="Preço" />,
      cell: (info) => <PriceCell row={info.row.original} />,
    }),
    columnHelper.accessor("stock", {
      header: () => <RightHeader label="Estoque" />,
      cell: (info) => <StockCell stock={info.getValue()} />,
    }),
    columnHelper.accessor("unitsSold", {
      header: () => <RightHeader label="Vendas (30 dias)" />,
      cell: (info) => (
        <p className="text-right text-subhead font-medium tabular-nums">
          {info.getValue().toLocaleString("pt-BR")}
        </p>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Ações</span>,
      cell: (info) => <ListingActions row={info.row.original} />,
    }),
  ]);
}

function listingId(row: ListingOverviewRow): string {
  return row.listingId;
}

function ListingsPage() {
  return (
    <>
      <PageHeader
        title="Publicações"
        description="Seus produtos e o status de cada um nas lojas conectadas."
        actions={
          <Button asChild>
            <Link to="/fornecedores">Publicar novo produto</Link>
          </Button>
        }
      />
      <ListingsFilters />
      <ListingsTable />
    </>
  );
}

function ListingsFilters() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  function updateSearch(patch: Partial<ListingsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });
  }

  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => updateSearch({ query }),
  });

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchInput
        label="Buscar publicação"
        placeholder="Buscar pelo título do anúncio"
        className="flex-1"
        value={term}
        onValueChange={setTerm}
      />
      <Select
        value={search.status ?? ALL_STATUSES}
        onValueChange={(value) => {
          const status = LISTING_STATUSES.find((option) => option === value);
          updateSearch({ status });
        }}
      >
        <SelectTrigger className="sm:w-48" aria-label="Filtrar por status">
          <SelectValue>
            {search.status ? LISTING_STATUS_LABELS[search.status] : "Todos os status"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUSES}>Todos os status</SelectItem>
          {LISTING_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {LISTING_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function useListingsQuery() {
  return useQuery(listingsQueryOptions(Route.useSearch()));
}

type ListingsPageData = NonNullable<ReturnType<typeof useListingsQuery>["data"]>;

function ListingsTable() {
  const search = Route.useSearch();
  const query = useListingsQuery();

  if (query.isPending) {
    return <Skeleton className="h-72 rounded-3xl" aria-label="Carregando publicações" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    const isFiltered = search.query !== undefined || search.status !== undefined;
    return (
      <EmptyState
        icon={MegaphoneIcon}
        title={isFiltered ? "Nenhuma publicação encontrada" : "Você ainda não publicou produtos"}
        description={
          isFiltered
            ? "Ajuste a busca ou o filtro de status."
            : "Escolha um produto no catálogo de um fornecedor e publique nas suas lojas."
        }
        action={
          isFiltered ? null : (
            <Button asChild>
              <Link to="/fornecedores">Ver fornecedores</Link>
            </Button>
          )
        }
      />
    );
  }
  return <ListingsDataTable data={query.data} />;
}

function ListingsDataTable({ data }: { data: ListingsPageData }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const selection = useSelection(listingId);
  const pageById = new Map(data.items.map((row) => [row.listingId, row]));
  // Prefer the fresh row from the current page so optimistic status changes show up.
  const selectedRows = [...selection.selected.values()].map(
    (row) => pageById.get(row.listingId) ?? row,
  );
  return (
    <>
      <DataTable
        columns={buildColumns(selection, data.items)}
        data={data.items}
        getRowId={(row) => row.listingId}
        caption="Publicações e status de envio"
        renderMobileRow={(row) => <MobileListingRow row={row} />}
        footer={
          <PaginationBar
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            itemLabel={{ one: "produto", other: "produtos" }}
            onPageChange={(page) => void navigate({ search: { ...search, page } })}
          />
        }
      />
      <BulkActionsBar rows={selectedRows} onClear={selection.clear} />
    </>
  );
}
