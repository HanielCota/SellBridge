import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useDisconnectStore } from "@/features/stores/use-disconnect-store";

export interface StoreToDisconnect {
  id: string;
  name: string;
}

/** Confirms disconnecting a store; open while `store` is set. */
export function DisconnectStoreDialog({
  store,
  onClose,
}: {
  store: StoreToDisconnect | null;
  onClose: () => void;
}) {
  const mutation = useDisconnectStore(onClose);
  return (
    <ConfirmDialog
      open={store !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Desconectar ${store?.name ?? "loja"}?`}
      description="Os anúncios já publicados continuam no marketplace, mas o SellBridge deixa de sincronizar estoque, preço e pedidos desta loja."
      confirmLabel="Desconectar"
      pendingLabel="Desconectando…"
      isPending={mutation.isPending}
      destructive
      onConfirm={() => {
        if (store === null) {
          return;
        }
        mutation.mutate(store.id);
      }}
    />
  );
}
