import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ErrorState } from "@/components/feedback/error-state";
import { OrderPageView } from "@/components/orders/order-page";
import { Skeleton } from "@/components/ui/skeleton";
import { orderPageQueryOptions } from "@/features/orders/orders.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/pedidos/$orderId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, orderPageQueryOptions(params.orderId)),
  head: () => ({ meta: [{ title: "Pedido | SellBridge" }] }),
  component: OrderPage,
});

function OrderPage() {
  const { orderId } = Route.useParams();
  const query = useQuery(orderPageQueryOptions(orderId));
  if (query.isPending) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-96 rounded-3xl" aria-label="Carregando pedido" />
        <Skeleton className="hidden h-72 rounded-3xl lg:block" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <OrderPageView page={query.data} />;
}
