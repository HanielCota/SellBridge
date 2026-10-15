import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysSection } from "@/components/integrations/api-keys-section";
import { IntegrationsLayout } from "@/components/integrations/integrations-layout";
import { IntegrationsLockContext } from "@/components/integrations/integrations-lock";
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
  const { session } = Route.useRouteContext();
  const isImpersonating = session.impersonatedBy !== null;
  return (
    <IntegrationsLockContext value={isImpersonating}>
      <IntegrationsLayout>
        {isImpersonating ? (
          <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
            Chaves de API e webhooks ficam travados enquanto você usa o app como este cliente.
          </p>
        ) : null}
        <ApiKeysSection />
        <WebhooksSection />
      </IntegrationsLayout>
    </IntegrationsLockContext>
  );
}
