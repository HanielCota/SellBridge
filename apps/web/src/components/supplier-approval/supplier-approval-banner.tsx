import type { SupplierApprovalState } from "@sellbridge/database/repositories";
import {
  APPROVAL_MISSING_LABELS,
  APPROVAL_TEAM_REASON_SUPPLIER_TEXT,
  type ApprovalMissingItem,
} from "@sellbridge/shared/supplier-approval";
import { HourglassIcon, ProhibitIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const LINK_CLASS = "inline-flex min-h-11 items-center font-medium underline underline-offset-4";

function MissingItem({ item }: { item: ApprovalMissingItem }) {
  if (item === "receiving_account") {
    return (
      <li>
        <Link to="/fornecedor/painel/recebimentos" className={LINK_CLASS}>
          {APPROVAL_MISSING_LABELS[item]}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <Link to="/fornecedor/painel/marca" hash="brand-fiscal-cnpj" className={LINK_CLASS}>
        {APPROVAL_MISSING_LABELS[item]}
      </Link>
    </li>
  );
}

function PendingDetail({ approval }: { approval: SupplierApprovalState }) {
  if (approval.stage === "waiting_supplier" && approval.missing.length > 0) {
    return (
      <>
        <p>Para aprovar, falta só isto:</p>
        <ul className="grid gap-1">
          {approval.missing.map((item) => (
            <MissingItem key={item} item={item} />
          ))}
        </ul>
      </>
    );
  }
  if (approval.stage === "needs_team" && approval.teamReason !== null) {
    return (
      <p>
        {APPROVAL_TEAM_REASON_SUPPLIER_TEXT[approval.teamReason]}. A equipe SellBridge vai conferir
        seu cadastro. Se o CNPJ ou a razão social estiverem errados, corrija em{" "}
        <Link to="/fornecedor/painel/marca" hash="brand-fiscal-cnpj" className={LINK_CLASS}>
          Dados fiscais da empresa
        </Link>
        .
      </p>
    );
  }
  return <p>Estamos consultando seu CNPJ na Receita. Isso leva alguns minutos.</p>;
}

/**
 * On every panel page while the brand is not approved: what resellers see (nothing yet), what
 * the supplier may already do (its catalog) and what is missing, each item one tap from where
 * it is fixed. A refusal shows the team's reason and the way to ask for a review.
 */
export function SupplierApprovalBanner({ approval }: { approval: SupplierApprovalState }) {
  if (approval.status === "refused") {
    return (
      <Alert variant="destructive" role="alert" className="rounded-3xl p-5 sm:p-6">
        <ProhibitIcon aria-hidden="true" />
        <AlertTitle className="text-base font-semibold">
          O cadastro da sua marca foi recusado
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Motivo da equipe SellBridge:{" "}
            <span className="font-medium">{approval.refusalReason ?? "não informado"}</span>
          </p>
          <p>Sua marca não aparece para os revendedores e não dá para cadastrar produtos novos.</p>
          <Link to="/suporte/novo" className={LINK_CLASS}>
            Falar com o suporte
          </Link>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert className="rounded-3xl p-5 sm:p-6">
      <HourglassIcon aria-hidden="true" />
      <AlertTitle className="text-base font-semibold">Sua marca está em análise</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Os revendedores ainda não veem sua marca. Pode cadastrar os produtos: eles aparecem assim
          que a marca for aprovada.
        </p>
        <PendingDetail approval={approval} />
      </AlertDescription>
    </Alert>
  );
}
