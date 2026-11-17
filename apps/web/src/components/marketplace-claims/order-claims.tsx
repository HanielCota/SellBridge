import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/feedback/error-state";
import { sortClaims } from "@/features/marketplace-claims/claim-view";
import { orderClaimsQueryOptions } from "@/features/marketplace-claims/claims.queries";
import { errorMessage } from "@/lib/errors";
import { ClaimDetails } from "./claim-details";

/**
 * The buyer's claims on the order, at the top of its page: a claim has a deadline, so it is read
 * before anything else. Nothing shows while the order has none.
 */
export function OrderClaims({
  orderId,
  marketplaceUrl,
}: {
  orderId: string;
  marketplaceUrl: string | null;
}) {
  const query = useQuery(orderClaimsQueryOptions(orderId));
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.isPending || query.data.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="order-claims"
      className="surface-card space-y-5 rounded-3xl border border-destructive/25 bg-card p-5"
    >
      <h2 id="order-claims" className="text-xs text-muted-foreground">
        Reclamação no Mercado Livre
      </h2>
      {sortClaims(query.data).map((claim) => (
        <ClaimDetails
          key={claim.externalClaimId}
          claim={claim}
          reader="reseller"
          marketplaceUrl={marketplaceUrl}
        />
      ))}
    </section>
  );
}
