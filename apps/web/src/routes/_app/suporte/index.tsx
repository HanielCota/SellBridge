import type { TicketSummary } from "@sellbridge/db/repositories";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  ticketsSearchSchema,
  type TicketsSearch,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LifeBuoy, Plus } from "lucide-react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { TicketStatusBadge } from "@/components/data/ticket-status-badge";
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
import { myTicketsQueryOptions } from "@/features/support/support.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL_STATUSES = "__all__";

export const Route = createFileRoute("/_app/suporte/")({
  validateSearch: ticketsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => prefetchOnServer(context.queryClient, myTicketsQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Suporte | SellBridge" }] }),
  component: SupportPage,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const columnHelper = createServerColumnHelper<TicketSummary>();
const columns = columnHelper.columns([
  columnHelper.accessor("subject", {
    header: "Assunto",
    cell: (info) => (
      <Link
        to="/suporte/$ticketId"
        params={{ ticketId: info.row.original.id }}
        className="font-medium underline-offset-4 hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <TicketStatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("updatedAt", {
    header: "Última atualização",
    cell: (info) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {dateFormatter.format(info.getValue())}
      </span>
    ),
  }),
]);

function SupportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(myTicketsQueryOptions(search));

  function updateSearch(patch: Partial<TicketsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true });
  }

  const header = (
    <PageHeader
      title="Suporte"
      description="Abra chamados e acompanhe as respostas da nossa equipe."
      actions={
        <Button asChild>
          <Link to="/suporte/novo">
            <Plus aria-hidden="true" />
            Novo chamado
          </Link>
        </Button>
      }
    />
  );

  if (query.isPending) {
    return (
      <>
        {header}
        <Skeleton className="h-64 rounded-xl" aria-label="Carregando chamados" />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </>
    );
  }

  return (
    <>
      {header}
      <Select
        value={search.status ?? ALL_STATUSES}
        onValueChange={(value) =>
          updateSearch({ status: TICKET_STATUSES.find((status) => status === value) })
        }
      >
        <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar chamados por status">
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
      {query.data.items.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={search.status ? "Nenhum chamado com este status" : "Você ainda não abriu chamados"}
          description="Precisa de ajuda com pedidos, lojas ou repasses? Abra um chamado e responderemos por aqui."
          action={
            <Button asChild>
              <Link to="/suporte/novo">Abrir chamado</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={query.data.items}
          getRowId={(row) => row.id}
          caption="Seus chamados de suporte"
          footer={
            <PaginationBar
              page={query.data.page}
              totalPages={query.data.totalPages}
              total={query.data.total}
              itemLabel="chamados"
              onPageChange={(page) => updateSearch({ page })}
            />
          }
        />
      )}
    </>
  );
}
