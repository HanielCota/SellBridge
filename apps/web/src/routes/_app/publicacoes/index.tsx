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
import { MagnifyingGlassIcon, MegaphoneIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useEffect, useMemo, useState } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { BulkActionsBar } from "@/components/listings/bulk-actions-bar";
import { ListingActions } from "@/components/listings/listing-actions";
import { ListingThumb } from "@/components/listings/listing-thumb";
import { StoreStatuses } from "@/components/listings/store-statuses";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listingsQueryOptions } from "@/features/listings/listings.queries";
import { estimateProfit } from "@/features/listings/profit";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relative-time";

const ALL_STATUSES = "__all__";
const LOW_STOCK = 5;
const THIN_MARGIN_PERCENT = 15;

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
  const margin = estimateProfit(row.priceCents, row.costCents)?.marginPercent ?? null;
  return (
    <div className="text-right whitespace-nowrap tabular-nums">
      <p className="font-medium">{formatCents(row.priceCents)}</p>
      {margin === null ? null : (
        <p
          className={cn(
            "text-xs",
            margin < THIN_MARGIN_PERCENT ? "text-amber-500" : "text-muted-foreground",
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
      <p className="text-right text-sm font-medium whitespace-nowrap text-destructive">
        Sem estoque
      </p>
    );
  }
  return (
    <div className="text-right tabular-nums">
      <p>{stock.toLocaleString("pt-BR")}</p>
      {stock <= LOW_STOCK ? <p className="text-xs text-amber-500">baixo</p> : null}
    </div>
  );
}

function RightHeader({ label }: { label: string }) {
  return <span className="block text-right">{label}</span>;
}

interface Selection {
  ids: ReadonlySet<string>;
  toggle: (id: string, checked: boolean) => void;
  togglePage: (checked: boolean) => void;
  pageState: boolean | "indeterminate";
}

function selectionColumn(selection: Selection) {
  return columnHelper.display({
    id: "select",
    header: () => (
      <Checkbox
        aria-label="Selecionar todos desta página"
        checked={selection.pageState}
        onCheckedChange={(checked) => selection.togglePage(checked === true)}
      />
    ),
    cell: (info) => {
      const row = info.row.original;
      return (
        <Checkbox
          aria-label={`Selecionar ${row.title}`}
          checked={selection.ids.has(row.listingId)}
          onCheckedChange={(checked) => selection.toggle(row.listingId, checked === true)}
          className="mt-3.5"
        />
      );
    },
  });
}

function productColumn() {
  return columnHelper.accessor("title", {
    header: "Anúncio",
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="flex min-w-56 items-center gap-3">
          <ListingThumb imageUrl={row.imageUrl} categorySlug={row.categorySlug} />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">{info.getValue()}</p>
            <p className="text-xs text-muted-foreground">SKU {row.sku}</p>
          </div>
        </div>
      );
    },
  });
}

function updatedColumn() {
  return columnHelper.accessor("updatedAt", {
    header: "Atualizado",
    cell: (info) => (
      // Relative time depends on "now", so server and browser may differ by a minute.
      <time
        dateTime={info.getValue().toISOString()}
        title={formatAbsoluteTime(info.getValue())}
        className="text-sm whitespace-nowrap text-muted-foreground"
        suppressHydrationWarning
      >
        {formatRelativeTime(info.getValue())}
      </time>
    ),
  });
}

function buildColumns(selection: Selection) {
  return columnHelper.columns([
    selectionColumn(selection),
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
        <p className="text-right tabular-nums">{info.getValue().toLocaleString("pt-BR")}</p>
      ),
    }),
    updatedColumn(),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Ações</span>,
      cell: (info) => <ListingActions row={info.row.original} />,
    }),
  ]);
}

function pageSelectionState(selectedOnPage: number, pageSize: number): boolean | "indeterminate" {
  if (selectedOnPage === 0) {
    return false;
  }
  return selectedOnPage === pageSize ? true : "indeterminate";
}

function setChecked(next: Set<string>, id: string, checked: boolean) {
  if (checked) {
    next.add(id);
    return;
  }
  next.delete(id);
}

function useSelection(pageIds: readonly string[]): Selection & { clear: () => void } {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  function update(change: (next: Set<string>) => void) {
    setIds((previous) => {
      const next = new Set(previous);
      change(next);
      return next;
    });
  }
  return {
    ids,
    toggle: (id, checked) => update((next) => setChecked(next, id, checked)),
    togglePage: (checked) =>
      update((next) => {
        for (const id of pageIds) {
          setChecked(next, id, checked);
        }
      }),
    pageState: pageSelectionState(pageIds.filter((id) => ids.has(id)).length, pageIds.length),
    clear: () => setIds(new Set()),
  };
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
  const [term, setTerm] = useState(search.query ?? "");
  const debouncedTerm = useDebouncedValue(term, 300);

  function updateSearch(patch: Partial<ListingsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });
  }

  useEffect(() => {
    const nextQuery = debouncedTerm.trim().length > 0 ? debouncedTerm.trim() : undefined;
    if (nextQuery === search.query) {
      return;
    }
    void navigate({
      search: (previous) => ({ ...previous, query: nextQuery, page: 1 }),
      replace: true,
    });
  }, [debouncedTerm, navigate, search.query]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Buscar publicação"
          placeholder="Buscar pelo título do anúncio"
          className="pl-9"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </div>
      <Select
        value={search.status ?? ALL_STATUSES}
        onValueChange={(value) => {
          const status = LISTING_STATUSES.find((option) => option === value);
          updateSearch({ status });
        }}
      >
        <SelectTrigger className="sm:w-48" aria-label="Filtrar por status">
          <SelectValue />
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
    return <Skeleton className="h-72 rounded-xl" aria-label="Carregando publicações" />;
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
  const pageIds = useMemo(() => data.items.map((row) => row.listingId), [data.items]);
  const selection = useSelection(pageIds);
  return (
    <>
      <DataTable
        columns={buildColumns(selection)}
        data={data.items}
        getRowId={(row) => row.listingId}
        caption="Publicações e status de envio"
        footer={
          <PaginationBar
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            itemLabel="produtos"
            onPageChange={(page) => void navigate({ search: { ...search, page } })}
          />
        }
      />
      <BulkActionsBar listingIds={[...selection.ids]} onClear={selection.clear} />
    </>
  );
}
