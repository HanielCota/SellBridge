import { PlusIcon, WebhooksLogoIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { CreateWebhookDialog } from "@/components/integrations/create-webhook-dialog";
import {
  DeleteWebhookDialog,
  type WebhookToDelete,
} from "@/components/integrations/delete-webhook-dialog";
import { IntegrationsSection } from "@/components/integrations/integrations-layout";
import { WebhookEndpointList } from "@/components/integrations/webhook-endpoint-list";
import { Button } from "@/components/ui/button";
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
      <EmptyState
        icon={WebhooksLogoIcon}
        title="Nenhum webhook cadastrado"
        description="Cadastre uma URL para receber pedidos e mudanças de anúncios assim que acontecem, sem precisar consultar a API."
        action={
          <Button onClick={onCreate}>
            <PlusIcon aria-hidden="true" />
            Novo webhook
          </Button>
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
  return (
    <IntegrationsSection
      id="webhooks"
      title="Webhooks"
      description="O SellBridge avisa seu sistema por um POST assinado a cada pedido ou mudança de anúncio. Entregas que falham são tentadas de novo."
      action={
        <Button variant="outline" size="sm" onClick={() => setIsCreating(true)}>
          <PlusIcon aria-hidden="true" />
          Novo webhook
        </Button>
      }
    >
      <WebhooksContent onCreate={() => setIsCreating(true)} onDelete={setPendingDelete} />
      <CreateWebhookDialog open={isCreating} onOpenChange={setIsCreating} />
      <DeleteWebhookDialog endpoint={pendingDelete} onClose={() => setPendingDelete(null)} />
    </IntegrationsSection>
  );
}
