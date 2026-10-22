import type { ReturnClaimView } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import type { ReturnClaimStatus } from "@sellbridge/shared/return-claims";
import { TONE_DOT_CLASSES, type StatusTone } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";

/** What every reader of a claim sees; the reseller's name and the decider stay with the team. */
export type ReturnClaimSummary = Omit<ReturnClaimView, "sellerName" | "decidedByName">;

const CLAIM_TONES: Record<ReturnClaimStatus, StatusTone> = {
  in_review: "warning",
  credited: "success",
  refused: "muted",
};

/** The decision in one line, with the amount or the reason. */
export function claimOutcomeText(claim: ReturnClaimSummary): string {
  if (claim.status === "credited") {
    return `${formatCents(claim.creditedCents ?? 0)} creditado ao revendedor`;
  }
  if (claim.status === "refused") {
    return `Não creditado: ${claim.refusalReason ?? ""}`;
  }
  return "Em análise pela equipe SellBridge";
}

/** A dot in the status color plus the words, so the meaning never rests on color alone. */
export function ClaimStatusLine({
  status,
  children,
  className,
}: {
  status: ReturnClaimStatus;
  children: string;
  className?: string;
}) {
  return (
    <p className={cn("flex items-start gap-2.5 text-sm", className)}>
      <span
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT_CLASSES[CLAIM_TONES[status]])}
        aria-hidden="true"
      />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/** "2 × Tênis - Preto 40": what came back, the way the supplier packed it. */
export function ClaimItems({ items }: { items: ReturnClaimSummary["items"] }) {
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={`${item.sku}-${item.title}`} className="flex gap-2">
          <span className="shrink-0 text-muted-foreground tabular-nums">{item.quantity} ×</span>
          <span className="min-w-0 break-words">{item.title}</span>
        </li>
      ))}
    </ul>
  );
}
