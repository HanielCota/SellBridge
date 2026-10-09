import type { ListingTargetRow } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import {
  LISTING_STATUS_LABELS,
  LISTING_STATUSES,
  listingsSearchSchema,
  type ListingsSearch,
} from "@sellbridge/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Megaphone, RotateCw, Search, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { ListingStatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { retryListingTarget, simulateMockSale } from "@/features/listings/listings.functions";
import { listingsQueryOptions } from "@/features/listings/listings.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL_STATUSES = "__all__";

export const Route = createFileRoute("/_app/publicacoes/")({
  validateSearch: listingsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, listingsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Publicações | SellBridge" }] }),
  component: ListingsPage,
});

const columnHelper = createServerColumnHelper<ListingTargetRow>();
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function RetryButton({ listingTargetId }: { listingTargetId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => retryListingTarget({ data: { listingTargetId } }),
    onSuccess: async () => {
      toast.success("Publicação reenviada para a fila");
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <RotateCw aria-hidden="true" className={mutation.isPending ? "animate-spin" : undefined} />
      Reprocessar
    </Button>
  );
}

function SimulateSaleButton({ listingTargetId }: { listingTargetId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => simulateMockSale({ data: { listingTargetId } }),
    onSuccess: async () => {
      toast.success("Venda simulada enviada. Ela aparece no financeiro em instantes.");
      await queryClient.invalidateQueries({ queryKey: ["financials"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <ShoppingCart aria-hidden="true" />
      Simular venda
    </Button>
  );
}

const columns = columnHelper.columns([
  columnHelper.accessor("title", {
    header: "Anúncio",
    cell: (info) => (
      <div className="min-w-48 space-y-0.5">
        <p className="font-medium">{info.getValue()}</p>
        <p className="text-xs text-muted-foreground">SKU {info.row.original.sku}</p>
      </div>
    ),
  }),
  columnHelper.accessor("storeName", {
    header: "Loja",
    cell: (info) => <span className="whitespace-nowrap">{info.getValue()}</span>,
  }),
  columnHelper.accessor("priceCents", {
    header: "Preço",
    cell: (info) => <span className="whitespace-nowrap">{formatCents(info.getValue())}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="min-w-40 space-y-1">
          <ListingStatusBadge status={info.getValue()} />
          {row.errorReason ? <p className="text-xs text-destructive">{row.errorReason}</p> : null}
          {row.attempts > 0 ? (
            <p className="text-xs text-muted-foreground">
              {row.attempts} {row.attempts === 1 ? "tentativa" : "tentativas"}
            </p>
          ) : null}
        </div>
      );
    },
  }),
  columnHelper.accessor("updatedAt", {
    header: "Atualizado em",
    cell: (info) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {dateFormatter.format(info.getValue())}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Ações</span>,
    cell: (info) => {
      const row = info.row.original;
      if (row.status === "error") {
        return <RetryButton listingTargetId={row.id} />;
      }
      if (row.status !== "published") {
        return null;
      }
      return (
        <div className="flex flex-wrap justify-end gap-2">
          {row.marketplace === "mock" ? <SimulateSaleButton listingTargetId={row.id} /> : null}
          {row.externalUrl ? (
            <Button asChild size="sm" variant="ghost">
              <a href={row.externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                Ver anúncio
              </a>
            </Button>
          ) : null}
        </div>
      );
    },
  }),
]);

function ListingsPage() {
  return (
    <>
      <PageHeader
        title="Publicações"
        description="Acompanhe o envio dos seus anúncios para as lojas conectadas."
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
        <Search
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

function ListingsTable() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(listingsQueryOptions(search));

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
        icon={Megaphone}
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

  return (
    <DataTable
      columns={columns}
      data={query.data.items}
      getRowId={(row) => row.id}
      caption="Publicações e status de envio"
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel="publicações"
          onPageChange={(page) => void navigate({ search: { ...search, page } })}
        />
      }
    />
  );
}
