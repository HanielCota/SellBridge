import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useDeleteWebhookEndpoint } from "@/features/public-api/use-delete-webhook-endpoint";

export interface WebhookToDelete {
  id: string;
  url: string;
}

/** Confirms deleting an endpoint; open while `endpoint` is set. */
export function DeleteWebhookDialog({
  endpoint,
  onClose,
}: {
  endpoint: WebhookToDelete | null;
  onClose: () => void;
}) {
  const mutation = useDeleteWebhookEndpoint(onClose);
  return (
    <ConfirmDialog
      open={endpoint !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Excluir este webhook?"
      description={`${endpoint?.url ?? ""} deixa de receber eventos, e as entregas pendentes são descartadas. Para só pausar, desative o webhook.`}
      confirmLabel="Excluir webhook"
      pendingLabel="Excluindo..."
      destructive
      isPending={mutation.isPending}
      onConfirm={() => {
        if (!endpoint) {
          return;
        }
        mutation.mutate(endpoint.id);
      }}
    />
  );
}
