import type { AuditEntry, AuditPage } from "@sellbridge/database/repositories";
import { Link } from "@tanstack/react-router";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus, type StatusTone } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AUDIT_SOURCE_LABELS, describeAuditEntry } from "@/features/admin-audit/audit-copy";
import { errorMessage } from "@/lib/errors";

/** Each source keeps its own dot, so a long trail reads by area at a glance. */
const SOURCE_TONES: Record<AuditEntry["source"], StatusTone> = {
  account: "info",
  catalog: "success",
  support: "warning",
};

/** What the entry was about, linked to where the team handles it when there is such a page. */
function AuditSubject({ entry }: { entry: AuditEntry }) {
  const label = entry.subjectLabel ?? "Removido";
  const id = entry.subjectId;
  const className = "font-medium underline-offset-4 hover:underline";
  if (id !== null && entry.source === "account") {
    return (
      <Link to="/admin/clientes/$userId" params={{ userId: id }} className={className}>
        {label}
      </Link>
    );
  }
  if (id !== null && entry.source === "support") {
    return (
      <Link to="/admin/chamados/$ticketId" params={{ ticketId: id }} className={className}>
        {label}
      </Link>
    );
  }
  if (id !== null && entry.entityType === "supplier") {
    return (
      <Link to="/admin/fornecedores/$supplierId" params={{ supplierId: id }} className={className}>
        {label}
      </Link>
    );
  }
  return <span className="font-medium">{label}</span>;
}

function AuditAction({ entry }: { entry: AuditEntry }) {
  return (
    <div className="min-w-56 space-y-1">
      <p className="font-medium">{describeAuditEntry(entry)}</p>
      <ToneStatus tone={SOURCE_TONES[entry.source]} label={AUDIT_SOURCE_LABELS[entry.source]} />
    </div>
  );
}

const columnHelper = createServerColumnHelper<AuditEntry>();
const columns = columnHelper.columns([
  columnHelper.accessor("createdAt", {
    header: "Quando",
    cell: (info) => (
      <SmartDate date={new Date(info.getValue())} className="text-sm whitespace-nowrap" />
    ),
  }),
  columnHelper.accessor("actorName", {
    header: "Quem",
    cell: (info) => (
      <span className={info.getValue() === null ? "text-muted-foreground" : undefined}>
        {info.getValue() ?? "Usuário removido"}
      </span>
    ),
  }),
  columnHelper.display({
    id: "action",
    header: "O que fez",
    cell: (info) => <AuditAction entry={info.row.original} />,
  }),
  columnHelper.display({
    id: "subject",
    header: "Sobre",
    cell: (info) => <AuditSubject entry={info.row.original} />,
  }),
]);

function MobileAuditRow({ row }: { row: AuditEntry }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-medium">{describeAuditEntry(row)}</p>
        <SmartDate
          date={new Date(row.createdAt)}
          className="shrink-0 text-xs text-muted-foreground"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {row.actorName ?? "Usuário removido"} · <AuditSubject entry={row} />
      </p>
      <ToneStatus tone={SOURCE_TONES[row.source]} label={AUDIT_SOURCE_LABELS[row.source]} />
    </div>
  );
}

/** Same rows and columns as the loaded table, so the page does not jump when data arrives. */
function AuditSkeleton() {
  return (
    <output
      className="surface-card block space-y-3 rounded-3xl bg-card p-5"
      aria-label="Carregando auditoria"
    >
      {["a", "b", "c", "d", "e", "f"].map((key) => (
        <div key={key} className="grid grid-cols-[6rem_8rem_1fr_10rem] items-center gap-4">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-9" />
          <Skeleton className="h-4" />
        </div>
      ))}
    </output>
  );
}

interface AuditTableProps {
  query: UseQueryResult<AuditPage>;
  filtered: boolean;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
}

/** No rows: a page past the end (an old link) offers the way back; otherwise why it is empty. */
function AuditEmpty({
  data,
  filtered,
  onClearFilters,
  onPageChange,
}: Omit<AuditTableProps, "query"> & { data: AuditPage }) {
  if (data.total > 0) {
    const pages = `${data.totalPages} ${data.totalPages === 1 ? "página" : "páginas"}`;
    return (
      <EmptyState
        icon={ClockCounterClockwiseIcon}
        title="Esta página não existe mais"
        description={`A auditoria tem ${pages} com esses filtros.`}
        action={
          <Button variant="outline" onClick={() => onPageChange(1)}>
            Ir para a primeira página
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={ClockCounterClockwiseIcon}
      title={filtered ? "Nada com esses filtros" : "Nenhuma ação registrada ainda"}
      description={
        filtered
          ? "Limpe a busca ou escolha outra área."
          : "O que a equipe fizer em contas, no catálogo e nos chamados aparece aqui."
      }
      action={
        filtered ? (
          <Button variant="outline" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        ) : undefined
      }
    />
  );
}

export function AuditTable({ query, filtered, onClearFilters, onPageChange }: AuditTableProps) {
  if (query.isPending) {
    return <AuditSkeleton />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <AuditEmpty
        data={query.data}
        filtered={filtered}
        onClearFilters={onClearFilters}
        onPageChange={onPageChange}
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={query.data.items}
      getRowId={(row) => row.id}
      caption="Ações da equipe"
      renderMobileRow={(row) => <MobileAuditRow row={row} />}
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel={{ one: "ação", other: "ações" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}
