import { useQuery } from "@tanstack/react-query";
import { TrackingParcel } from "@/components/tracking/tracking-parcel";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierParcelTrackingQueryOptions } from "@/features/supplier-panel/orders/orders.queries";
import { errorMessage } from "@/lib/errors";

/** After dispatch the supplier keeps following its parcel, with the same card the reseller sees. */
export function SupplierParcelTracking({
  supplierId,
  shipmentId,
}: {
  supplierId: string;
  shipmentId: string;
}) {
  const query = useQuery(supplierParcelTrackingQueryOptions(supplierId, shipmentId));
  if (query.isPending) {
    return <Skeleton className="h-56 rounded-3xl" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data === null) {
    return null;
  }
  return <TrackingParcel parcel={query.data} reader="supplier" />;
}
