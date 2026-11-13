import type { ProblemListItem } from "@sellbridge/database/repositories";
import { PROBLEM_AREA_LABELS } from "@sellbridge/shared/problem-areas";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { TonePill } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { occurrencesLabel, problemWhenLabel } from "@/features/admin-problems/problem-copy";
import { errorMessage } from "@/lib/errors";

interface ProblemListPage {
  items: ProblemListItem[];
  nextCursor: string | null;
}

export type ProblemListQuery = UseInfiniteQueryResult<InfiniteData<ProblemListPage>>;

function ProblemWhen({ item }: { item: ProblemListItem }) {
  const lastSeenAt = new Date(item.lastSeenAt);
  return (
    <time dateTime={lastSeenAt.toISOString()} className="text-sm" suppressHydrationWarning>
      {problemWhenLabel(lastSeenAt)}
    </time>
  );
}

function AreaTag({ item }: { item: ProblemListItem }) {
  return <TonePill tone="muted" showDot={false} label={PROBLEM_AREA_LABELS[item.area]} />;
}

/** The message opens the detail: the whole problem, its context and "Marcar como resolvido". */
function ProblemMessage({ item }: { item: ProblemListItem }) {
  return (
    <Link
      to="/admin/problemas/$problemId"
      params={{ problemId: item.id }}
      className="line-clamp-2 font-medium break-words underline-offset-4 hover:underline"
    >
      {item.message}
    </Link>
  );
}

/** The reseller or supplier the problem was about, linked to their admin page when known. */
function ProblemAccount({ item }: { item: ProblemListItem }) {
  if (item.accountName === null) {
    return <span className="text-sm text-muted-foreground">Sem conta ligada</span>;
  }
  const store =
    item.storeName === null ? null : (
      <span className="block text-xs text-muted-foreground">Loja {item.storeName}</span>
    );
  if (item.accountUserId === null) {
    return (
      <span className="text-sm">
        {item.accountName}
        {store}
      </span>
    );
  }
  return (
    <span className="text-sm">
      <Link
        to="/admin/clientes/$userId"
        params={{ userId: item.accountUserId }}
        className="font-medium underline-offset-4 hover:underline"
      >
        {item.accountName}
      </Link>
      {store}
    </span>
  );
}

const columnHelper = createServerColumnHelper<ProblemListItem>();
const columns = columnHelper.columns([
  columnHelper.accessor("lastSeenAt", {
    header: "Quando",
    cell: (info) => <ProblemWhen item={info.row.original} />,
  }),
  columnHelper.accessor("area", {
    header: "Área",
    cell: (info) => <AreaTag item={info.row.original} />,
  }),
  columnHelper.accessor("message", {
    header: "Problema",
    cell: (info) => (
      <div className="max-w-xl min-w-64">
        <ProblemMessage item={info.row.original} />
      </div>
    ),
  }),
  columnHelper.accessor("occurrences", {
    header: "Repetições",
    cell: (info) => (
      <span className="text-sm whitespace-nowrap tabular-nums">
        {occurrencesLabel(info.getValue())}
      </span>
    ),
  }),
  columnHelper.display({
    id: "account",
    header: "Conta",
    cell: (info) => <ProblemAccount item={info.row.original} />,
  }),
]);

function MobileProblemRow({ row }: { row: ProblemListItem }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <AreaTag item={row} />
        <span className="text-xs text-muted-foreground tabular-nums">
          {occurrencesLabel(row.occurrences)}
        </span>
      </div>
      <ProblemMessage item={row} />
      <p className="text-xs text-muted-foreground">
        <ProblemWhen item={row} />
      </p>
      <ProblemAccount item={row} />
    </div>
  );
}

/** Same rows and columns as the loaded table, so the page does not jump when data arrives. */
function ProblemSkeleton() {
  return (
    <output
      className="surface-card block space-y-3 rounded-3xl bg-card p-5"
      aria-label="Carregando problemas"
    >
      {["a", "b", "c", "d", "e"].map((key) => (
        <div key={key} className="grid grid-cols-[9rem_6rem_1fr_5rem_9rem] items-center gap-4">
          <Skeleton className="h-4" />
          <Skeleton className="h-6" />
          <Skeleton className="h-9" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
        </div>
      ))}
    </output>
  );
}

interface ProblemListProps {
  query: ProblemListQuery;
  showingResolved: boolean;
  filtered: boolean;
  /** "nos últimos 7 dias": the empty state says which period it looked at. */
  periodPhrase: string;
  onClearFilters: () => void;
}

function ProblemEmpty({
  showingResolved,
  filtered,
  periodPhrase,
  onClearFilters,
}: Omit<ProblemListProps, "query">) {
  if (filtered) {
    return (
      <EmptyState
        icon={WarningCircleIcon}
        title={`Nada nesta área ${periodPhrase}`}
        description="Veja todas as áreas ou escolha um período maior."
        action={
          <Button variant="outline" onClick={onClearFilters}>
            Ver todas as áreas
          </Button>
        }
      />
    );
  }
  if (showingResolved) {
    return (
      <EmptyState
        icon={CheckCircleIcon}
        title={`Nenhum problema resolvido ${periodPhrase}`}
        description="Os problemas que a equipe marcar como resolvidos aparecem aqui."
      />
    );
  }
  return (
    <EmptyState
      icon={CheckCircleIcon}
      title={`Nenhum problema em aberto ${periodPhrase}`}
      description="Quando o site ou as tarefas em segundo plano registrarem um erro, ele aparece aqui com o que estava acontecendo."
    />
  );
}

function LoadMore({ query }: { query: ProblemListQuery }) {
  if (!query.hasNextPage) {
    return null;
  }
  return (
    <div className="flex justify-center border-t border-border p-4">
      <Button
        variant="outline"
        disabled={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      >
        {query.isFetchingNextPage ? "Carregando..." : "Mostrar mais antigos"}
      </Button>
    </div>
  );
}

export function ProblemList({
  query,
  showingResolved,
  filtered,
  periodPhrase,
  onClearFilters,
}: ProblemListProps) {
  if (query.isPending) {
    return <ProblemSkeleton />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <ProblemEmpty
        showingResolved={showingResolved}
        filtered={filtered}
        periodPhrase={periodPhrase}
        onClearFilters={onClearFilters}
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={items}
      getRowId={(row) => row.id}
      caption="Problemas registrados"
      renderMobileRow={(row) => <MobileProblemRow row={row} />}
      footer={<LoadMore query={query} />}
    />
  );
}
