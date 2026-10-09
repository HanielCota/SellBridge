import type { AdminTicketSummary } from "@sellbridge/db/repositories";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  ticketsSearchSchema,
  type TicketsSearch,
} from "@sellbridge/shared/schemas";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Inbox, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { TicketStatusBadge } from "@/components/data/ticket-status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { adminListTickets } from "@/features/support/support.functions";
import { adminTicketsQueryOptions } from "@/features/support/support.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL_STATUSES = "__all__";

export const Route = createFileRoute("/_app/admin/chamados/")({
  validateSearch: ticketsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    prefetchOnServer(context.queryClient, adminTicketsQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Chamados (admin) | SellBridge" }] }),
  component: AdminTicketsPage,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
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
      <span className="whitespace-nowrap text-muted-foreground">
        {dateFormatter.format(info.getValue())}
      </span>
    ),
  }),
]);

function AdminTicketsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(adminTicketsQueryOptions(search));
  const [term, setTerm] = useState(search.q ?? "");
  const debouncedTerm = useDebouncedValue(term, 300);

  useEffect(() => {
    const q = debouncedTerm.trim().length > 0 ? debouncedTerm.trim() : undefined;
    if (q === search.q) {
      return;
    }
    void navigate({ search: (previous) => ({ ...previous, q, page: 1 }), replace: true });
  }, [debouncedTerm, navigate, search.q]);

  function updateSearch(patch: Partial<TicketsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true });
  }

  return (
    <>
      <PageHeader title="Chamados" description="Todos os chamados dos revendedores." />
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Buscar chamados"
            placeholder="Buscar por assunto, revendedor ou e-mail"
            className="pl-9"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        <Select
          value={search.status ?? ALL_STATUSES}
          onValueChange={(value) =>
            updateSearch({ status: TICKET_STATUSES.find((status) => status === value) })
          }
        >
          <SelectTrigger className="sm:w-56" aria-label="Filtrar chamados por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>Todos os status</SelectItem>
            {TICKET_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {TICKET_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AdminTicketsTable query={query} onPageChange={(page) => updateSearch({ page })} />
    </>
  );
}

function AdminTicketsTable({
  query,
  onPageChange,
}: {
  query: UseQueryResult<Awaited<ReturnType<typeof adminListTickets>>>;
  onPageChange: (page: number) => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-xl" aria-label="Carregando chamados" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nenhum chamado"
        description="Nenhum chamado corresponde aos filtros."
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={query.data.items}
      getRowId={(row) => row.id}
      caption="Chamados de todos os revendedores"
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel="chamados"
          onPageChange={onPageChange}
        />
      }
    />
  );
}
