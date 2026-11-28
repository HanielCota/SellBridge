import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { CreateWebhookDialog } from "@/components/integrations/create-webhook-dialog";
import {
  DeleteWebhookDialog,
  type WebhookToDelete,
} from "@/components/integrations/delete-webhook-dialog";
import { CompactEmpty, IntegrationsSection } from "@/components/integrations/integrations-layout";
import { WebhookEndpointList } from "@/components/integrations/webhook-endpoint-list";
import {
  INTEGRATIONS_LOCKED_REASON,
  useIntegrationsLocked,
} from "@/components/integrations/integrations-lock";
import { Button } from "@/components/ui/button";
import { DisabledHint } from "@/components/ui/hint";
import { Skeleton } from "@/components/ui/skeleton";
import { webhookEndpointsQueryOptions } from "@/features/public-api/webhooks.queries";
import { errorMessage } from "@/lib/errors";

function WebhooksContent({
  onCreate,
  onDelete,
}: {
  onCreate: () => void;
  onDelete: (endpoint: WebhookToDelete) => void;
}) {
  const query = useQuery(webhookEndpointsQueryOptions());
  const locked = useIntegrationsLocked();
  if (query.isPending) {
    return (
      <Skeleton className="h-40 rounded-3xl" aria-busy="true" aria-label="Carregando webhooks" />
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.length === 0) {
    return (
      <CompactEmpty
        text="Nenhum aviso automático cadastrado ainda."
        action={
          <DisabledHint reason={locked ? INTEGRATIONS_LOCKED_REASON : undefined}>
            <Button variant="outline" disabled={locked} onClick={onCreate}>
              <PlusIcon aria-hidden="true" />
              Novo webhook
            </Button>
          </DisabledHint>
        }
      />
    );
  }
  return (
    <WebhookEndpointList
      endpoints={query.data}
      onDelete={(endpoint) => onDelete({ id: endpoint.id, url: endpoint.url })}
    />
  );
}

/** Endpoints that receive the organization's events: list, create (secret shown once), toggle, delete. */
export function WebhooksSection() {
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WebhookToDelete | null>(null);
  const locked = useIntegrationsLocked();
  // With no endpoint yet the empty line carries the button; a second one beside the title repeats it.
  const hasEndpoints = (useQuery(webhookEndpointsQueryOptions()).data?.length ?? 0) > 0;
  return (
    <IntegrationsSection
      id="webhooks"
      title="Avisos automáticos (webhooks)"
      description="O SellBridge avisa o seu sistema a cada pedido ou mudança de anúncio. Se o aviso não chegar, tentamos de novo."
      level={3}
      action={
        hasEndpoints ? (
          <DisabledHint reason={locked ? INTEGRATIONS_LOCKED_REASON : undefined}>
            <Button
              variant="outline"
              size="sm"
              disabled={locked}
              onClick={() => setIsCreating(true)}
            >
              <PlusIcon aria-hidden="true" />
              Novo webhook
            </Button>
          </DisabledHint>
        ) : undefined
      }
    >
      <WebhooksContent onCreate={() => setIsCreating(true)} onDelete={setPendingDelete} />
      <CreateWebhookDialog open={isCreating} onOpenChange={setIsCreating} />
      <DeleteWebhookDialog endpoint={pendingDelete} onClose={() => setPendingDelete(null)} />
    </IntegrationsSection>
  );
}
