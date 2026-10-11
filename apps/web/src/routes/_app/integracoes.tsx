import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysSection } from "@/components/integrations/api-keys-section";
import { IntegrationsLayout } from "@/components/integrations/integrations-layout";
import { WebhooksSection } from "@/components/integrations/webhooks-section";
import { apiKeysQueryOptions } from "@/features/public-api/api-keys.queries";
import { webhookEndpointsQueryOptions } from "@/features/public-api/webhooks.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/integracoes")({
  loader: ({ context }) =>
    Promise.all([
      prefetchOnServer(context.queryClient, apiKeysQueryOptions()),
      prefetchOnServer(context.queryClient, webhookEndpointsQueryOptions()),
    ]),
  head: () => ({ meta: [{ title: "Integrações | SellBridge" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <IntegrationsLayout>
      <ApiKeysSection />
      <WebhooksSection />
    </IntegrationsLayout>
  );
}
