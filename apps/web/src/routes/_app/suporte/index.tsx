import type { TicketSummary } from "@sellbridge/database/repositories";
import { ticketsSearchSchema, type TicketsSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LifebuoyIcon, PlusIcon } from "@phosphor-icons/react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { SmartDate } from "@/components/data/smart-date";
import { PaginationBar } from "@/components/data/pagination-bar";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { TicketStatusFilter } from "@/components/support/ticket-status-filter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { myTicketsQueryOptions } from "@/features/support/support.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/suporte/")({
  validateSearch: ticketsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, myTicketsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Suporte | SellBridge" }] }),
  component: SupportPage,
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
      <SmartDate date={info.getValue()} className="whitespace-nowrap text-muted-foreground" />
    ),
  }),
]);

function MobileTicketRow({ row }: { row: TicketSummary }) {
  return (
    <Link to="/suporte/$ticketId" params={{ ticketId: row.id }} className="block space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium">{row.subject}</p>
        <TicketStatusBadge status={row.status} />
      </div>
      <SmartDate date={row.updatedAt} className="text-xs text-muted-foreground" />
    </Link>
  );
}

function SupportHeader() {
  return (
    <PageHeader
      title="Suporte"
      description="Abra chamados e acompanhe as respostas da nossa equipe."
      actions={
        <Button asChild>
          <Link to="/suporte/novo">
            <PlusIcon aria-hidden="true" />
            Novo chamado
          </Link>
        </Button>
      }
    />
  );
}

function NoTickets({
  isFiltered,
  onClearFilter,
}: {
  isFiltered: boolean;
  onClearFilter: () => void;
}) {
  if (isFiltered) {
    return (
      <EmptyState
        icon={LifebuoyIcon}
        title="Nenhum chamado com este status"
        description="Seus outros chamados continuam na lista completa."
        action={
          <Button variant="outline" onClick={onClearFilter}>
            Ver todos os chamados
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={LifebuoyIcon}
      title="Você ainda não abriu chamados"
      description="Abra um chamado sobre pedidos, lojas ou repasses. A resposta aparece aqui."
      action={
        <Button asChild>
          <Link to="/suporte/novo">Abrir chamado</Link>
        </Button>
      }
    />
  );
}

interface TicketsTableProps {
  tickets: {
    items: TicketSummary[];
    page: number;
    totalPages: number;
    total: number;
  };
  onPageChange: (page: number) => void;
}

function TicketsTable({ tickets, onPageChange }: TicketsTableProps) {
  return (
    <DataTable
      columns={columns}
      data={tickets.items}
      getRowId={(row) => row.id}
      caption="Seus chamados de suporte"
      renderMobileRow={(row) => <MobileTicketRow row={row} />}
      footer={
        <PaginationBar
          page={tickets.page}
          totalPages={tickets.totalPages}
          total={tickets.total}
          itemLabel={{ one: "chamado", other: "chamados" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}

function SupportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(myTicketsQueryOptions(search));

  function updateSearch(patch: Partial<TicketsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true });
  }

  if (query.isPending) {
    return (
      <>
        <SupportHeader />
        <Skeleton className="h-64 rounded-3xl" aria-label="Carregando chamados" />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <SupportHeader />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </>
    );
  }

  const isFiltered = search.status !== undefined;
  const isEmpty = query.data.items.length === 0;
  return (
    <>
      <SupportHeader />
      {isEmpty && !isFiltered ? null : (
        <TicketStatusFilter
          value={search.status}
          onChange={(status) => updateSearch({ status })}
          className="w-full"
        />
      )}
      {isEmpty ? (
        <NoTickets
          isFiltered={isFiltered}
          onClearFilter={() => updateSearch({ status: undefined })}
        />
      ) : (
        <TicketsTable tickets={query.data} onPageChange={(page) => updateSearch({ page })} />
      )}
    </>
  );
}
