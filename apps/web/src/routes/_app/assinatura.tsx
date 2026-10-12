import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/components/billing/billing-page";
import { billingQueryOptions } from "@/features/billing/billing.queries";
import { prefetchOnServer } from "@/lib/prefetch";
export const Route = createFileRoute("/_app/assinatura")({
  validateSearch: (search: Record<string, unknown>) => ({
    retorno: typeof search.retorno === "string" ? search.retorno : undefined,
  }),
  loader: ({ context }) => prefetchOnServer(context.queryClient, billingQueryOptions()),
  head: () => ({ meta: [{ title: "Planos e assinatura | SellBridge" }] }),
  component: SubscriptionPage,
});
function SubscriptionPage() {
  const { retorno } = Route.useSearch();
  return <BillingPage returned={retorno} />;
}
