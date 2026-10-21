import { useQuery } from "@tanstack/react-query";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ErrorState } from "@/components/feedback/error-state";
import { OrderPageView } from "@/components/orders/order-page";
import { Skeleton } from "@/components/ui/skeleton";
import { fulfillmentQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import { orderPageQueryOptions } from "@/features/orders/orders.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/pedidos/$orderId")({
  // Set by the operations list: "← Pedidos" then goes back to it, filters and all.
  validateSearch: z.object({ back: optionalParameter(z.enum(["operations"])) }),
  // The shipping section has its own query: started together, not after the page data arrives.
  loader: async ({ context, params }) => {
    await Promise.all([
      prefetchOnServer(context.queryClient, orderPageQueryOptions(params.orderId)),
      prefetchOnServer(context.queryClient, fulfillmentQueryOptions(params.orderId)),
    ]);
  },
  head: () => ({ meta: [{ title: "Pedido | SellBridge" }] }),
  component: OrderPage,
});

function OrderPage() {
  const { orderId } = Route.useParams();
  const query = useQuery(orderPageQueryOptions(orderId));
  if (query.isPending) {
    return (
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
