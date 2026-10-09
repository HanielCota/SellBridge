import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog open={store !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconectar {store?.name ?? "loja"}?</DialogTitle>
          <DialogDescription>
            Os anúncios já publicados continuam no marketplace, mas o SellBridge deixa de
            sincronizar estoque, preço e pedidos desta loja.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || store === null}
            onClick={() => {
              if (!store) {
                return;
              }
              mutation.mutate(store.id);
            }}
          >
            {mutation.isPending ? "Desconectando..." : "Desconectar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
