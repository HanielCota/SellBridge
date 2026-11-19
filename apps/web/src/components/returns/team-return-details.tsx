import type { ReturnClaimView } from "@sellbridge/database/repositories";
import { ClosedOutcome, ReturnStepPill, StatedReason, SupplierFinding } from "./return-parts";

/** For the team: both sides' versions and photos, so a dispute is decided by evidence. */
export function TeamReturnDetails({
  claim,
  policy,
}: {
  claim: ReturnClaimView;
  policy: NonNullable<ReturnClaimView["policy"]>;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <ReturnStepPill policy={policy} />
      </div>
      <ClosedOutcome
        policy={policy}
        status={claim.status}
        creditedCents={claim.creditedCents}
        refusalReason={claim.refusalReason}
      />
      {policy.reason === null ? (
        <p className="text-sm text-muted-foreground">
          O revendedor não contou o motivo: conta como desistência do comprador.
        </p>
      ) : (
        <StatedReason policy={policy} title="O que o revendedor contou" />
      )}
      <SupplierFinding policy={policy} viewer="team" />
    </div>
  );
}
