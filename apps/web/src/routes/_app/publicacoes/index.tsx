import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import {
  LISTING_SORT_LABELS,
  LISTING_SORTS,
  type ListingsSearch,
  listingsSearchSchema,
  MAX_LISTING_BATCH,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MegaphoneIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { BulkActionsBar } from "@/components/listings/bulk-actions-bar";
import { ListingCard } from "@/components/listings/listing-card";
import { ListingStatusTabs } from "@/components/listings/listing-status-tabs";
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
import { useSelection } from "@/hooks/use-selection";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { feeScheduleQueryOptions } from "@/features/reports/fee-schedule.queries";
import { prefetchOnServer } from "@/lib/prefetch";

/** The catalog's grid, so a product looks the same before and after it is published. */
const GRID = "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4";
const SKELETON_CARDS = 6;

export const Route = createFileRoute("/_app/publicacoes/")({
  validateSearch: listingsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    Promise.all([
      prefetchOnServer(context.queryClient, listingsQueryOptions(search)),
      // The cards' margin and the price dialog count every fee the server charges.
      prefetchOnServer(context.queryClient, feeScheduleQueryOptions),
    ]),
  head: () => ({ meta: [{ title: "Publicações | SellBridge" }] }),
  component: ListingsPage,
});

function listingId(row: ListingOverviewRow): string {
  return row.listingId;
}

function useListingsQuery() {
  return useQuery(listingsQueryOptions(Route.useSearch()));
}

type ListingsPageData = NonNullable<ReturnType<typeof useListingsQuery>["data"]>;

/** Changes filters from the first page, replacing history so Back leaves the page. */
function useUpdateSearch() {
  const navigate = useNavigate({ from: Route.fullPath });
  return (patch: Partial<ListingsSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: 1 }), replace: true });
}

function ListingsPage() {
  return (
    <>
      <PageHeader
        title="Publicações"
        description="Seus produtos e onde cada um está no ar."
        actions={
          <Button asChild>
            <Link to="/catalogo">Publicar produtos</Link>
          </Button>
        }
      />
      <ListingsToolbar />
      <ListingsGrid />
    </>
  );
}

function SortSelect() {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  const sort = search.sort ?? "recent";
  return (
    <Select
      value={sort}
      onValueChange={(value) => {
        const chosen = LISTING_SORTS.find((option) => option === value);
        updateSearch({ sort: chosen === "recent" ? undefined : chosen });
      }}
    >
      <SelectTrigger className="shrink-0 sm:w-44" aria-label="Ordenar publicações">
        <SelectValue>{LISTING_SORT_LABELS[sort]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LISTING_SORTS.map((option) => (
          <SelectItem key={option} value={option}>
            {LISTING_SORT_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ListingsToolbar() {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  const query = useListingsQuery();
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (value) => updateSearch({ query: value }),
  });
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <ListingStatusTabs
        value={search.status}
        counts={query.data?.statusCounts}
        onChange={(status) => updateSearch({ status })}
      />
      <div className="flex gap-2">
        <SortSelect />
        <SearchInput
          label="Buscar publicação"
          placeholder="Buscar produto"
          className="flex-1 lg:w-64 lg:flex-none"
          value={term}
          onValueChange={setTerm}
        />
      </div>
    </div>
  );
}

function ListingsGrid() {
  const search = Route.useSearch();
  const query = useListingsQuery();

  if (query.isPending) {
    return (
      <output className={GRID} aria-label="Carregando publicações">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <Skeleton key={index} className="h-80 rounded-3xl" />
        ))}
      </output>
    );
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
            ? "Ajuste a busca ou escolha outro status."
            : "Escolha produtos no catálogo e publique nas suas lojas."
        }
        action={
          isFiltered ? null : (
            <Button asChild>
              <Link to="/catalogo">Ver catálogo</Link>
            </Button>
          )
        }
      />
    );
  }
  return <ListingsCards data={query.data} />;
}

function ListingsCards({ data }: { data: ListingsPageData }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const selection = useSelection(listingId, { limit: MAX_LISTING_BATCH });
  const pageById = new Map(data.items.map((row) => [row.listingId, row]));
  // Prefer the fresh row from the current page so optimistic status changes show up.
  const selectedRows = [...selection.selected.values()].map(
    (row) => pageById.get(row.listingId) ?? row,
  );
  return (
    <>
      <ul className={GRID} aria-label="Publicações">
        {data.items.map((row) => (
          <li key={row.listingId} className="flex min-w-0">
            <ListingCard
              row={row}
              selected={selection.isSelected(row.listingId)}
              onSelectedChange={(checked) => {
                if (checked && selection.selected.size >= MAX_LISTING_BATCH) {
                  toast.info(`Dá para selecionar até ${MAX_LISTING_BATCH} publicações por vez`, {
                    id: "selection-limit",
                  });
                  return;
                }
                selection.toggle(row, checked);
              }}
            />
          </li>
        ))}
      </ul>
      <PaginationBar
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        itemLabel={{ one: "produto", other: "produtos" }}
        onPageChange={(page) => void navigate({ search: { ...search, page } })}
      />
      <BulkActionsBar rows={selectedRows} onClear={selection.clear} />
    </>
  );
}
