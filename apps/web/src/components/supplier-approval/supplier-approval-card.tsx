import type { SupplierApprovalState } from "@sellbridge/database/repositories";
import {
  APPROVAL_MISSING_LABELS,
  APPROVAL_TEAM_REASON_LABELS,
} from "@sellbridge/shared/supplier-approval";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/layout/section-card";
import { supplierApprovalStateQueryOptions } from "@/features/supplier-approval/approval.queries";
import { ApprovalDecision, ApproveRefusedSupplier } from "./approval-decision";

/** What the automatic check is waiting for, in the team's words. */
function pendingExplanation(state: SupplierApprovalState): string {
  if (state.stage === "needs_team" && state.teamReason !== null) {
    return `A conferência automática parou: ${APPROVAL_TEAM_REASON_LABELS[state.teamReason]}. Confira e decida.`;
  }
  if (state.stage === "waiting_supplier" && state.missing.length > 0) {
    const missing = state.missing.map((item) => APPROVAL_MISSING_LABELS[item]).join("; ");
    return `Esperando o fornecedor: ${missing}. Assim que ele completar, a aprovação é automática.`;
  }
  return "Consultando o CNPJ na Receita. A aprovação é automática se estiver tudo certo.";
}

/**
 * On the supplier's record, while it is not approved: where the check stands and the team's
 * decision. Hidden for approved suppliers, which are all the team-created ones.
 */
export function SupplierApprovalCard({
  supplierId,
  supplierName,
}: {
  supplierId: string;
  supplierName: string;
}) {
  const query = useQuery(supplierApprovalStateQueryOptions(supplierId));
  const state = query.data;
  if (state === undefined || state.status === "approved") {
    return null;
  }
  if (state.status === "refused") {
    return (
      <SectionCard
        title="Cadastro recusado"
        description="O fornecedor não aparece para os revendedores e não cadastra produtos novos."
      >
        <div className="grid gap-4">
          <p className="text-sm">
            <span className="text-muted-foreground">Motivo que ele lê no painel: </span>
            <span className="font-medium">{state.refusalReason ?? "Sem motivo registrado"}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Se ele resolveu o motivo (por exemplo, mostrou que a empresa já saiu do MEI), aprove por
            aqui.
          </p>
          <ApproveRefusedSupplier supplierId={supplierId} supplierName={supplierName} />
        </div>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title="Cadastro em análise"
      description="Enquanto isso, o fornecedor monta a marca e os produtos, mas os revendedores não o veem."
    >
      <div className="grid gap-4">
        <p className="text-sm">{pendingExplanation(state)}</p>
        <ApprovalDecision supplierId={supplierId} supplierName={supplierName} />
      </div>
    </SectionCard>
  );
}
