import { useQuery } from "@tanstack/react-query";
import { orderReturnsQueryOptions } from "@/features/returns/returns.queries";
import { SellerReturnCard } from "./seller-return-card";

/**
 * The order's returns under the policy, above the items: when a parcel comes back, telling the
 * supplier why is the first thing to do. Orders without one show nothing.
 */
export function OrderReturns({ orderId, returned }: { orderId: string; returned: boolean }) {
  const query = useQuery({ ...orderReturnsQueryOptions(orderId), enabled: returned });
  const returns = query.data ?? [];
  if (returns.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="order-returns">
      <h2 id="order-returns" className="mb-3 text-xs text-muted-foreground">
        Devolução
      </h2>
      <div className="grid gap-4">
        {returns.map((claim) => (
          <SellerReturnCard key={claim.claimId} claim={claim} orderId={orderId} />
        ))}
      </div>
    </section>
  );
}
