import { useQuery } from "@tanstack/react-query";
import { sortClaims } from "@/features/marketplace-claims/claim-view";
import { supplierParcelClaimsQueryOptions } from "@/features/marketplace-claims/claims.queries";
import { ClaimDetails } from "./claim-details";

/**
 * The buyer's claims on the order of one of the supplier's parcels: the reseller answers them, the
 * supplier follows what happened and whether the parcel comes back. A failed load stays quiet:
 * the parcel's tracking right below is what this screen is for.
 */
export function SupplierParcelClaims({
  supplierId,
  shipmentId,
}: {
  supplierId: string;
  shipmentId: string;
}) {
  const query = useQuery(supplierParcelClaimsQueryOptions(supplierId, shipmentId));
  if (query.data === undefined || query.data.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby={`parcel-claims-${shipmentId}`}
      className="space-y-4 rounded-3xl border border-destructive/25 p-4"
    >
      <h3 id={`parcel-claims-${shipmentId}`} className="text-xs text-muted-foreground">
        Reclamação no Mercado Livre
      </h3>
      {sortClaims(query.data).map((claim) => (
        <ClaimDetails key={claim.externalClaimId} claim={claim} reader="supplier" />
      ))}
    </section>
  );
}
