import { formatCents } from "@sellbridge/shared/money";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { RETURN_EVIDENCE_PROMPT, supplierCreditText } from "@sellbridge/shared/return-claims";
import { ReturnStepPill } from "@/components/returns/return-parts";
import { SupplierReturnPanel } from "@/components/returns/supplier-return-panel";
import {
  ClaimItems,
  ClaimStatusLine,
  claimOutcomeText,
  type ReturnClaimSummary,
} from "./return-claim-parts";

/** What the supplier is asked to show, so the team can tell misuse, damage or a wrong item. */
function EvidencePrompt() {
  return (
    <div className="space-y-1 rounded-2xl bg-muted px-4 py-3">
      <p className="text-sm font-semibold">{RETURN_EVIDENCE_PROMPT}.</p>
      <p className="text-sm text-muted-foreground">
        Mostre a embalagem, a etiqueta e o estado do produto: sinais de uso, defeito ou item
        trocado. Anexe as fotos na mensagem logo abaixo.
      </p>
    </div>
  );
}

function SupplierClaimBody({ claim }: { claim: ReturnClaimSummary }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        O comprador devolveu o pedido{" "}
        <span className="font-medium text-foreground">{claim.externalOrderId}</span>. A equipe
        SellBridge decide se o revendedor recebe de volta o custo que pagou por estes itens.
      </p>
      <ClaimItems items={claim.items} />
      <p className="text-sm text-muted-foreground tabular-nums">
        Custo pago pelo revendedor: {formatCents(claim.supplierCostCents)}
      </p>
      <ClaimStatusLine status={claim.status}>{claimOutcomeText(claim)}</ClaimStatusLine>
      {claim.status === "in_review" ? <EvidencePrompt /> : null}
    </>
  );
}

function SellerClaimBody({ claim }: { claim: ReturnClaimSummary }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        O comprador devolveu o pedido{" "}
        <span className="font-medium text-foreground">{claim.externalOrderId}</span>. A equipe
        SellBridge vai ver com o fornecedor se ele devolve o custo que você pagou (
        {formatCents(claim.supplierCostCents)}).
      </p>
      <ClaimItems items={claim.items} />
      <ClaimStatusLine status={claim.status}>{supplierCreditText(claim)}</ClaimStatusLine>
    </>
  );
}

/** Under the return policy: the deadline, the reseller's reason and the supplier's answer. */
function SupplierPolicyBody({
  claim,
  policy,
}: {
  claim: ReturnClaimSummary;
  policy: NonNullable<ReturnClaimSummary["policy"]>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          O comprador devolveu o pedido{" "}
          <span className="font-medium text-foreground">{claim.externalOrderId}</span>.
        </p>
        <ReturnStepPill policy={policy} />
      </div>
      <ClaimItems items={claim.items} />
      <p className="text-sm text-muted-foreground tabular-nums">
        Custo pago pelo revendedor: {formatCents(claim.supplierCostCents)}
      </p>
      <SupplierReturnPanel claim={{ ...claim, policy }} />
    </>
  );
}

function supplierBody(claim: ReturnClaimSummary) {
  if (claim.policy === null) {
    return <SupplierClaimBody claim={claim} />;
  }
  return <SupplierPolicyBody claim={claim} policy={claim.policy} />;
}

/**
 * On a return's ticket, above the conversation: which order came back, what it was, and where
 * the credit stands. The supplier is asked for photos; nothing here names the reseller.
 */
export function ReturnClaimCard({
  claim,
  viewer,
}: {
  claim: ReturnClaimSummary;
  viewer: ProfileKind;
}) {
  return (
    <section
      aria-labelledby="return-claim-title"
      className="surface-card space-y-3 rounded-3xl bg-card p-5"
    >
      <h2 id="return-claim-title" className="text-xs text-muted-foreground">
        Devolução
      </h2>
      {viewer === "supplier" ? supplierBody(claim) : <SellerClaimBody claim={claim} />}
    </section>
  );
}
