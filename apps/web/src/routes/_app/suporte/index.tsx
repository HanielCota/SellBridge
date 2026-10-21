import type { TicketSummary } from "@sellbridge/database/repositories";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { ticketsSearchSchema, type TicketsSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { HeadsetIcon, PlusIcon } from "@phosphor-icons/react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { SmartDate } from "@/components/data/smart-date";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { TicketCategoryLabel, UnreadDot } from "@/components/support/ticket-badges";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { CUSTOMER_TICKET_STATUS_LABELS } from "@/features/support/customer-ticket-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { TicketStatusFilter } from "@/components/support/ticket-status-filter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { myTicketsQueryOptions } from "@/features/support/support.queries";
import { RESPONSE_PROMISE } from "@/features/support/response-time";
import { noTicketsDescription } from "@/features/support/support-copy";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { AUTO_CLOSE_AFTER_DAYS } from "@sellbridge/shared/ticket-rules";
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
function TicketSubject({ ticket }: { ticket: TicketSummary }) {
  return (
    <div className="space-y-0.5">
      <Link
        to="/suporte/$ticketId"
        params={{ ticketId: ticket.id }}
        className="font-medium underline-offset-4 hover:underline"
      >
        {ticket.subject}
      </Link>
      <TicketCategoryLabel category={ticket.category} className="block" />
    </div>
  );
}

/** A reply you have not read outranks the status: it is what you came here for. */
function TicketState({ ticket }: { ticket: TicketSummary }) {
  if (ticket.hasUnread) {
    return <UnreadDot />;
  }
  return <TicketStatusBadge status={ticket.status} labels={CUSTOMER_TICKET_STATUS_LABELS} />;
}

const columns = columnHelper.columns([
  columnHelper.accessor("subject", {
    header: "Assunto",
    cell: (info) => <TicketSubject ticket={info.row.original} />,
  }),
  columnHelper.accessor("status", {
    header: "Situação",
    cell: (info) => <TicketState ticket={info.row.original} />,
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
        <TicketState ticket={row} />
      </div>
      <p className="text-xs text-muted-foreground">
        <TicketCategoryLabel category={row.category} /> · <SmartDate date={row.updatedAt} />
      </p>
    </Link>
  );
}

function SupportHeader() {
  return (
    <PageHeader
      title="Suporte"
      description={`${RESPONSE_PROMISE}. Chamados respondidos ficam abertos por ${AUTO_CLOSE_AFTER_DAYS} dias esperando seu retorno.`}
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
  profileKind,
  onClearFilter,
}: {
  isFiltered: boolean;
  profileKind: ProfileKind;
  onClearFilter: () => void;
}) {
  if (isFiltered) {
    return (
      <EmptyState
        icon={HeadsetIcon}
        title="Nenhum chamado encontrado"
        description="Ajuste a busca ou o status. Seus outros chamados continuam na lista completa."
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
      icon={HeadsetIcon}
      title="Você ainda não abriu chamados"
      description={noTicketsDescription(profileKind)}
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

function TicketFilters({
  term,
  onTermChange,
  status,
  onStatusChange,
}: {
  term: string;
  onTermChange: (term: string) => void;
  status: TicketsSearch["status"];
  onStatusChange: (status: TicketsSearch["status"]) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchInput
        label="Buscar chamados"
        placeholder="Buscar pelo assunto"
        className="flex-1"
        value={term}
        onValueChange={onTermChange}
      />
      <TicketStatusFilter
        labels={CUSTOMER_TICKET_STATUS_LABELS}
        value={status}
        onChange={onStatusChange}
      />
    </div>
  );
}

function SupportPage() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(myTicketsQueryOptions(search));

  function updateSearch(patch: Partial<TicketsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true });
  }

  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (nextQuery) => updateSearch({ query: nextQuery }),
  });

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

  const isFiltered = search.status !== undefined || search.query !== undefined;
  const isEmpty = query.data.items.length === 0;
  return (
    <>
      <SupportHeader />
      {isEmpty && !isFiltered ? null : (
        <TicketFilters
          term={term}
          onTermChange={setTerm}
          status={search.status}
          onStatusChange={(status) => updateSearch({ status })}
        />
      )}
      {isEmpty ? (
        <NoTickets
          isFiltered={isFiltered}
          profileKind={session.profileKind}
          onClearFilter={() => updateSearch({ status: undefined, query: undefined })}
        />
      ) : (
        <TicketsTable tickets={query.data} onPageChange={(page) => updateSearch({ page })} />
      )}
    </>
  );
}
