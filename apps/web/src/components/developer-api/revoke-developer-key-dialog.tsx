import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useRevokeDeveloperKey } from "@/features/developer-api/use-revoke-developer-key";

export interface DeveloperKeyToRevoke {
  id: string;
  name: string;
}

/** Confirms revoking a key, saying what stops working; open while `developerKey` is set. */
export function RevokeDeveloperKeyDialog({
  developerKey,
  onClose,
}: {
  developerKey: DeveloperKeyToRevoke | null;
  onClose: () => void;
}) {
  const mutation = useRevokeDeveloperKey(onClose);
  return (
    <ConfirmDialog
      open={developerKey !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Revogar a chave “${developerKey?.name ?? ""}”?`}
      description="O projeto que usa esta chave para de ler os dados na hora, e isso não pode ser desfeito. Para voltar, crie uma chave nova e troque no projeto."
      confirmLabel="Revogar chave"
      pendingLabel="Revogando…"
      destructive
      isPending={mutation.isPending}
      onConfirm={() => {
        if (developerKey === null) {
          return;
        }
        mutation.mutate(developerKey.id);
      }}
    />
  );
}
