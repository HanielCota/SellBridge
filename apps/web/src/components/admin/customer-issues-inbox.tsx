import {
  CUSTOMER_ISSUE_KINDS,
  type CustomerIssueKind,
  type IssueQueue,
} from "@sellbridge/shared/schemas";
import { Link } from "@tanstack/react-router";
import { ClockCountdownIcon, UserIcon } from "@phosphor-icons/react";
import { CustomerIssueRow } from "@/components/admin/customer-issue-row";
import { IssueTriageControls } from "@/components/admin/issue-triage-controls";
import { FilterTabs, type FilterTab } from "@/components/data/filter-tabs";
import { ChecklistDoneIcon } from "@/components/reports/attention-icons";
import { Badge } from "@/components/ui/badge";
import type {
  CustomerIssueEntry,
  IssueCounts,
  QueueCounts,
} from "@/features/admin/customer-ranking";
import { ISSUE_KIND_LABELS } from "@/features/admin/issue-copy";
import { formatAbsoluteTime } from "@/lib/relative-time";

type IssueFilter = CustomerIssueKind | "all";

const QUEUE_LABELS: Record<IssueQueue, string> = {
  open: "Abertas",
  mine: "Comigo",
  snoozed: "Adiadas",
};

const EMPTY_QUEUE: Record<IssueQueue, { title: string; description: string }> = {
  open: {
    title: "Fila zerada",
    description: "Nenhuma loja, publicação, chamado ou cliente parado esperando por você.",
  },
  mine: {
    title: "Nada com você",
    description: "Assuma uma pendência da fila para acompanhá-la aqui.",
  },
  snoozed: {
    title: "Nada adiado",
    description: "Pendências adiadas voltam sozinhas para a fila quando o prazo acaba.",
  },
};

function queueTabs(counts: QueueCounts): FilterTab<IssueQueue>[] {
  return (["open", "mine", "snoozed"] as const).map((queue) => ({
    value: queue,
    label: QUEUE_LABELS[queue],
    count: counts[queue],
  }));
}

function issueTabs(counts: IssueCounts): FilterTab<IssueFilter>[] {
  return [
    { value: "all", label: "Todos os tipos" },
    ...CUSTOMER_ISSUE_KINDS.map((kind) => ({
      value: kind,
      label: ISSUE_KIND_LABELS[kind],
      count: counts[kind],
    })),
  ];
}

function QueueClear({ queue }: { queue: IssueQueue }) {
  const copy = EMPTY_QUEUE[queue];
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
        <ChecklistDoneIcon className="size-6 text-emerald-600 dark:text-emerald-400" />
      </span>
      <p className="max-w-72 text-sm text-muted-foreground">
        <span className="block text-subhead font-medium text-foreground">{copy.title}</span>
        {copy.description}
      </p>
    </div>
  );
}

interface EntryProps {
  entry: CustomerIssueEntry;
  adminId: string;
  /** The server only puts still-sleeping issues in the snoozed queue. */
  snoozed: boolean;
}

/** Who took the issue and until when it sleeps, so two admins never work on the same thing. */
function TriageBadges({ entry, adminId, snoozed }: EntryProps) {
  const { triage } = entry;
  if (!triage) {
    return null;
  }
  const snoozedUntil = snoozed ? triage.snoozedUntil : null;
  const isMine = triage.assigneeId === adminId;
  return (
    <>
      {triage.assigneeId ? (
        <Badge variant={isMine ? "default" : "secondary"} className="h-5">
          <UserIcon weight="fill" />
          {isMine ? "Com você" : `Com ${triage.assigneeName ?? "outro admin"}`}
        </Badge>
      ) : null}
      {snoozedUntil ? (
        <Badge variant="secondary" className="h-5">
          <ClockCountdownIcon weight="fill" />
          Volta em {formatAbsoluteTime(snoozedUntil)}
        </Badge>
      ) : null}
    </>
  );
}

function CustomerContext({ entry, adminId, snoozed }: EntryProps) {
  const { customer } = entry;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <Link
        to="/admin/clientes/$userId"
        params={{ userId: customer.id }}
        className="font-medium text-brand-text underline-offset-4 hover:underline"
      >
        {customer.name}
      </Link>
      {customer.city ? (
        <span>
          · {customer.city} - {customer.state}
        </span>
      ) : null}
      <TriageBadges entry={entry} adminId={adminId} snoozed={snoozed} />
    </span>
  );
}

function QueueList({
  entries,
  queue,
  adminId,
}: {
  entries: readonly CustomerIssueEntry[];
  queue: IssueQueue;
  adminId: string;
}) {
  const snoozed = queue === "snoozed";
  if (entries.length === 0) {
    return <QueueClear queue={queue} />;
  }
  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <CustomerIssueRow
          key={`${entry.customer.id}-${entry.issue.kind}`}
          customer={entry.customer}
          issue={entry.issue}
          context={<CustomerContext entry={entry} adminId={adminId} snoozed={snoozed} />}
          controls={
            <IssueTriageControls
              userId={entry.customer.id}
              issue={entry.issue.kind}
              triage={entry.triage}
              adminId={adminId}
              snoozed={snoozed}
            />
          }
        />
      ))}
    </ul>
  );
}

/**
 * The admin team's work queue: every open problem across customers, the most urgent kind first
 * and, inside a kind, the weakest account first. Each row can be taken, snoozed or resolved.
 */
export function CustomerIssuesInbox({
  entries,
  total,
  counts,
  queueCounts,
  queue,
  filter,
  adminId,
  onQueueChange,
  onFilterChange,
}: {
  entries: readonly CustomerIssueEntry[];
  total: number;
  counts: IssueCounts;
  queueCounts: QueueCounts;
  queue: IssueQueue;
  filter: CustomerIssueKind | undefined;
  adminId: string;
  onQueueChange: (queue: IssueQueue) => void;
  onFilterChange: (filter: CustomerIssueKind | undefined) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs<IssueQueue>
          legend="Fila de pendências"
          tabs={queueTabs(queueCounts)}
          value={queue}
          onChange={onQueueChange}
        />
        <FilterTabs<IssueFilter>
          legend="Tipo de pendência"
          tabs={issueTabs(counts)}
          value={filter ?? "all"}
          onChange={(next) => onFilterChange(next === "all" ? undefined : next)}
        />
      </div>
      <section aria-label="Pendências" className="surface-card rounded-3xl bg-card p-3 sm:p-4">
        <QueueList entries={entries} queue={queue} adminId={adminId} />
        {total > entries.length ? (
          <p className="px-2 pt-3 pb-1 text-footnote text-muted-foreground">
            Mostrando as {entries.length} mais urgentes de {total}. Filtre por tipo para ver as
            demais.
          </p>
        ) : null}
      </section>
    </div>
  );
}
