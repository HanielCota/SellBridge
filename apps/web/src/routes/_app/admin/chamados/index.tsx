import type { AdminTicketSummary } from "@sellbridge/database/repositories";
import { ticketsSearchSchema, type TicketsSearch } from "@sellbridge/shared/schemas";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { TrayIcon } from "@phosphor-icons/react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { SmartDate } from "@/components/data/smart-date";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { TicketStatusFilter } from "@/components/support/ticket-status-filter";
import { Skeleton } from "@/components/ui/skeleton";
import type { adminListTickets } from "@/features/support/support.functions";
import { adminTicketsQueryOptions } from "@/features/support/support.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/chamados/")({
  validateSearch: ticketsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, adminTicketsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Chamados (admin) | SellBridge" }] }),
  component: AdminTicketsPage,
});

const columnHelper = createServerColumnHelper<AdminTicketSummary>();
const columns = columnHelper.columns([
  columnHelper.accessor("subject", {
    header: "Assunto",
    cell: (info) => (
      <Link
        to="/admin/chamados/$ticketId"
        params={{ ticketId: info.row.original.id }}
        className="font-medium underline-offset-4 hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("tenantName", {
    header: "Revendedor",
    cell: (info) => (
      <div className="space-y-0.5">
        <p>{info.getValue()}</p>
        <p className="text-xs text-muted-foreground">{info.row.original.createdByEmail}</p>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <TicketStatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("updatedAt", {
    header: "Atualizado",
    cell: (info) => (
      <SmartDate date={info.getValue()} className="whitespace-nowrap text-muted-foreground" />
    ),
  }),
]);

function MobileTicketRow({ row }: { row: AdminTicketSummary }) {
  return (
    <Link
      to="/admin/chamados/$ticketId"
      params={{ ticketId: row.id }}
      className="block space-y-1.5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium">{row.subject}</p>
        <TicketStatusBadge status={row.status} />
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {row.tenantName} · <SmartDate date={row.updatedAt} />
      </p>
    </Link>
  );
}

function AdminTicketsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(adminTicketsQueryOptions(search));

  function updateSearch(patch: Partial<TicketsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true });
  }

  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (nextQuery) => updateSearch({ query: nextQuery }),
  });

  return (
    <>
      <PageHeader title="Chamados" description="Todos os chamados dos revendedores." />
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput
          label="Buscar chamados"
          placeholder="Buscar por assunto, revendedor ou e-mail"
          className="flex-1"
          value={term}
          onValueChange={setTerm}
        />
        <TicketStatusFilter value={search.status} onChange={(status) => updateSearch({ status })} />
      </div>
      <AdminTicketsTable
        query={query}
        isFiltered={search.query !== undefined || search.status !== undefined}
        onPageChange={(page) => updateSearch({ page })}
      />
    </>
  );
}

function AdminTicketsTable({
  query,
  isFiltered,
  onPageChange,
}: {
  query: UseQueryResult<Awaited<ReturnType<typeof adminListTickets>>>;
  isFiltered: boolean;
  onPageChange: (page: number) => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" aria-label="Carregando chamados" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={TrayIcon}
        title={isFiltered ? "Nenhum chamado encontrado" : "Nenhum chamado"}
        description={
          isFiltered
            ? "Ajuste a busca ou o filtro de status."
            : "Os chamados abertos pelos revendedores aparecem aqui."
        }
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={query.data.items}
      getRowId={(row) => row.id}
      caption="Chamados de todos os revendedores"
      renderMobileRow={(row) => <MobileTicketRow row={row} />}
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel={{ one: "chamado", other: "chamados" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}
