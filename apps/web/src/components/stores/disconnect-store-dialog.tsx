import { useState } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useDisconnectStore } from "@/features/stores/use-disconnect-store";

export interface StoreToDisconnect {
  id: string;
  name: string;
}

const PAUSE_OPTION_ID = "disconnect-pause-listings";

/**
 * Pausing is on by default: after disconnecting, a listing that stays live keeps selling with no
 * stock sync, so the seller could sell what the supplier no longer has.
 */
function PauseListingsOption({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
      <Checkbox
        id={PAUSE_OPTION_ID}
        checked={checked}
        onCheckedChange={(state) => onCheckedChange(state === true)}
        className="mt-0.5"
      />
      <div className="grid min-w-0 gap-1">
        <Label htmlFor={PAUSE_OPTION_ID} className="leading-snug">
          Pausar os anúncios desta loja no marketplace
        </Label>
        <p className="text-footnote text-muted-foreground">
          O SellBridge zera o estoque de cada anúncio antes de desconectar, para não vender sem
          estoque. Depois de reconectar, reative os anúncios em Publicações.
        </p>
      </div>
    </div>
  );
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
  const [pauseListings, setPauseListings] = useState(true);
  return (
    <ConfirmDialog
      open={store !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Desconectar ${store?.name ?? "loja"}?`}
      description="O SellBridge deixa de sincronizar estoque, preço e pedidos desta loja."
      confirmLabel="Desconectar"
      pendingLabel={pauseListings ? "Pausando e desconectando…" : "Desconectando…"}
      isPending={mutation.isPending}
      destructive
      onConfirm={() => {
        if (store === null) {
          return;
        }
        mutation.mutate({ storeConnectionId: store.id, pauseListings });
      }}
    >
      <PauseListingsOption checked={pauseListings} onCheckedChange={setPauseListings} />
    </ConfirmDialog>
  );
}
