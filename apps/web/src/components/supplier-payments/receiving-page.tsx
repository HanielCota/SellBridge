import { ESCROW_RELEASE_DELAY_IN_DAYS } from "@sellbridge/shared/escrow-release";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { asaasReceivingQueryOptions } from "@/features/supplier-payments/asaas.queries";
import { formatFeePercent } from "@/features/supplier-payments/fee-percent";
import { paymentAccountQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";
import { errorMessage } from "@/lib/errors";
import { AsaasReceivingCard } from "./asaas-receiving-card";

/**
 * The supplier opens the Asaas account that receives the resellers' payments. Mercado Pago is
 * hidden since 18/11/2026 (see `mercado-pago-account-card.tsx`).
 */
export function ReceivingPage({ supplierId }: { supplierId: string }) {
  const feeQuery = useQuery(paymentAccountQueryOptions(supplierId));
  const asaasQuery = useQuery(asaasReceivingQueryOptions(supplierId));
  const failed = [feeQuery, asaasQuery].find((query) => query.isError) ?? null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Receber pagamentos"
        description={`Os revendedores pagam você pelo Asaas. O valor fica guardado e é liberado ${ESCROW_RELEASE_DELAY_IN_DAYS} dias depois da entrega.`}
      />
      {failed === null ? null : (
        <ErrorState message={errorMessage(failed.error)} onRetry={() => void failed.refetch()} />
      )}
      {failed === null && (feeQuery.data === undefined || asaasQuery.data === undefined) ? (
        <Skeleton className="h-44 max-w-3xl rounded-3xl" />
      ) : null}
      {feeQuery.data === undefined || asaasQuery.data === undefined ? null : (
        <AsaasReceivingCard
          supplierId={supplierId}
          view={asaasQuery.data}
          fee={formatFeePercent(feeQuery.data.feeBasisPoints)}
          emphasis="default"
        />
      )}
    </div>
  );
}
