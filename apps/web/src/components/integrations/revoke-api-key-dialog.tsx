import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useRevokeApiKey } from "@/features/public-api/use-revoke-api-key";

export interface ApiKeyToRevoke {
  id: string;
  name: string;
}

/** Confirms revoking a key; open while `apiKey` is set. */
export function RevokeApiKeyDialog({
  apiKey,
  onClose,
}: {
  apiKey: ApiKeyToRevoke | null;
  onClose: () => void;
}) {
  const mutation = useRevokeApiKey(onClose);
  return (
    <ConfirmDialog
      open={apiKey !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Revogar a chave “${apiKey?.name ?? ""}”?`}
      description="As integrações que usam esta chave param de funcionar na hora, e isso não pode ser desfeito. Para voltar a integrar, crie uma chave nova."
      confirmLabel="Revogar chave"
      pendingLabel="Revogando..."
      destructive
      isPending={mutation.isPending}
      onConfirm={() => {
        if (!apiKey) {
          return;
        }
        mutation.mutate(apiKey.id);
      }}
    />
  );
}
