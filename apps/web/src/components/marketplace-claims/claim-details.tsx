import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import {
  claimBadge,
  claimNextStep,
  claimReason,
  claimResolution,
  claimReturnLines,
  claimTitle,
  type ClaimReader,
  type ClaimView,
} from "@/features/marketplace-claims/claim-view";

/**
 * One claim as the reader should act on it: what happened, who acts until when, the return and,
 * for the reseller, a way into the sale on Mercado Livre, where claims are answered.
 */
export function ClaimDetails({
  claim,
  reader,
  marketplaceUrl = null,
}: {
  claim: ClaimView;
  reader: ClaimReader;
  /** The sale's page on Mercado Livre; only the reseller can answer there. */
  marketplaceUrl?: string | null;
}) {
  const badge = claimBadge(claim);
  const reason = claimReason(claim.reasonId);
  const nextStep = claimNextStep(claim, reader);
  const resolution = claimResolution(claim);
  const sellerMustAnswer = claim.status === "opened" && claim.actionResponsible === "seller";
  return (
    <article className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{claimTitle(claim.type)}</h3>
        <TonePill tone={badge.tone} label={badge.label} />
      </div>
      {reason === null ? null : <p className="text-sm">Motivo: {reason}</p>}
      {claim.problem === null ? null : (
        <p className="text-sm text-muted-foreground">
          O que o comprador relatou ao Mercado Livre: “{claim.problem}”
        </p>
      )}
      {nextStep === null ? null : <p className="text-sm font-medium">{nextStep}</p>}
      {resolution === null ? null : <p className="text-sm">{resolution}</p>}
      {claimReturnLines(claim, reader).map((line) => (
        <p key={line} className="text-sm">
          {line}
        </p>
      ))}
      {reader === "reseller" && claim.status === "opened" && marketplaceUrl !== null ? (
        <Button asChild variant={sellerMustAnswer ? "default" : "outline"} className="mt-1">
          <a href={marketplaceUrl} target="_blank" rel="noopener noreferrer">
            {sellerMustAnswer ? "Responder no Mercado Livre" : "Ver reclamação no Mercado Livre"}
            <ArrowSquareOutIcon aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </article>
  );
}
