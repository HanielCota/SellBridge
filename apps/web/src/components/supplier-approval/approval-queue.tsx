import type { SupplierAwaitingTeam } from "@sellbridge/database/repositories";
import { formatCnpj } from "@sellbridge/shared/account-documents";
import {
  APPROVAL_TEAM_REASON_LABELS,
  type SupplierApprovalQueueSearch,
} from "@sellbridge/shared/supplier-approval";
import { ArrowSquareOutIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { CopyButton } from "@/components/integrations/copy-button";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierApprovalQueueQueryOptions } from "@/features/supplier-approval/approval.queries";
import { errorMessage } from "@/lib/errors";
import { ApprovalDecision } from "./approval-decision";

/** The Receita's own page, where the team checks a CNPJ the public query could not settle. */
export const RECEITA_CNPJ_PAGE =
  "https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-footnote text-muted-foreground">{label}</dt>
      <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function receitaLine(supplier: SupplierAwaitingTeam): string {
  if (supplier.receitaLegalName === null) {
    return "Sem resposta da Receita";
  }
  const status = supplier.registrationStatus === null ? "" : ` (${supplier.registrationStatus})`;
  return `${supplier.receitaLegalName}${status}`;
}

function QueueItem({ supplier }: { supplier: SupplierAwaitingTeam }) {
  return (
    <li className="surface-card grid gap-4 rounded-3xl bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <Link
            to="/admin/fornecedores/$supplierId"
            params={{ supplierId: supplier.supplierId }}
            className="text-subhead font-semibold underline-offset-4 hover:underline"
          >
            {supplier.name}
          </Link>
          <p className="text-footnote text-muted-foreground">
            Na fila desde <SmartDate date={supplier.waitingSince} />
          </p>
        </div>
        <ToneStatus tone="warning" label={APPROVAL_TEAM_REASON_LABELS[supplier.teamReason]} />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Fact
          label="CNPJ"
          value={supplier.cnpj === null ? "Não informado" : formatCnpj(supplier.cnpj)}
        />
        <Fact label="Razão social informada" value={supplier.typedLegalName ?? "Não informada"} />
        <Fact label="Na Receita" value={receitaLine(supplier)} />
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ApprovalDecision supplierId={supplier.supplierId} supplierName={supplier.name} quiet />
        <div className="flex flex-wrap items-center gap-3">
          {supplier.cnpj === null ? null : <CopyButton value={supplier.cnpj} label="Copiar CNPJ" />}
          <a
            href={RECEITA_CNPJ_PAGE}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-4"
          >
            Conferir no site da Receita
            <ArrowSquareOutIcon aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
    </li>
  );
}

interface ApprovalQueueProps {
  readonly search: SupplierApprovalQueueSearch;
  readonly onPageChange: (page: number) => void;
}

function QueueList({ search, onPageChange }: ApprovalQueueProps) {
  const query = useQuery(supplierApprovalQueueQueryOptions(search));
  if (query.isPending) {
    return (
      <Skeleton className="h-64 rounded-3xl" aria-label="Carregando fornecedores em análise" />
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircleIcon}
        title="Nenhum fornecedor esperando análise"
        description="Quando a conferência automática não conseguir aprovar um cadastro, ele aparece aqui."
      />
    );
  }
  return (
    <div className="grid gap-4" aria-busy={query.isFetching}>
      <ul className="grid gap-4" aria-label="Fornecedores em análise, do mais antigo ao mais novo">
        {query.data.items.map((supplier) => (
          <QueueItem key={supplier.supplierId} supplier={supplier} />
        ))}
      </ul>
      <PaginationBar
        page={query.data.page}
        totalPages={query.data.totalPages}
        total={query.data.total}
        itemLabel={{ one: "fornecedor", other: "fornecedores" }}
        onPageChange={onPageChange}
      />
    </div>
  );
}

/**
 * Suppliers who signed up alone and that the automatic check could not approve (CNPJ not
 * active, another legal name, the query down for an hour), oldest first.
 */
export function ApprovalQueue(props: ApprovalQueueProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink to="/admin/fornecedores" label="Fornecedores" />}
        title="Fornecedores em análise"
        description="Cadastros que a conferência automática não conseguiu aprovar. Confira o CNPJ e decida: aprovado, o fornecedor aparece para os revendedores."
      />
      <QueueList {...props} />
    </div>
  );
}
