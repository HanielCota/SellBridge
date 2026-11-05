import { useState } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { useStoreOpen } from "@/features/supplier-panel/store/use-store-open";
import { cn } from "@/lib/utils";

const CLOSE_DESCRIPTION =
  "Enquanto estiver fechada, os anúncios dos revendedores ficam sem estoque nos marketplaces e não entram pedidos novos. Os pedidos que você já recebeu continuam na fila. Quando reabrir, o estoque volta sozinho para todos os anúncios.";

/**
 * "Loja aberta" on the panel home. Closing asks first, since every reseller listing stops
 * selling; opening needs no confirmation, as the stock simply comes back.
 */
export function StoreOpenSwitch({ supplierId, closed }: { supplierId: string; closed: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const storeOpen = useStoreOpen(supplierId, () => setConfirming(false));
  const label = closed ? "Loja fechada" : "Loja aberta";
  return (
    <>
      <label
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium",
          closed
            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
        )}
      >
        <Switch
          checked={!closed}
          disabled={storeOpen.isPending}
          aria-label="Loja aberta para vendas"
          onCheckedChange={(open) => {
            if (open) {
              storeOpen.mutate(true);
              return;
            }
            setConfirming(true);
          }}
        />
        {label}
      </label>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Fechar a loja para vendas?"
        description={CLOSE_DESCRIPTION}
        confirmLabel="Fechar loja"
        pendingLabel="Fechando…"
        isPending={storeOpen.isPending}
        onConfirm={() => storeOpen.mutate(false)}
      />
    </>
  );
}
